"""
评论 API
"""

from __future__ import annotations

from typing import List, Dict, Tuple
import hashlib
import uuid

from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy import select, update, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ...core.database import get_db
from ...core.deps import get_current_admin
from ...models.admin import Admin
from ...models.article import Article
from ...models.comment import Comment, CommentLike, CommentReport
from ...models.hot_topic import HotTopic
from ...schemas.comment import (
    CommentCreate,
    AdminReplyCreate,
    CommentResponse,
    CommentListResponse,
    CommentPendingResponse,
    CommentReportRequest,
    ReportedCommentResponse,
    CommentReportResponse,
)

router = APIRouter()

SUPPORTED_COMMENT_TARGETS = {"article", "hotspot"}


def generate_default_nickname() -> str:
    """生成默认游客昵称（游客 + 短 UUID）"""
    short_uuid = str(uuid.uuid4())[:8]
    return f"游客_{short_uuid}"


def generate_avatar_url(email: str = None, nickname: str = "") -> str:
    """生成头像 URL（使用 DiceBear API）"""
    seed = email or nickname or "anonymous"
    return f"https://api.dicebear.com/7.x/avataaars/svg?seed={seed}"


def get_user_identifier(request: Request) -> str:
    """获取用户唯一标识（IP + User-Agent 的 hash）"""
    ip = request.client.host if request.client else "unknown"
    ua = request.headers.get("user-agent", "")
    raw = f"{ip}:{ua}"
    return hashlib.md5(raw.encode()).hexdigest()[:32]


def build_comment_tree(comments: List[Comment]) -> List[CommentResponse]:
    """构建评论树（嵌套回复）"""
    comment_dict: Dict[int, CommentResponse] = {}
    root_comments: List[CommentResponse] = []

    # 第一遍：创建所有评论的响应对象
    for comment in comments:
        response = CommentResponse(
            id=comment.id,
            article_id=comment.article_id,
            target_type=comment.target_type,
            target_id=comment.target_id,
            parent_id=comment.parent_id,
            nickname=comment.nickname,
            avatar_url=comment.avatar_url,
            content=comment.content,
            is_admin_reply=comment.is_admin_reply,
            admin_display_name=comment.admin.display_name if comment.admin else None,
            status=comment.status,
            like_count=comment.like_count,
            is_reported=comment.is_reported,
            created_at=comment.created_at,
            replies=[],
        )
        comment_dict[comment.id] = response

    # 第二遍：构建树结构
    for comment in comments:
        response = comment_dict[comment.id]
        if comment.parent_id and comment.parent_id in comment_dict:
            comment_dict[comment.parent_id].replies.append(response)
        else:
            root_comments.append(response)

    return root_comments


async def _resolve_comment_target(
    db: AsyncSession,
    target_type: str,
    target_id: int,
    require_published: bool = True,
):
    normalized_type = (target_type or "").strip().lower()
    if normalized_type not in SUPPORTED_COMMENT_TARGETS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="不支持的评论目标类型，仅支持 article / hotspot",
        )

    if normalized_type == "article":
        query = select(Article).where(Article.id == target_id)
        if require_published:
            query = query.where(Article.status == "published")
        result = await db.execute(query)
        target = result.scalar_one_or_none()
        if not target:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="文章不存在")
        return normalized_type, target

    query = select(HotTopic).where(HotTopic.id == target_id)
    if require_published:
        query = query.where(HotTopic.status == "published")
    result = await db.execute(query)
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="热点不存在")
    return normalized_type, target


async def _recount_article_comment_count(db: AsyncSession, article_id: int | None) -> None:
    if not article_id:
        return

    count_result = await db.execute(
        select(func.count())
        .select_from(Comment)
        .where(Comment.target_type == "article")
        .where(Comment.article_id == article_id)
        .where(Comment.status == "approved")
    )
    count = count_result.scalar() or 0

    await db.execute(
        update(Article)
        .where(Article.id == article_id)
        .values(comment_count=count)
    )


async def _get_target_titles(db: AsyncSession, comments: List[Comment]) -> Dict[Tuple[str, int], str]:
    title_map: Dict[Tuple[str, int], str] = {}

    article_ids = sorted({c.target_id for c in comments if c.target_type == "article"})
    hotspot_ids = sorted({c.target_id for c in comments if c.target_type == "hotspot"})

    if article_ids:
        result = await db.execute(select(Article.id, Article.title).where(Article.id.in_(article_ids)))
        for article_id, title in result.all():
            title_map[("article", int(article_id))] = title

    if hotspot_ids:
        result = await db.execute(select(HotTopic.id, HotTopic.title).where(HotTopic.id.in_(hotspot_ids)))
        for hotspot_id, title in result.all():
            title_map[("hotspot", int(hotspot_id))] = title

    return title_map


