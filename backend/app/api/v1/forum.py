"""论坛 API

能力概览：
- 公开读：版块列表（含帖子计数）、主题列表（置顶/排序/已解决筛选/关键词）、主题详情、楼层分页
- 登录写：发主题、回复楼层（含引用 parent_id）、点赞主题/楼层、采纳最佳回答、举报主题/楼层
- 自治改删：作者本人（或管理员）编辑、删除自己的主题与楼层（编辑写入 edited_at）
- 管理员管理：版块增删改、置顶/加精/锁定/隐藏主题与楼层、管理视角全量主题列表、举报队列审结
- 兼容保留：`/forum/categories`、`/forum/threads`（含 q/category_id/page/page_size）、`/forum/posts/{id}`，保障既有 Agent 技能零退化
"""

from __future__ import annotations

import hashlib
import re
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ...core.database import get_db
from ...core.deps import get_current_admin, get_current_user, get_optional_user
from ...core.redis import get_redis
from ...core.security import utc_now_naive
from ...models.forum import (
    ForumCategory,
    ForumPost,
    ForumPostLike,
    ForumReport,
    ForumThread,
    ForumThreadLike,
)
from ...models.user import User
from ...schemas.common import PaginatedResponse
from ...schemas.forum import (
    ForumAcceptPostRequest,
    ForumCategoryCreateRequest,
    ForumCategoryResponse,
    ForumCategoryUpdateRequest,
    ForumHideRequest,
    ForumPostAdminUpdateRequest,
    ForumPostCreateRequest,
    ForumPostResponse,
    ForumReportConfirmRequest,
    ForumReportItemResponse,
    ForumReportRequest,
    ForumReportedTargetResponse,
    ForumThreadAdminUpdateRequest,
    ForumThreadCreateRequest,
    ForumThreadDetailResponse,
    ForumThreadListItem,
)
from ...services.notification_service import create_notification

router = APIRouter()


# -------------------------
# 工具函数：身份展示与反滥用
# -------------------------


def _get_user_identifier(request: Request) -> str:
    ip = request.client.host if request.client else "unknown"
    ua = request.headers.get("user-agent", "")
    raw = f"{ip}:{ua}"
    return hashlib.md5(raw.encode()).hexdigest()[:32]


async def _rate_limit(request: Request, action: str, limit: int, window_seconds: int) -> None:
    redis = get_redis()
    if not redis:
        return

    ip = request.client.host if request.client else "unknown"
    key = f"rl:forum:{action}:{ip}"
    try:
        current = await redis.incr(key)
        if current == 1:
            await redis.expire(key, window_seconds)
        if current > limit:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="操作过于频繁，请稍后再试",
            )
    except HTTPException:
        raise
    except Exception:
        return


def _reject_if_honeypot_filled(value: Optional[str]) -> None:
    if value and value.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="请求无效")


def _slugify(name: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9_-]+", "-", name.strip().lower()).strip("-")
    return cleaned[:45] if cleaned else "board"


def _thread_author_fields(thread: ForumThread) -> dict:
    u = thread.user
    return {
        "user_id": thread.user_id,
        "username": u.username if u else None,
        "author_nickname": thread.author_nickname,
        "author_display_name": (u.display_name or u.username) if u else thread.author_nickname,
        "author_avatar": u.avatar_url if u else None,
        "author_role": u.role if u else None,
    }


def _to_thread_list_item(thread: ForumThread, viewer_liked: bool = False) -> ForumThreadListItem:
    return ForumThreadListItem(
        id=thread.id,
        category_id=thread.category_id,
        category_name=thread.category.name if thread.category else None,
        category_slug=thread.category.slug if thread.category else None,
        title=thread.title,
        reply_count=thread.reply_count,
        view_count=thread.view_count,
        like_count=thread.like_count,
        viewer_liked=viewer_liked,
        is_pinned=thread.is_pinned,
        is_locked=thread.is_locked,
        is_featured=thread.is_featured,
        is_solved=thread.is_solved,
        is_hidden=thread.is_hidden,
        accepted_post_id=thread.accepted_post_id,
        last_post_at=thread.last_post_at,
        edited_at=thread.edited_at,
        created_at=thread.created_at,
        **_thread_author_fields(thread),
    )


def _to_thread_detail(thread: ForumThread, viewer_liked: bool = False) -> ForumThreadDetailResponse:
    return ForumThreadDetailResponse(
        id=thread.id,
        category_id=thread.category_id,
        category_name=thread.category.name if thread.category else None,
        category_slug=thread.category.slug if thread.category else None,
        title=thread.title,
        reply_count=thread.reply_count,
        view_count=thread.view_count,
        like_count=thread.like_count,
        viewer_liked=viewer_liked,
        is_pinned=thread.is_pinned,
        is_locked=thread.is_locked,
        is_featured=thread.is_featured,
        is_solved=thread.is_solved,
        is_hidden=thread.is_hidden,
        accepted_post_id=thread.accepted_post_id,
        is_reported=thread.is_reported,
        report_count=thread.report_count,
        last_post_at=thread.last_post_at,
        edited_at=thread.edited_at,
        created_at=thread.created_at,
        updated_at=thread.updated_at,
        **_thread_author_fields(thread),
    )


