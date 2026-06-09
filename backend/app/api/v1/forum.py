"""论坛 API

公开能力：
- 获取分类列表
- 获取主题列表（分页 + 搜索）
- 创建主题（匿名，分类必选）
- 获取主题详情
- 获取主题楼层列表（分页）
- 回复主题（匿名）

管理能力（仅管理员）：
- 编辑/删除主题
- 编辑/删除楼层

反滥用（不接验证码）：
- 蜜罐字段 honeypot 非空直接拒绝
- Redis 限频（Redis 不可用时降级：仅做校验）

风格对齐：参考 comments.py 的匿名身份与 user_identifier 生成方式。
"""

from __future__ import annotations

import hashlib
import random
import string
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ...core.database import get_db
from ...core.deps import get_current_admin
from ...core.redis import get_redis
from ...models.admin import Admin
from ...models.forum import ForumCategory, ForumPost, ForumThread
from ...schemas.common import PaginatedResponse
from ...schemas.forum import (
    ForumCategoryResponse,
    ForumPostAdminUpdateRequest,
    ForumPostCreateRequest,
    ForumPostResponse,
    ForumThreadAdminUpdateRequest,
    ForumThreadCreateRequest,
    ForumThreadDetailResponse,
    ForumThreadListItem,
)

router = APIRouter()


# -------------------------
# 工具函数：匿名身份与限频
# -------------------------

def _get_user_identifier(request: Request) -> str:
    ip = request.client.host if request.client else "unknown"
    ua = request.headers.get("user-agent", "")
    raw = f"{ip}:{ua}"
    return hashlib.md5(raw.encode()).hexdigest()[:32]


def _generate_guest_nickname() -> str:
    suffix = "".join(random.choices(string.ascii_lowercase + string.digits, k=4))
    return f"游客{suffix}"


def _normalize_nickname(nickname: Optional[str]) -> Optional[str]:
    if nickname is None:
        return None
    v = nickname.strip()
    return v or None


async def _rate_limit(request: Request, action: str, limit: int, window_seconds: int) -> None:
    """最小限频：Redis INCR + EXPIRE。

    Redis 不可用则直接跳过（降级）。
    """

    redis = get_redis()
    if not redis:
        return

    ip = request.client.host if request.client else "unknown"
    key = f"rl:forum:{action}:{ip}"

    try:
        # Atomic INCR, set expire when first seen.
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
        # Redis 异常：降级放行
        return


def _reject_if_honeypot_filled(value: Optional[str]) -> None:
    if value and value.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="请求无效")


# -------------------------
# 公共接口
# -------------------------


@router.get("/categories", response_model=list[ForumCategoryResponse])
async def list_categories(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ForumCategory)
        .where(ForumCategory.is_active == True)
        .order_by(ForumCategory.sort_order.asc(), ForumCategory.id.asc())
    )
    items = result.scalars().all()
    return [ForumCategoryResponse.model_validate(x) for x in items]


@router.get("/threads", response_model=PaginatedResponse[ForumThreadListItem])
async def list_threads(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    category_id: Optional[int] = Query(None),
    q: Optional[str] = Query(None, description="搜索关键字（标题）"),
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(ForumThread)
        .options(selectinload(ForumThread.category))
        .where(ForumThread.status == "approved")
    )

    if category_id is not None:
        query = query.where(ForumThread.category_id == category_id)

    if q:
        keyword = q.strip()
        if keyword:
            query = query.where(ForumThread.title.ilike(f"%{keyword}%"))

    # 默认：按最后回复时间倒序；没有 last_post_at 的按 created_at。
    # MySQL 不支持 "NULLS LAST" 语法，这里用 (last_post_at IS NULL) 作为排序兜底：
    #  - last_post_at 非空的排在前面
    #  - 同组内再按 last_post_at/created_at 倒序
    query = query.order_by((ForumThread.last_post_at.is_(None)).asc(), ForumThread.last_post_at.desc(), ForumThread.created_at.desc())

    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    offset = (page - 1) * page_size
    result = await db.execute(query.offset(offset).limit(page_size))
    threads = result.scalars().all()

    data: list[ForumThreadListItem] = []
    for t in threads:
        data.append(
            ForumThreadListItem(
                id=t.id,
                category_id=t.category_id,
                category_name=t.category.name if t.category else None,
                title=t.title,
                reply_count=t.reply_count,
                view_count=t.view_count,
                last_post_at=t.last_post_at,
                author_nickname=t.author_nickname,
                created_at=t.created_at,
            )
        )

    return PaginatedResponse(
        data=data,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=(total + page_size - 1) // page_size,
    )