def _to_pending_response(comment: Comment, title_map: Dict[Tuple[str, int], str]) -> CommentPendingResponse:
    target_title = title_map.get((comment.target_type, comment.target_id))
    if not target_title and comment.article:
        target_title = comment.article.title
    target_title = target_title or "未知目标"

    return CommentPendingResponse(
        id=comment.id,
        article_id=comment.article_id,
        article_title=target_title,  # 兼容旧前端字段
        target_type=comment.target_type,
        target_id=comment.target_id,
        target_title=target_title,
        parent_id=comment.parent_id,
        nickname=comment.nickname,
        email=comment.email,
        avatar_url=comment.avatar_url,
        content=comment.content,
        ip_address=comment.ip_address,
        status=comment.status,
        like_count=comment.like_count,
        report_count=comment.report_count,
        is_reported=comment.is_reported,
        created_at=comment.created_at,
    )


async def _get_target_comments(
    target_type: str,
    target_id: int,
    db: AsyncSession,
) -> CommentListResponse:
    normalized_type, resolved_target = await _resolve_comment_target(db, target_type, target_id, require_published=True)

    result = await db.execute(
        select(Comment)
        .options(selectinload(Comment.admin))
        .where(Comment.target_type == normalized_type)
        .where(Comment.target_id == resolved_target.id)
        .where(Comment.status == "approved")
        .order_by(Comment.created_at.asc())
    )
    comments = result.scalars().all()

    tree = build_comment_tree(list(comments))
    return CommentListResponse(total=len(comments), comments=tree)


async def _create_target_comment(
    target_type: str,
    target_id: int,
    comment_data: CommentCreate,
    request: Request,
    db: AsyncSession,
) -> CommentResponse:
    normalized_type, resolved_target = await _resolve_comment_target(db, target_type, target_id, require_published=True)

    if comment_data.parent_id:
        result = await db.execute(
            select(Comment)
            .where(Comment.id == comment_data.parent_id)
            .where(Comment.target_type == normalized_type)
            .where(Comment.target_id == resolved_target.id)
        )
        if not result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="父评论不存在",
            )

    nickname = comment_data.nickname.strip() if comment_data.nickname else None
    if not nickname:
        nickname = generate_default_nickname()

    article_id = resolved_target.id if normalized_type == "article" else None

    comment = Comment(
        article_id=article_id,
        target_type=normalized_type,
        target_id=resolved_target.id,
        parent_id=comment_data.parent_id,
        nickname=nickname,
        email=comment_data.email,
        avatar_url=generate_avatar_url(comment_data.email, nickname),
        content=comment_data.content,
        status="approved",
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )

    db.add(comment)

    if normalized_type == "article":
        await db.execute(
            update(Article)
            .where(Article.id == article_id)
            .values(comment_count=Article.comment_count + 1)
        )

    await db.commit()
    await db.refresh(comment)

    return CommentResponse(
        id=comment.id,
        article_id=comment.article_id,
        target_type=comment.target_type,
        target_id=comment.target_id,
        parent_id=comment.parent_id,
        nickname=comment.nickname,
        avatar_url=comment.avatar_url,
        content=comment.content,
        is_admin_reply=False,
        status=comment.status,
        like_count=0,
        is_reported=False,
        created_at=comment.created_at,
        replies=[],
    )


@router.get("/target/{target_type}/{target_id}", response_model=CommentListResponse)
async def get_target_comments(
    target_type: str,
    target_id: int,
    db: AsyncSession = Depends(get_db),
):
    """按目标类型获取评论（article / hotspot）"""
    return await _get_target_comments(target_type, target_id, db)