def _to_post_response(post: ForumPost, viewer_liked: bool = False) -> ForumPostResponse:
    u = post.user
    admin_rel = post.admin
    display_name = (
        (u.display_name or u.username)
        if u
        else (admin_rel.display_name if admin_rel else post.nickname)
    )
    return ForumPostResponse(
        id=post.id,
        thread_id=post.thread_id,
        parent_id=post.parent_id,
        floor=post.floor,
        user_id=post.user_id,
        username=u.username if u else None,
        nickname=post.nickname,
        author_display_name=display_name,
        author_avatar=u.avatar_url if u else (admin_rel.avatar_url if admin_rel else None),
        author_role=u.role if u else ("admin" if post.is_admin_post else None),
        content=post.content,
        is_admin_post=post.is_admin_post,
        admin_display_name=(
            (u.display_name or u.username)
            if (u and u.is_admin_role)
            else (admin_rel.display_name if admin_rel else None)
        ),
        like_count=post.like_count,
        viewer_liked=viewer_liked,
        is_hidden=post.is_hidden,
        is_reported=post.is_reported,
        report_count=post.report_count,
        edited_at=post.edited_at,
        created_at=post.created_at,
    )


# -------------------------
# 版块接口（公开读取 + 管理员维护）
# -------------------------


@router.get("/categories", response_model=list[ForumCategoryResponse])
async def list_categories(
    include_inactive: bool = Query(False),
    current_user: Optional[User] = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(ForumCategory).order_by(ForumCategory.sort_order.asc(), ForumCategory.id.asc())
    if not (include_inactive and current_user and current_user.is_admin_role):
        query = query.where(ForumCategory.is_active == True)

    items = (await db.execute(query)).scalars().all()

    counts_map = dict(
        (
            await db.execute(
                select(ForumThread.category_id, func.count(ForumThread.id))
                .where(ForumThread.status == "approved", ForumThread.is_hidden == False)
                .group_by(ForumThread.category_id)
            )
        ).all()
    )

    resp: List[ForumCategoryResponse] = []
    for cat in items:
        c = ForumCategoryResponse.model_validate(cat)
        c.thread_count = int(counts_map.get(cat.id, 0) or 0)
        resp.append(c)
    return resp


@router.post("/categories", response_model=ForumCategoryResponse, status_code=201)
async def create_category(
    payload: ForumCategoryCreateRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """创建论坛版块（管理员）"""
    name = payload.name.strip()
    if (await db.execute(select(ForumCategory.id).where(ForumCategory.name == name))).scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="版块名称已存在")

    slug = (payload.slug or "").strip() or _slugify(name)
    if (await db.execute(select(ForumCategory.id).where(ForumCategory.slug == slug))).scalar_one_or_none():
        slug = f"{slug[:40]}-{int(utc_now_naive().timestamp()) % 10000}"

    if payload.is_default:
        await db.execute(update(ForumCategory).values(is_default=False))

    cat = ForumCategory(
        name=name,
        slug=slug,
        description=payload.description.strip() if payload.description else None,
        icon=payload.icon.strip() if payload.icon else None,
        color=payload.color.strip() if payload.color else None,
        is_default=payload.is_default,
        sort_order=payload.sort_order,
        is_active=True,
    )
    db.add(cat)
    await db.commit()
    await db.refresh(cat)
    return ForumCategoryResponse.model_validate(cat)


@router.put("/categories/{category_id}", response_model=ForumCategoryResponse)
async def update_category(
    category_id: int,
    payload: ForumCategoryUpdateRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """更新论坛版块（管理员）"""
    cat = (await db.execute(select(ForumCategory).where(ForumCategory.id == category_id))).scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="版块不存在")

    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"] is not None:
        new_name = data["name"].strip()
        dup = (
            await db.execute(
                select(ForumCategory.id).where(ForumCategory.name == new_name, ForumCategory.id != category_id)
            )
        ).scalar_one_or_none()
        if dup:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="版块名称已存在")
        cat.name = new_name

    if "slug" in data:
        new_slug = (data["slug"] or "").strip() or None
        if new_slug:
            dup_s = (
                await db.execute(
                    select(ForumCategory.id).where(ForumCategory.slug == new_slug, ForumCategory.id != category_id)
                )
            ).scalar_one_or_none()
            if dup_s:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="版块标识 slug 已存在")
        cat.slug = new_slug

    if "description" in data:
        cat.description = data["description"].strip() if data["description"] else None
    if "icon" in data:
        cat.icon = data["icon"].strip() if data["icon"] else None
    if "color" in data:
        cat.color = data["color"].strip() if data["color"] else None
    if "sort_order" in data and data["sort_order"] is not None:
        cat.sort_order = data["sort_order"]
    if "is_active" in data and data["is_active"] is not None:
        cat.is_active = data["is_active"]
    if data.get("is_default") is True:
        await db.execute(update(ForumCategory).where(ForumCategory.id != category_id).values(is_default=False))
        cat.is_default = True
    elif data.get("is_default") is False:
        cat.is_default = False

    await db.commit()
    await db.refresh(cat)

    cnt = (
        await db.execute(
            select(func.count(ForumThread.id)).where(
                ForumThread.category_id == category_id,
                ForumThread.status == "approved",
                ForumThread.is_hidden == False,
            )
        )
    ).scalar() or 0
    resp = ForumCategoryResponse.model_validate(cat)
    resp.thread_count = int(cnt)
    return resp