@router.post("/threads", response_model=ForumThreadDetailResponse)
async def create_thread(
    payload: ForumThreadCreateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    _reject_if_honeypot_filled(payload.honeypot)

    # 限频：发主题
    await _rate_limit(request, action="thread", limit=2, window_seconds=60)

    # 分类必选且必须存在
    category = await db.scalar(
        select(ForumCategory).where(ForumCategory.id == payload.category_id).where(ForumCategory.is_active == True)
    )
    if not category:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="分类不存在")

    nickname = _normalize_nickname(payload.nickname) or _generate_guest_nickname()

    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")
    user_identifier = _get_user_identifier(request)

    now = datetime.now()

    thread = ForumThread(
        category_id=payload.category_id,
        title=payload.title.strip(),
        status="approved",
        is_pinned=False,
        is_locked=False,
        reply_count=0,
        view_count=0,
        last_post_at=now,
        last_floor=0,
        author_nickname=nickname,
        author_email=str(payload.email) if payload.email else None,
        ip_address=ip,
        user_agent=ua,
        user_identifier=user_identifier,
    )
    db.add(thread)
    await db.flush()

    # 首帖 floor=1
    post = ForumPost(
        thread_id=thread.id,
        parent_id=None,
        floor=1,
        nickname=nickname,
        email=str(payload.email) if payload.email else None,
        content=payload.content,
        status="approved",
        is_admin_post=False,
        admin_id=None,
        ip_address=ip,
        user_agent=ua,
        user_identifier=user_identifier,
    )
    db.add(post)
    await db.flush()

    thread.last_floor = 1
    thread.last_post_id = post.id
    thread.last_post_at = now

    await db.commit()
    await db.refresh(thread)

    return ForumThreadDetailResponse(
        id=thread.id,
        category_id=thread.category_id,
        category_name=category.name,
        title=thread.title,
        reply_count=thread.reply_count,
        view_count=thread.view_count,
        is_pinned=thread.is_pinned,
        is_locked=thread.is_locked,
        last_post_at=thread.last_post_at,
        author_nickname=thread.author_nickname,
        created_at=thread.created_at,
        updated_at=thread.updated_at,
    )


@router.get("/threads/{thread_id}", response_model=ForumThreadDetailResponse)
async def get_thread(
    thread_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ForumThread)
        .options(selectinload(ForumThread.category))
        .where(ForumThread.id == thread_id)
    )
    thread = result.scalar_one_or_none()
    if not thread or thread.status != "approved":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="主题不存在")

    # 增加浏览量（简单实现）
    thread.view_count += 1
    await db.commit()
    await db.refresh(thread)

    return ForumThreadDetailResponse(
        id=thread.id,
        category_id=thread.category_id,
        category_name=thread.category.name if thread.category else None,
        title=thread.title,
        reply_count=thread.reply_count,
        view_count=thread.view_count,
        is_pinned=thread.is_pinned,
        is_locked=thread.is_locked,
        last_post_at=thread.last_post_at,
        author_nickname=thread.author_nickname,
        created_at=thread.created_at,
        updated_at=thread.updated_at,
    )


@router.get("/threads/{thread_id}/posts", response_model=PaginatedResponse[ForumPostResponse])
async def list_posts(
    thread_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(30, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    thread = await db.scalar(select(ForumThread).where(ForumThread.id == thread_id))
    if not thread or thread.status != "approved":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="主题不存在")

    base = (
        select(ForumPost)
        .options(selectinload(ForumPost.admin))
        .where(ForumPost.thread_id == thread_id)
        .where(ForumPost.status == "approved")
        .order_by(ForumPost.floor.asc())
    )

    count_query = select(func.count()).select_from(base.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    offset = (page - 1) * page_size
    result = await db.execute(base.offset(offset).limit(page_size))
    posts = result.scalars().all()

    data: list[ForumPostResponse] = []
    for p in posts:
        data.append(
            ForumPostResponse(
                id=p.id,
                thread_id=p.thread_id,
                parent_id=p.parent_id,
                floor=p.floor,
                nickname=p.nickname,
                content=p.content,
                is_admin_post=p.is_admin_post,
                admin_display_name=p.admin.display_name if p.admin else None,
                created_at=p.created_at,
            )
        )

    return PaginatedResponse(
        data=data,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=(total + page_size - 1) // page_size,
    )


@router.post("/threads/{thread_id}/posts", response_model=ForumPostResponse)
async def create_post(
    thread_id: int,
    payload: ForumPostCreateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    _reject_if_honeypot_filled(payload.honeypot)

    # 限频：回帖
    await _rate_limit(request, action="post", limit=5, window_seconds=30)

    result = await db.execute(select(ForumThread).where(ForumThread.id == thread_id))
    thread = result.scalar_one_or_none()

    if not thread or thread.status != "approved":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="主题不存在")

    if thread.is_locked:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="该主题已锁定，无法回复")

    if payload.parent_id:
        parent = await db.scalar(
            select(ForumPost)
            .where(ForumPost.id == payload.parent_id)
            .where(ForumPost.thread_id == thread_id)
            .where(ForumPost.status == "approved")
        )
        if not parent:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="引用楼层不存在")

    nickname = _normalize_nickname(payload.nickname) or _generate_guest_nickname()

    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")
    user_identifier = _get_user_identifier(request)

    # 并发安全：用 thread.last_floor 分配楼层
    # 使用一次 UPDATE + SELECT 的方式避免 ORM 竞争；MySQL 下可用 LAST_INSERT_ID 技巧，但这里保持简单。
    # 方案：直接对 thread 行加锁（FOR UPDATE），然后自增。
    thread_locked = await db.scalar(
        select(ForumThread)
        .where(ForumThread.id == thread_id)
        .with_for_update()
    )
    if not thread_locked:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="主题不存在")

    next_floor = (thread_locked.last_floor or 0) + 1
    thread_locked.last_floor = next_floor

    post = ForumPost(
        thread_id=thread_id,
        parent_id=payload.parent_id,
        floor=next_floor,
        nickname=nickname,
        email=str(payload.email) if payload.email else None,
        content=payload.content,
        status="approved",
        is_admin_post=False,
        admin_id=None,
        ip_address=ip,
        user_agent=ua,
        user_identifier=user_identifier,
    )

    db.add(post)

    # 更新 thread 统计
    now = datetime.now()
    thread_locked.reply_count += 1
    thread_locked.last_post_at = now

    await db.flush()
    thread_locked.last_post_id = post.id

    await db.commit()
    await db.refresh(post)

    return ForumPostResponse(
        id=post.id,
        thread_id=post.thread_id,
        parent_id=post.parent_id,
        floor=post.floor,
        nickname=post.nickname,
        content=post.content,
        is_admin_post=post.is_admin_post,
        admin_display_name=None,
        created_at=post.created_at,
    )