@router.post("/target/{target_type}/{target_id}", response_model=CommentResponse)
async def create_target_comment(
    target_type: str,
    target_id: int,
    comment_data: CommentCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """按目标类型提交评论（article / hotspot）"""
    return await _create_target_comment(target_type, target_id, comment_data, request, db)


@router.get("/article/{article_id}", response_model=CommentListResponse)
async def get_article_comments(
    article_id: int,
    db: AsyncSession = Depends(get_db),
):
    """获取文章评论（已审核的）"""
    return await _get_target_comments("article", article_id, db)


@router.post("/article/{article_id}", response_model=CommentResponse)
async def create_comment(
    article_id: int,
    comment_data: CommentCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """提交文章评论（无需审核，直接发布）"""
    return await _create_target_comment("article", article_id, comment_data, request, db)


@router.get("/hotspot/{target_id}", response_model=CommentListResponse)
async def get_hotspot_comments(
    target_id: int,
    db: AsyncSession = Depends(get_db),
):
    """获取热点评论（已审核的）"""
    return await _get_target_comments("hotspot", target_id, db)


@router.post("/hotspot/{target_id}", response_model=CommentResponse)
async def create_hotspot_comment(
    target_id: int,
    comment_data: CommentCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """提交热点评论（无需审核，直接发布）"""
    return await _create_target_comment("hotspot", target_id, comment_data, request, db)


@router.post("/{comment_id}/like")
async def like_comment(
    comment_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """点赞评论"""
    result = await db.execute(select(Comment).where(Comment.id == comment_id))
    comment = result.scalar_one_or_none()

    if not comment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="评论不存在")

    user_id = get_user_identifier(request)

    result = await db.execute(
        select(CommentLike)
        .where(CommentLike.comment_id == comment_id)
        .where(CommentLike.user_identifier == user_id)
    )
    existing_like = result.scalar_one_or_none()

    if existing_like:
        await db.delete(existing_like)
        comment.like_count = max(0, comment.like_count - 1)
        await db.commit()
        return {"message": "已取消点赞", "like_count": comment.like_count, "liked": False}

    like = CommentLike(comment_id=comment_id, user_identifier=user_id)
    db.add(like)
    comment.like_count += 1
    await db.commit()
    return {"message": "点赞成功", "like_count": comment.like_count, "liked": True}


@router.get("/{comment_id}/like-status")
async def get_like_status(
    comment_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """获取点赞状态"""
    user_id = get_user_identifier(request)

    result = await db.execute(
        select(CommentLike)
        .where(CommentLike.comment_id == comment_id)
        .where(CommentLike.user_identifier == user_id)
    )
    existing_like = result.scalar_one_or_none()

    return {"liked": existing_like is not None}


@router.post("/{comment_id}/report")
async def report_comment(
    comment_id: int,
    report_data: CommentReportRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """举报评论"""
    result = await db.execute(select(Comment).where(Comment.id == comment_id))
    comment = result.scalar_one_or_none()

    if not comment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="评论不存在")

    user_id = get_user_identifier(request)

    result = await db.execute(
        select(CommentReport)
        .where(CommentReport.comment_id == comment_id)
        .where(CommentReport.reporter_identifier == user_id)
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="您已经举报过该评论")

    report = CommentReport(
        comment_id=comment_id,
        reporter_identifier=user_id,
        reason=report_data.reason,
        description=report_data.description,
        status="pending",
    )
    db.add(report)

    comment.report_count += 1
    comment.is_reported = True

    await db.commit()

    return {"message": "举报成功，我们会尽快处理"}


# ========== 管理员接口 ==========

@router.get("/pending", response_model=List[CommentPendingResponse])
async def get_pending_comments(
    db: AsyncSession = Depends(get_db),
    admin: Admin = Depends(get_current_admin),
):
    """获取待审核评论（管理员）"""
    result = await db.execute(
        select(Comment)
        .options(selectinload(Comment.article))
        .where(Comment.status == "pending")
        .order_by(Comment.created_at.desc())
    )
    comments = result.scalars().all()
    title_map = await _get_target_titles(db, list(comments))

    return [_to_pending_response(c, title_map) for c in comments]


@router.get("/reported", response_model=List[ReportedCommentResponse])
async def get_reported_comments(
    db: AsyncSession = Depends(get_db),
    admin: Admin = Depends(get_current_admin),
):
    """获取被举报的评论（管理员）"""
    result = await db.execute(
        select(Comment)
        .options(selectinload(Comment.article), selectinload(Comment.reports))
        .where(Comment.is_reported == True)
        .order_by(Comment.created_at.desc())
    )
    comments = result.scalars().all()
    title_map = await _get_target_titles(db, list(comments))

    return [
        ReportedCommentResponse(
            comment=_to_pending_response(c, title_map),
            reports=[
                CommentReportResponse(
                    id=r.id,
                    comment_id=r.comment_id,
                    reason=r.reason,
                    description=r.description,
                    status=r.status,
                    created_at=r.created_at,
                )
                for r in c.reports
            ],
        )
        for c in comments
    ]


@router.get("/approved", response_model=List[CommentPendingResponse])
async def get_approved_comments(
    db: AsyncSession = Depends(get_db),
    admin: Admin = Depends(get_current_admin),
):
    """获取已通过评论（管理员）"""
    result = await db.execute(
        select(Comment)
        .options(selectinload(Comment.article))
        .where(Comment.status == "approved")
        .order_by(Comment.created_at.desc())
    )
    comments = result.scalars().all()
    title_map = await _get_target_titles(db, list(comments))

    return [_to_pending_response(c, title_map) for c in comments]


@router.put("/{comment_id}/approve")
async def approve_comment(
    comment_id: int,
    db: AsyncSession = Depends(get_db),
    admin: Admin = Depends(get_current_admin),
):
    """审核通过评论（管理员）"""
    result = await db.execute(select(Comment).where(Comment.id == comment_id))
    comment = result.scalar_one_or_none()

    if not comment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="评论不存在")

    comment.status = "approved"
    await db.commit()

    return {"message": "审核通过"}


@router.put("/{comment_id}/reject")
async def reject_comment(
    comment_id: int,
    db: AsyncSession = Depends(get_db),
    admin: Admin = Depends(get_current_admin),
):
    """拒绝评论（管理员）"""
    result = await db.execute(select(Comment).where(Comment.id == comment_id))
    comment = result.scalar_one_or_none()

    if not comment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="评论不存在")

    comment.status = "rejected"
    await db.commit()

    return {"message": "已拒绝"}


@router.put("/{comment_id}/dismiss-report")
async def dismiss_report(
    comment_id: int,
    db: AsyncSession = Depends(get_db),
    admin: Admin = Depends(get_current_admin),
):
    """驳回举报（举报无效，保留评论）"""
    result = await db.execute(select(Comment).where(Comment.id == comment_id))
    comment = result.scalar_one_or_none()

    if not comment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="评论不存在")

    await db.execute(
        update(CommentReport)
        .where(CommentReport.comment_id == comment_id)
        .values(status="processed")
    )

    comment.is_reported = False
    comment.report_count = 0

    await db.commit()

    return {"message": "举报已驳回，评论保留"}


@router.put("/{comment_id}/confirm-report")
async def confirm_report(
    comment_id: int,
    db: AsyncSession = Depends(get_db),
    admin: Admin = Depends(get_current_admin),
):
    """确认举报有效（删除评论及其回复）"""
    result = await db.execute(
        select(Comment)
        .options(selectinload(Comment.replies))
        .where(Comment.id == comment_id)
    )
    comment = result.scalar_one_or_none()

    if not comment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="评论不存在")

    article_id = comment.article_id
    target_type = comment.target_type
    await db.delete(comment)
    await db.commit()

    if target_type == "article":
        await _recount_article_comment_count(db, article_id)
        await db.commit()

    return {"message": "举报确认，评论已删除"}