@router.delete("/categories/{category_id}")
async def delete_category(
    category_id: int,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """删除版块（须先清空该版块下的非删除主题）"""
    cat = (await db.execute(select(ForumCategory).where(ForumCategory.id == category_id))).scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="版块不存在")

    existing_threads = (
        await db.execute(
            select(func.count(ForumThread.id)).where(
                ForumThread.category_id == category_id,
                ForumThread.status != "deleted",
            )
        )
    ).scalar() or 0
    if existing_threads > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"该版块下仍有 {existing_threads} 个主题，请先迁移或删除后再删除版块",
        )

    await db.delete(cat)
    await db.commit()
    return {"message": "版块已删除"}


# -------------------------
# 管理员后台管理列表与举报队列
# -------------------------


@router.get("/admin/threads", response_model=PaginatedResponse[ForumThreadListItem])
async def admin_list_threads(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    category_id: Optional[int] = Query(None),
    q: Optional[str] = Query(None),
    is_hidden: Optional[bool] = Query(None),
    is_reported: Optional[bool] = Query(None),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """管理端全量主题列表（含隐藏/被举报筛选）"""
    query = (
        select(ForumThread)
        .options(selectinload(ForumThread.category), selectinload(ForumThread.user))
        .where(ForumThread.status == "approved")
    )
    if category_id is not None:
        query = query.where(ForumThread.category_id == category_id)
    if is_hidden is not None:
        query = query.where(ForumThread.is_hidden == is_hidden)
    if is_reported is not None:
        query = query.where(ForumThread.is_reported == is_reported)
    if q and q.strip():
        query = query.where(ForumThread.title.ilike(f"%{q.strip()}%"))

    total = (
        await db.execute(select(func.count()).select_from(query.order_by(None).subquery()))
    ).scalar() or 0

    rows = (
        await db.execute(
            query.order_by(ForumThread.is_pinned.desc(), ForumThread.created_at.desc(), ForumThread.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).scalars().all()

    return PaginatedResponse(
        data=[_to_thread_list_item(t) for t in rows],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=(total + page_size - 1) // page_size,
    )


@router.get("/reports", response_model=List[ForumReportedTargetResponse])
async def list_forum_reports(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """获取社区待处理举报队列（管理员）"""
    pending_reports = (
        await db.execute(
            select(ForumReport)
            .where(ForumReport.status == "pending")
            .order_by(ForumReport.created_at.desc(), ForumReport.id.desc())
        )
    ).scalars().all()

    grouped: Dict[tuple[str, int], List[ForumReport]] = {}
    for rep in pending_reports:
        grouped.setdefault((rep.target_type, rep.target_id), []).append(rep)

    thread_ids = [tid for (ttype, tid) in grouped if ttype == "thread"]
    post_ids = [pid for (ttype, pid) in grouped if ttype == "post"]

    threads_map: Dict[int, ForumThread] = {}
    posts_map: Dict[int, ForumPost] = {}
    post_threads_map: Dict[int, ForumThread] = {}

    if thread_ids:
        rows = (
            await db.execute(
                select(ForumThread)
                .options(selectinload(ForumThread.user))
                .where(ForumThread.id.in_(thread_ids))
            )
        ).scalars().all()
        threads_map = {t.id: t for t in rows}
    if post_ids:
        rows = (
            await db.execute(
                select(ForumPost)
                .options(selectinload(ForumPost.user))
                .where(ForumPost.id.in_(post_ids))
            )
        ).scalars().all()
        posts_map = {p.id: p for p in rows}
        parent_thread_ids = sorted({p.thread_id for p in rows})
        if parent_thread_ids:
            t_rows = (
                await db.execute(select(ForumThread).where(ForumThread.id.in_(parent_thread_ids)))
            ).scalars().all()
            post_threads_map = {t.id: t for t in t_rows}

    result: List[ForumReportedTargetResponse] = []
    for (ttype, tid), reps in grouped.items():
        if ttype == "thread":
            t = threads_map.get(tid)
            if not t or t.status == "deleted":
                continue
            author_name = (t.user.display_name or t.user.username) if t.user else t.author_nickname
            result.append(
                ForumReportedTargetResponse(
                    target_type="thread",
                    target_id=tid,
                    thread_id=t.id,
                    thread_title=t.title,
                    floor=1,
                    author_name=author_name,
                    content_preview=t.title,
                    is_hidden=t.is_hidden,
                    report_count=max(t.report_count, len(reps)),
                    reports=[ForumReportItemResponse.model_validate(r) for r in reps],
                )
            )
        else:
            p = posts_map.get(tid)
            if not p or p.status == "deleted":
                continue
            t = post_threads_map.get(p.thread_id)
            author_name = (p.user.display_name or p.user.username) if p.user else p.nickname
            preview = p.content[:140] + ("..." if len(p.content) > 140 else "")
            result.append(
                ForumReportedTargetResponse(
                    target_type="post",
                    target_id=tid,
                    thread_id=p.thread_id,
                    thread_title=t.title if t else f"主题 #{p.thread_id}",
                    floor=p.floor,
                    author_name=author_name,
                    content_preview=preview,
                    is_hidden=p.is_hidden,
                    report_count=max(p.report_count, len(reps)),
                    reports=[ForumReportItemResponse.model_validate(r) for r in reps],
                )
            )

    return result


@router.put("/reports/{target_type}/{target_id}/dismiss")
async def dismiss_forum_report(
    target_type: str,
    target_id: int,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """驳回举报并恢复状态（管理员）"""
    ttype = target_type.strip().lower()
    if ttype not in ("thread", "post"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="target_type 必须是 thread 或 post")

    if ttype == "thread":
        target = (await db.execute(select(ForumThread).where(ForumThread.id == target_id))).scalar_one_or_none()
    else:
        target = (await db.execute(select(ForumPost).where(ForumPost.id == target_id))).scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="目标不存在")

    await db.execute(
        update(ForumReport)
        .where(
            ForumReport.target_type == ttype,
            ForumReport.target_id == target_id,
            ForumReport.status == "pending",
        )
        .values(status="processed")
    )
    target.is_reported = False
    target.report_count = 0
    await db.commit()
    return {"message": "已驳回举报"}


@router.put("/reports/{target_type}/{target_id}/confirm")
async def confirm_forum_report(
    target_type: str,
    target_id: int,
    payload: ForumReportConfirmRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """确认举报有效：支持 delete（删除）或 hide（隐藏）"""
    ttype = target_type.strip().lower()
    action = (payload.action or "delete").strip().lower()
    if ttype not in ("thread", "post"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="target_type 必须是 thread 或 post")
    if action not in ("delete", "hide"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="action 必须是 delete 或 hide")

    if ttype == "thread":
        thread = (await db.execute(select(ForumThread).where(ForumThread.id == target_id))).scalar_one_or_none()
        if not thread:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="主题不存在")
        if action == "delete":
            thread.status = "deleted"
        else:
            thread.is_hidden = True
        thread.is_reported = False
    else:
        post = (await db.execute(select(ForumPost).where(ForumPost.id == target_id))).scalar_one_or_none()
        if not post:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="楼层不存在")
        thread = (await db.execute(select(ForumThread).where(ForumThread.id == post.thread_id))).scalar_one_or_none()
        if action == "delete":
            if post.floor == 1 and thread is not None:
                thread.status = "deleted"
            elif post.status != "deleted":
                post.status = "deleted"
                if thread is not None:
                    thread.reply_count = max(0, thread.reply_count - 1)
                    if thread.accepted_post_id == post.id:
                        thread.accepted_post_id = None
                        thread.is_solved = False
        else:
            post.is_hidden = True
        post.is_reported = False

    await db.execute(
        update(ForumReport)
        .where(
            ForumReport.target_type == ttype,
            ForumReport.target_id == target_id,
            ForumReport.status == "pending",
        )
        .values(status="processed")
    )
    await db.commit()
    return {"message": "举报已处理"}


# -------------------------
# 公开阅读 + 登录发布/互动接口
# -------------------------


@router.get("/threads", response_model=PaginatedResponse[ForumThreadListItem])
async def list_threads(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    category_id: Optional[int] = Query(None),
    q: Optional[str] = Query(None, description="搜索关键字（标题）"),
    sort: str = Query("latest_activity", description="latest_activity / latest / hottest / most_replies"),
    solved: str = Query("all", description="all / solved / unsolved"),
    featured: Optional[bool] = Query(None),
    current_user: Optional[User] = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(ForumThread)
        .options(selectinload(ForumThread.category), selectinload(ForumThread.user))
        .where(ForumThread.status == "approved", ForumThread.is_hidden == False)
    )

    if category_id is not None:
        query = query.where(ForumThread.category_id == category_id)
    if q and q.strip():
        query = query.where(ForumThread.title.ilike(f"%{q.strip()}%"))
    if solved == "solved":
        query = query.where(ForumThread.is_solved == True)
    elif solved == "unsolved":
        query = query.where(ForumThread.is_solved == False)
    if featured is not None:
        query = query.where(ForumThread.is_featured == featured)

    # 置顶帖永远优先
    sort_mode = (sort or "latest_activity").strip().lower()
    if sort_mode == "latest":
        order_clauses = [ForumThread.is_pinned.desc(), ForumThread.created_at.desc(), ForumThread.id.desc()]
    elif sort_mode == "hottest":
        order_clauses = [
            ForumThread.is_pinned.desc(),
            ForumThread.like_count.desc(),
            ForumThread.reply_count.desc(),
            ForumThread.view_count.desc(),
            ForumThread.created_at.desc(),
        ]
    elif sort_mode == "most_replies":
        order_clauses = [
            ForumThread.is_pinned.desc(),
            ForumThread.reply_count.desc(),
            ForumThread.last_post_at.desc(),
            ForumThread.created_at.desc(),
        ]
    else:
        order_clauses = [
            ForumThread.is_pinned.desc(),
            (ForumThread.last_post_at.is_(None)).asc(),
            ForumThread.last_post_at.desc(),
            ForumThread.created_at.desc(),
        ]
    query = query.order_by(*order_clauses)

    total = (
        await db.execute(select(func.count()).select_from(query.order_by(None).subquery()))
    ).scalar() or 0

    offset = (page - 1) * page_size
    threads = (await db.execute(query.offset(offset).limit(page_size))).scalars().all()

    liked_ids: set[int] = set()
    if current_user is not None and threads:
        thread_ids = [t.id for t in threads]
        liked_ids = set(
            (
                await db.execute(
                    select(ForumThreadLike.thread_id).where(
                        ForumThreadLike.user_id == current_user.id,
                        ForumThreadLike.thread_id.in_(thread_ids),
                    )
                )
            ).scalars().all()
        )

    return PaginatedResponse(
        data=[_to_thread_list_item(t, viewer_liked=(t.id in liked_ids)) for t in threads],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=(total + page_size - 1) // page_size,
    )


@router.post("/threads", response_model=ForumThreadDetailResponse, status_code=201)
async def create_thread(
    payload: ForumThreadCreateRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """创建论坛主题（强制登录，绑定当前账号）"""
    _reject_if_honeypot_filled(payload.honeypot)
    await _rate_limit(request, action="thread", limit=5, window_seconds=60)

    category = await db.scalar(
        select(ForumCategory).where(
            ForumCategory.id == payload.category_id,
            ForumCategory.is_active == True,
        )
    )
    if not category:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="分类不存在或已停用")

    clean_title = payload.title.strip()
    if not clean_title:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="标题不能为空")
    if not payload.content.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="内容不能为空")

    display_name = (current_user.display_name or current_user.username)[:50]
    now = utc_now_naive()

    thread = ForumThread(
        category_id=payload.category_id,
        title=clean_title,
        status="approved",
        is_pinned=False,
        is_locked=False,
        is_featured=False,
        is_hidden=False,
        is_solved=False,
        reply_count=0,
        view_count=0,
        like_count=0,
        last_post_at=now,
        last_floor=0,
        user_id=current_user.id,
        author_nickname=display_name,
        author_email=current_user.email,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        user_identifier=_get_user_identifier(request),
    )
    db.add(thread)
    await db.flush()

    post = ForumPost(
        thread_id=thread.id,
        parent_id=None,
        floor=1,
        user_id=current_user.id,
        nickname=display_name,
        email=current_user.email,
        content=payload.content,
        status="approved",
        is_admin_post=current_user.is_admin_role,
        admin_id=None,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        user_identifier=_get_user_identifier(request),
    )
    db.add(post)
    await db.flush()

    thread.last_floor = 1
    thread.last_post_id = post.id
    thread.last_post_at = now

    await db.commit()
    thread = (
        await db.execute(
            select(ForumThread)
            .options(selectinload(ForumThread.category), selectinload(ForumThread.user))
            .where(ForumThread.id == thread.id)
        )
    ).scalar_one()

    return _to_thread_detail(thread, viewer_liked=False)


@router.get("/threads/{thread_id}", response_model=ForumThreadDetailResponse)
async def get_thread(
    thread_id: int,
    current_user: Optional[User] = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    thread = (
        await db.execute(
            select(ForumThread)
            .options(selectinload(ForumThread.category), selectinload(ForumThread.user))
            .where(ForumThread.id == thread_id)
        )
    ).scalar_one_or_none()
    if not thread or thread.status != "approved":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="主题不存在")
    if thread.is_hidden and not (current_user and current_user.is_admin_role):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="主题不存在")

    thread.view_count += 1
    await db.commit()
    thread = (
        await db.execute(
            select(ForumThread)
            .options(selectinload(ForumThread.category), selectinload(ForumThread.user))
            .where(ForumThread.id == thread_id)
        )
    ).scalar_one()

    viewer_liked = False
    if current_user is not None:
        viewer_liked = (
            await db.execute(
                select(ForumThreadLike.id).where(
                    ForumThreadLike.thread_id == thread_id,
                    ForumThreadLike.user_id == current_user.id,
                )
            )
        ).scalar_one_or_none() is not None

    return _to_thread_detail(thread, viewer_liked=viewer_liked)