# -------------------------
# 管理员接口（仅管理员编辑/删除）
# -------------------------


@router.put("/threads/{thread_id}", response_model=ForumThreadDetailResponse)
async def admin_update_thread(
    thread_id: int,
    payload: ForumThreadAdminUpdateRequest,
    db: AsyncSession = Depends(get_db),
    admin: Admin = Depends(get_current_admin),
):
    thread = await db.scalar(
        select(ForumThread)
        .options(selectinload(ForumThread.category))
        .where(ForumThread.id == thread_id)
    )
    if not thread:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="主题不存在")

    if payload.title is not None:
        thread.title = payload.title.strip()

    if payload.category_id is not None:
        category = await db.scalar(
            select(ForumCategory)
            .where(ForumCategory.id == payload.category_id)
            .where(ForumCategory.is_active == True)
        )
        if not category:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="分类不存在")
        thread.category_id = payload.category_id

    if payload.is_pinned is not None:
        thread.is_pinned = payload.is_pinned
    if payload.is_locked is not None:
        thread.is_locked = payload.is_locked

    await db.commit()
    await db.refresh(thread)

    # 重新取 category name
    category = await db.scalar(select(ForumCategory).where(ForumCategory.id == thread.category_id))

    return ForumThreadDetailResponse(
        id=thread.id,
        category_id=thread.category_id,
        category_name=category.name if category else None,
        title=thread.title,
        reply_count=thread.reply_count,
        view_count=thread.view_count,
        is_pinned=thread.is_pinned,
        is_locked=thread.is_locked,
        last_post_at=thread.last_post_at,
        author_nickname=thread.author_nickname,
        created_at=thread.created_at,
        updated_at=thread.updated_at,
    )


@router.delete("/threads/{thread_id}")
async def admin_delete_thread(
    thread_id: int,
    db: AsyncSession = Depends(get_db),
    admin: Admin = Depends(get_current_admin),
):
    thread = await db.scalar(select(ForumThread).where(ForumThread.id == thread_id))
    if not thread:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="主题不存在")

    thread.status = "deleted"
    await db.commit()
    return {"message": "删除成功"}


@router.put("/posts/{post_id}", response_model=ForumPostResponse)
async def admin_update_post(
    post_id: int,
    payload: ForumPostAdminUpdateRequest,
    db: AsyncSession = Depends(get_db),
    admin: Admin = Depends(get_current_admin),
):
    post = await db.scalar(
        select(ForumPost)
        .options(selectinload(ForumPost.admin))
        .where(ForumPost.id == post_id)
    )
    if not post:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="楼层不存在")

    post.content = payload.content
    post.is_admin_post = True
    post.admin_id = admin.id

    await db.commit()
    await db.refresh(post)

    return ForumPostResponse(
        id=post.id,
        thread_id=post.thread_id,
        parent_id=post.parent_id,
        floor=post.floor,
        nickname=post.nickname,
        content=post.content,
        is_admin_post=post.is_admin_post,
        admin_display_name=admin.display_name if admin.display_name else admin.username,
        created_at=post.created_at,
    )


@router.delete("/posts/{post_id}")
async def admin_delete_post(
    post_id: int,
    db: AsyncSession = Depends(get_db),
    admin: Admin = Depends(get_current_admin),
):
    post = await db.scalar(select(ForumPost).where(ForumPost.id == post_id))
    if not post:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="楼层不存在")

    post.status = "deleted"
    await db.commit()
    return {"message": "删除成功"}