@router.delete("/{comment_id}")
async def delete_comment(
    comment_id: int,
    db: AsyncSession = Depends(get_db),
    admin: Admin = Depends(get_current_admin),
):
    """删除评论（管理员）"""
    result = await db.execute(select(Comment).where(Comment.id == comment_id))
    comment = result.scalar_one_or_none()

    if not comment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="评论不存在")

    article_id = comment.article_id
    target_type = comment.target_type
    await db.delete(comment)
    await db.commit()

    if target_type == "article":
        await _recount_article_comment_count(db, article_id)
        await db.commit()

    return {"message": "删除成功"}


@router.post("/{comment_id}/reply", response_model=CommentResponse)
async def admin_reply_comment(
    comment_id: int,
    reply_data: AdminReplyCreate,
    db: AsyncSession = Depends(get_db),
    admin: Admin = Depends(get_current_admin),
):
    """管理员回复评论"""
    result = await db.execute(select(Comment).where(Comment.id == comment_id))
    parent_comment = result.scalar_one_or_none()

    if not parent_comment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="评论不存在")

    reply = Comment(
        article_id=parent_comment.article_id,
        target_type=parent_comment.target_type,
        target_id=parent_comment.target_id,
        parent_id=comment_id,
        nickname=admin.display_name or admin.username,
        avatar_url=admin.avatar_url or generate_avatar_url(admin.username),
        content=reply_data.content,
        is_admin_reply=True,
        admin_id=admin.id,
        status="approved",
    )

    db.add(reply)

    if parent_comment.target_type == "article" and reply.article_id:
        await db.execute(
            update(Article)
            .where(Article.id == reply.article_id)
            .values(comment_count=Article.comment_count + 1)
        )

    await db.commit()
    await db.refresh(reply)

    return CommentResponse(
        id=reply.id,
        article_id=reply.article_id,
        target_type=reply.target_type,
        target_id=reply.target_id,
        parent_id=reply.parent_id,
        nickname=reply.nickname,
        avatar_url=reply.avatar_url,
        content=reply.content,
        is_admin_reply=True,
        admin_display_name=admin.display_name or admin.username,
        status=reply.status,
        like_count=0,
        is_reported=False,
        created_at=reply.created_at,
        replies=[],
    )