@router.get("/threads/{thread_id}/posts", response_model=PaginatedResponse[ForumPostResponse])
async def list_posts(
    thread_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(30, ge=1, le=100),
    current_user: Optional[User] = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    thread = await db.scalar(select(ForumThread).where(ForumThread.id == thread_id))
    if not thread or thread.status != "approved":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="主题不存在")
    if thread.is_hidden and not (current_user and current_user.is_admin_role):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="主题不存在")

    base = (
        select(ForumPost)
        .options(selectinload(ForumPost.user), selectinload(ForumPost.admin))
        .where(ForumPost.thread_id == thread_id, ForumPost.status == "approved")
    )
    if not (current_user and current_user.is_admin_role):
        base = base.where(ForumPost.is_hidden == False)
    base = base.order_by(ForumPost.floor.asc())

    total = (
        await db.execute(select(func.count()).select_from(base.order_by(None).subquery()))
    ).scalar() or 0

    posts = (
        await db.execute(base.offset((page - 1) * page_size).limit(page_size))
    ).scalars().all()

    liked_post_ids: set[int] = set()
    if current_user is not None and posts:
        p_ids = [p.id for p in posts]
        liked_post_ids = set(
            (
                await db.execute(
                    select(ForumPostLike.post_id).where(
                        ForumPostLike.user_id == current_user.id,
                        ForumPostLike.post_id.in_(p_ids),
                    )
                )
            ).scalars().all()
        )

    return PaginatedResponse(
        data=[_to_post_response(p, viewer_liked=(p.id in liked_post_ids)) for p in posts],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=(total + page_size - 1) // page_size,
    )


@router.post("/threads/{thread_id}/posts", response_model=ForumPostResponse, status_code=201)
async def create_post(
    thread_id: int,
    payload: ForumPostCreateRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """回复论坛主题（强制登录，绑定当前账号；自动给主题作者/被引用楼层作者发站内通知）"""
    _reject_if_honeypot_filled(payload.honeypot)
    await _rate_limit(request, action="post", limit=10, window_seconds=30)

    thread = (
        await db.execute(select(ForumThread).where(ForumThread.id == thread_id))
    ).scalar_one_or_none()
    if not thread or thread.status != "approved" or thread.is_hidden:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="主题不存在")
    if thread.is_locked:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="该主题已锁定，无法回复")

    parent_post: Optional[ForumPost] = None
    if payload.parent_id:
        parent_post = await db.scalar(
            select(ForumPost).where(
                ForumPost.id == payload.parent_id,
                ForumPost.thread_id == thread_id,
                ForumPost.status == "approved",
            )
        )
        if not parent_post:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="引用楼层不存在")

    if not payload.content.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="回复内容不能为空")

    display_name = (current_user.display_name or current_user.username)[:50]
    now = utc_now_naive()

    await db.execute(
        update(ForumThread)
        .where(ForumThread.id == thread_id)
        .values(
            last_floor=ForumThread.last_floor + 1,
            reply_count=ForumThread.reply_count + 1,
            last_post_at=now,
        )
        .execution_options(synchronize_session=False)
    )
    next_floor = await db.scalar(select(ForumThread.last_floor).where(ForumThread.id == thread_id))
    if next_floor is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="主题不存在")

    post = ForumPost(
        thread_id=thread_id,
        parent_id=payload.parent_id,
        floor=next_floor,
        user_id=current_user.id,
        nickname=display_name,
        email=current_user.email,
        content=payload.content,
        status="approved",
        is_admin_post=current_user.is_admin_role,
        admin_id=None,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        user_identifier=_get_user_identifier(request),
    )
    db.add(post)
    await db.flush()
    thread.last_post_id = post.id

    # 发送站内通知（跳过本人；同一回帖若同时回复主帖与被引用楼层，对同一个人只发一条）
    notified_ids: set[int] = set()
    link = f"/forum/threads/{thread.id}"
    actor_name = current_user.display_name or current_user.username
    if parent_post is not None and parent_post.user_id and parent_post.user_id != current_user.id:
        await create_notification(
            db,
            user_id=parent_post.user_id,
            type="forum_reply",
            title=f"{actor_name} 回复了你在「{thread.title}」中的 #{parent_post.floor} 楼",
            snippet=payload.content,
            link=link,
            actor=current_user,
            target_type="thread",
            target_id=thread.id,
        )
        notified_ids.add(parent_post.user_id)

    if thread.user_id and thread.user_id != current_user.id and thread.user_id not in notified_ids:
        await create_notification(
            db,
            user_id=thread.user_id,
            type="forum_reply",
            title=f"{actor_name} 回复了你的主题「{thread.title}」",
            snippet=payload.content,
            link=link,
            actor=current_user,
            target_type="thread",
            target_id=thread.id,
        )

    await db.commit()
    post = (
        await db.execute(
            select(ForumPost)
            .options(selectinload(ForumPost.user), selectinload(ForumPost.admin))
            .where(ForumPost.id == post.id)
        )
    ).scalar_one()
    return _to_post_response(post, viewer_liked=False)


# -------------------------
# 点赞 / 采纳最佳回答 / 举报
# -------------------------


@router.post("/threads/{thread_id}/like")
async def toggle_thread_like(
    thread_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """点赞 / 取消点赞主题（登录用户）"""
    thread = (
        await db.execute(
            select(ForumThread).where(ForumThread.id == thread_id, ForumThread.status == "approved")
        )
    ).scalar_one_or_none()
    if not thread or thread.is_hidden:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="主题不存在")

    existing = (
        await db.execute(
            select(ForumThreadLike).where(
                ForumThreadLike.thread_id == thread_id,
                ForumThreadLike.user_id == current_user.id,
            )
        )
    ).scalar_one_or_none()

    if existing is not None:
        await db.delete(existing)
        thread.like_count = max(0, thread.like_count - 1)
        await db.commit()
        return {"liked": False, "like_count": thread.like_count}

    db.add(ForumThreadLike(thread_id=thread_id, user_id=current_user.id))
    thread.like_count += 1
    await db.commit()
    return {"liked": True, "like_count": thread.like_count}


@router.post("/posts/{post_id}/like")
async def toggle_post_like(
    post_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """点赞 / 取消点赞楼层（登录用户）"""
    post = (
        await db.execute(select(ForumPost).where(ForumPost.id == post_id, ForumPost.status == "approved"))
    ).scalar_one_or_none()
    if not post or post.is_hidden:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="楼层不存在")

    existing = (
        await db.execute(
            select(ForumPostLike).where(
                ForumPostLike.post_id == post_id,
                ForumPostLike.user_id == current_user.id,
            )
        )
    ).scalar_one_or_none()

    if existing is not None:
        await db.delete(existing)
        post.like_count = max(0, post.like_count - 1)
        await db.commit()
        return {"liked": False, "like_count": post.like_count}

    db.add(ForumPostLike(post_id=post_id, user_id=current_user.id))
    post.like_count += 1
    await db.commit()
    return {"liked": True, "like_count": post.like_count}


@router.post("/threads/{thread_id}/accept-post")
async def accept_best_answer(
    thread_id: int,
    payload: ForumAcceptPostRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """采纳 / 取消采纳最佳回答（楼主或管理员）"""
    thread = (
        await db.execute(select(ForumThread).where(ForumThread.id == thread_id, ForumThread.status == "approved"))
    ).scalar_one_or_none()
    if not thread:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="主题不存在")

    if not current_user.is_admin_role and thread.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="只有楼主或管理员可采纳最佳回答")

    if payload.post_id is None:
        thread.accepted_post_id = None
        thread.is_solved = False
        await db.commit()
        return {"thread_id": thread.id, "is_solved": False, "accepted_post_id": None}

    post = (
        await db.execute(
            select(ForumPost).where(
                ForumPost.id == payload.post_id,
                ForumPost.thread_id == thread_id,
                ForumPost.status == "approved",
                ForumPost.is_hidden == False,
            )
        )
    ).scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="回复楼层不存在或不可见")
    if post.floor == 1:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="不能将首帖主楼采纳为最佳回答")

    thread.accepted_post_id = post.id
    thread.is_solved = True

    if post.user_id:
        await create_notification(
            db,
            user_id=post.user_id,
            type="forum_accepted",
            title=f"你在主题「{thread.title}」的回复被采纳为最佳回答",
            snippet=post.content,
            link=f"/forum/threads/{thread.id}",
            actor=current_user,
            target_type="thread",
            target_id=thread.id,
        )

    await db.commit()
    return {
        "thread_id": thread.id,
        "is_solved": True,
        "accepted_post_id": thread.accepted_post_id,
    }


@router.post("/threads/{thread_id}/report")
async def report_thread(
    thread_id: int,
    payload: ForumReportRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """举报主题（登录用户）"""
    thread = (
        await db.execute(select(ForumThread).where(ForumThread.id == thread_id, ForumThread.status == "approved"))
    ).scalar_one_or_none()
    if not thread:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="主题不存在")

    existing = (
        await db.execute(
            select(ForumReport).where(
                ForumReport.target_type == "thread",
                ForumReport.target_id == thread_id,
                ForumReport.user_id == current_user.id,
                ForumReport.status == "pending",
            )
        )
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="您已经举报过该主题，正在处理中")

    db.add(
        ForumReport(
            target_type="thread",
            target_id=thread_id,
            user_id=current_user.id,
            reporter_identifier=_get_user_identifier(request),
            reason=payload.reason.strip(),
            description=payload.description.strip() if payload.description else None,
            status="pending",
        )
    )
    thread.report_count += 1
    thread.is_reported = True
    await db.commit()
    return {"message": "举报成功，我们会尽快核查"}


@router.post("/posts/{post_id}/report")
async def report_post(
    post_id: int,
    payload: ForumReportRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """举报楼层（登录用户）"""
    post = (
        await db.execute(select(ForumPost).where(ForumPost.id == post_id, ForumPost.status == "approved"))
    ).scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="楼层不存在")

    existing = (
        await db.execute(
            select(ForumReport).where(
                ForumReport.target_type == "post",
                ForumReport.target_id == post_id,
                ForumReport.user_id == current_user.id,
                ForumReport.status == "pending",
            )
        )
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="您已经举报过该楼层，正在处理中")

    db.add(
        ForumReport(
            target_type="post",
            target_id=post_id,
            user_id=current_user.id,
            reporter_identifier=_get_user_identifier(request),
            reason=payload.reason.strip(),
            description=payload.description.strip() if payload.description else None,
            status="pending",
        )
    )
    post.report_count += 1
    post.is_reported = True
    await db.commit()
    return {"message": "举报成功，我们会尽快核查"}


# -------------------------
# 编辑 / 删除 / 隐藏（作者自治 + 管理员管理）
# -------------------------


@router.put("/threads/{thread_id}", response_model=ForumThreadDetailResponse)
async def update_thread(
    thread_id: int,
    payload: ForumThreadAdminUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """更新主题（作者本人可改标题/分类/首帖正文；置顶/锁定/加精/隐藏仅限管理员）"""
    thread = await db.scalar(
        select(ForumThread)
        .options(selectinload(ForumThread.category), selectinload(ForumThread.user))
        .where(ForumThread.id == thread_id, ForumThread.status == "approved")
    )
    if not thread:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="主题不存在")

    is_owner = thread.user_id is not None and thread.user_id == current_user.id
    if not current_user.is_admin_role and not is_owner:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="只能编辑自己发布的主题")

    admin_only_touched = any(
        val is not None
        for val in (payload.is_pinned, payload.is_locked, payload.is_featured, payload.is_hidden)
    )
    if admin_only_touched and not current_user.is_admin_role:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="置顶、锁定、加精和隐藏操作仅限管理员",
        )

    content_changed = False
    now = utc_now_naive()

    if payload.title is not None:
        clean_title = payload.title.strip()
        if not clean_title:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="标题不能为空")
        thread.title = clean_title
        content_changed = True

    if payload.category_id is not None and payload.category_id != thread.category_id:
        category = await db.scalar(
            select(ForumCategory).where(
                ForumCategory.id == payload.category_id,
                ForumCategory.is_active == True,
            )
        )
        if not category:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="分类不存在")
        thread.category_id = payload.category_id
        content_changed = True

    if payload.content is not None:
        if not payload.content.strip():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="内容不能为空")
        floor1 = await db.scalar(
            select(ForumPost).where(ForumPost.thread_id == thread_id, ForumPost.floor == 1)
        )
        if floor1 is not None:
            floor1.content = payload.content
            floor1.edited_at = now
        content_changed = True

    if content_changed:
        thread.edited_at = now

    if current_user.is_admin_role:
        if payload.is_pinned is not None:
            thread.is_pinned = payload.is_pinned
        if payload.is_locked is not None:
            thread.is_locked = payload.is_locked
        if payload.is_featured is not None:
            thread.is_featured = payload.is_featured
        if payload.is_hidden is not None:
            thread.is_hidden = payload.is_hidden

    await db.commit()
    thread = (
        await db.execute(
            select(ForumThread)
            .options(selectinload(ForumThread.category), selectinload(ForumThread.user))
            .where(ForumThread.id == thread_id)
        )
    ).scalar_one()

    viewer_liked = (
        await db.execute(
            select(ForumThreadLike.id).where(
                ForumThreadLike.thread_id == thread_id,
                ForumThreadLike.user_id == current_user.id,
            )
        )
    ).scalar_one_or_none() is not None
    return _to_thread_detail(thread, viewer_liked=viewer_liked)


@router.delete("/threads/{thread_id}")
async def delete_thread(
    thread_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """删除主题（作者本人或管理员）"""
    thread = await db.scalar(select(ForumThread).where(ForumThread.id == thread_id))
    if not thread or thread.status == "deleted":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="主题不存在")

    is_owner = thread.user_id is not None and thread.user_id == current_user.id
    if not current_user.is_admin_role and not is_owner:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="只能删除自己发布的主题")

    thread.status = "deleted"
    await db.commit()
    return {"message": "删除成功"}


@router.put("/threads/{thread_id}/hide")
async def toggle_thread_hidden(
    thread_id: int,
    payload: ForumHideRequest,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """隐藏 / 恢复显示主题（管理员）"""
    thread = await db.scalar(select(ForumThread).where(ForumThread.id == thread_id))
    if not thread or thread.status == "deleted":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="主题不存在")
    thread.is_hidden = payload.is_hidden
    await db.commit()
    return {"message": "已隐藏" if payload.is_hidden else "已恢复显示", "is_hidden": thread.is_hidden}


@router.put("/posts/{post_id}", response_model=ForumPostResponse)
async def update_post(
    post_id: int,
    payload: ForumPostAdminUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """编辑楼层正文（作者本人或管理员）"""
    post = await db.scalar(
        select(ForumPost)
        .options(selectinload(ForumPost.user), selectinload(ForumPost.admin))
        .where(ForumPost.id == post_id, ForumPost.status == "approved")
    )
    if not post:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="楼层不存在")

    is_owner = post.user_id is not None and post.user_id == current_user.id
    if not current_user.is_admin_role and not is_owner:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="只能编辑自己发表的楼层")

    if not payload.content.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="内容不能为空")

    now = utc_now_naive()
    post.content = payload.content
    post.edited_at = now
    if post.floor == 1:
        await db.execute(
            update(ForumThread).where(ForumThread.id == post.thread_id).values(edited_at=now)
        )

    await db.commit()
    post = (
        await db.execute(
            select(ForumPost)
            .options(selectinload(ForumPost.user), selectinload(ForumPost.admin))
            .where(ForumPost.id == post_id)
        )
    ).scalar_one()

    viewer_liked = (
        await db.execute(
            select(ForumPostLike.id).where(
                ForumPostLike.post_id == post_id,
                ForumPostLike.user_id == current_user.id,
            )
        )
    ).scalar_one_or_none() is not None
    return _to_post_response(post, viewer_liked=viewer_liked)


@router.delete("/posts/{post_id}")
async def delete_post(
    post_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """删除回复楼层（作者本人或管理员；首帖 floor=1 请删除主题）"""
    post = await db.scalar(select(ForumPost).where(ForumPost.id == post_id))
    if not post or post.status == "deleted":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="楼层不存在")

    is_owner = post.user_id is not None and post.user_id == current_user.id
    if not current_user.is_admin_role and not is_owner:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="只能删除自己发表的楼层")

    if post.floor == 1:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="主楼层不能单独删除，请删除整个主题")

    post.status = "deleted"
    thread = await db.scalar(select(ForumThread).where(ForumThread.id == post.thread_id))
    if thread is not None:
        thread.reply_count = max(0, thread.reply_count - 1)
        if thread.accepted_post_id == post.id:
            thread.accepted_post_id = None
            thread.is_solved = False

    await db.commit()
    return {"message": "删除成功"}


@router.put("/posts/{post_id}/hide")
async def toggle_post_hidden(
    post_id: int,
    payload: ForumHideRequest,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """隐藏 / 恢复显示楼层（管理员）"""
    post = await db.scalar(select(ForumPost).where(ForumPost.id == post_id))
    if not post or post.status == "deleted":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="楼层不存在")
    post.is_hidden = payload.is_hidden
    await db.commit()
    return {"message": "已隐藏" if payload.is_hidden else "已恢复显示", "is_hidden": post.is_hidden}
