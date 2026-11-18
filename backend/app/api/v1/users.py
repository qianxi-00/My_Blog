"""
用户 API

- /me：当前用户资料、首次设置/修改用户名、设置/修改密码
- /me/email：验证码绑定/更换邮箱
- /me/articles, /me/prompts, /me/threads, /me/comments：我的内容管线
- /me/bookmarks, /me/likes：DB 持久化收藏与点赞
- /me/notifications：站内通知收件箱
- /{username}：公开作者主页（严格不含 email/qq/wechat）
"""

from __future__ import annotations

from datetime import timedelta
import re
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ...core.config import settings
from ...core.database import get_db
from ...core.deps import get_current_user
from ...core.ratelimit import rate_limit
from ...core.redis import CacheKeys, cache_delete
from ...core.security import create_access_token, get_password_hash, utc_now_naive, verify_password
from ...models.article import Article, Tag
from ...models.bookmark import BOOKMARK_TARGET_TYPES, Bookmark
from ...models.comment import Comment
from ...models.forum import (
    ForumPost,
    ForumPostLike,
    ForumThread,
    ForumThreadLike,
)
from ...models.hot_topic import HotTopic
from ...models.notification import Notification
from ...models.prompt import Prompt
from ...models.user import User
from ...schemas.article import (
    ArticleBase,
    ArticleListResponse,
    ArticleResponse,
    UserArticleUpdate,
)
from ...schemas.common import PaginatedResponse
from ...schemas.forum import ForumThreadListItem
from ...schemas.prompt import PromptListResponse, PromptResponse
from ...schemas.user import (
    BookmarkItemResponse,
    BookmarkToggleRequest,
    EmailBindRequest,
    EmailCodeRequest,
    NotificationResponse,
    PasswordChange,
    UserProfilePublic,
    UserPublic,
    UserPublicSafe,
    UserPublicThreadSummary,
    UserUpdate,
    UsernameUpdateRequest,
)
from ...services.verification_service import (
    VerificationError,
    send_code,
    verify_code,
)

router = APIRouter()

# 注意：所有 /me 开头的路径必须注册在 GET /{username} 之前，否则 "me" 会被当成 username 匹配
RESERVED_USERNAMES = {"me", "admin", "admins", "login", "register", "system", "root"}
USERNAME_RE = re.compile(r"^[a-zA-Z0-9_-]{3,30}$")


def _sanitize_website(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    cleaned = value.strip()
    if not cleaned:
        return None
    if any(ch.isspace() for ch in cleaned):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="个人网站链接不能包含空白字符")
    if not cleaned.lower().startswith(("http://", "https://")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="个人网站链接必须以 http:// 或 https:// 开头",
        )
    return cleaned[:255]


def _sanitize_social(value: Optional[str], label: str) -> Optional[str]:
    if value is None:
        return None
    cleaned = value.strip()
    if not cleaned:
        return None
    lower = cleaned.lower()
    if lower.startswith(("javascript:", "data:", "vbscript:")):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{label} 链接格式不安全")
    if "\n" in cleaned or "\r" in cleaned:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{label} 格式不合法")
    return cleaned[:100]


def _sanitize_avatar_url(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    cleaned = value.strip()
    if not cleaned:
        return None
    lower = cleaned.lower()
    if lower.startswith(("http://", "https://")):
        return cleaned[:500]
    if cleaned.startswith("/") and not cleaned.startswith("//"):
        return cleaned[:500]
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="头像地址仅支持本站路径或 http(s) 链接")


# ==================== /me 资料、用户名与安全 ====================


@router.get("/me", response_model=UserPublic)
async def get_me(user: User = Depends(get_current_user)):
    """获取当前用户资料"""
    return user


@router.put("/me", response_model=UserPublic)
async def update_me(
    profile_in: UserUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """更新当前用户资料（邮箱修改仍必须走验证码绑定）"""
    if profile_in.email and profile_in.email != user.email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="更换邮箱请使用验证码绑定（用户中心 → 账号安全）",
        )

    update_data = profile_in.model_dump(exclude_unset=True)
    update_data.pop("email", None)

    if "display_name" in update_data:
        dn = (update_data["display_name"] or "").strip()
        if not dn:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="显示昵称不能为空")
        update_data["display_name"] = dn[:100]
    if "website" in update_data:
        update_data["website"] = _sanitize_website(update_data["website"])
    if "github" in update_data:
        update_data["github"] = _sanitize_social(update_data["github"], "GitHub")
    if "bilibili" in update_data:
        update_data["bilibili"] = _sanitize_social(update_data["bilibili"], "B站")
    if "avatar_url" in update_data:
        update_data["avatar_url"] = _sanitize_avatar_url(update_data["avatar_url"])

    for field, value in update_data.items():
        setattr(user, field, value)

    await db.commit()
    await db.refresh(user)
    if user.role == "super_admin":
        await cache_delete(CacheKeys.SETTINGS_PUBLIC)
    return user


@router.put("/me/username", response_model=UserPublic)
async def customize_my_username(
    data: UsernameUpdateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """免密注册账号一次性设置正式用户名"""
    if user.username_customized:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="正式用户名已设置过，无法再次修改",
        )

    uname = data.username.strip()
    if not USERNAME_RE.match(uname) or uname.lower() in RESERVED_USERNAMES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="用户名仅支持 3-30 位字母、数字、下划线或连字符，且不能使用保留词",
        )

    existing = (
        await db.execute(
            select(User.id).where(func.lower(User.username) == uname.lower(), User.id != user.id)
        )
    ).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="该用户名已被占用")

    user.username = uname
    user.username_customized = True
    await db.commit()
    await db.refresh(user)
    return user


@router.put("/me/password")
async def change_password(
    password_in: PasswordChange,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    设置初始密码（!has_password 时免旧密码）或修改密码（必须验证旧密码）。
    成功后更新 password_changed_at 使其他旧设备 token 失效，并返回新 token 保持当前会话平滑在线。
    """
    was_unset = not user.has_password
    if user.has_password:
        if not password_in.old_password:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="请填写当前密码")
        if not await verify_password(password_in.old_password, user.password_hash):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="旧密码错误")

    user.password_hash = await get_password_hash(password_in.new_password)
    user.has_password = True
    user.password_changed_at = utc_now_naive()
    await db.commit()

    new_token = create_access_token(
        data={"sub": str(user.id)},
        expires_delta=timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    return {
        "message": "初始密码设置成功" if was_unset else "密码修改成功",
        "access_token": new_token,
        "has_password": True,
    }


# ==================== /me/email 绑定邮箱 ====================


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


@router.post(
    "/me/email/code",
    dependencies=[Depends(rate_limit("email_code", limit=10, window_seconds=3600, key_scope="ip"))],
)
async def send_bind_email_code(
    data: EmailCodeRequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """发送绑定/更换邮箱验证码（发码前校验邮箱未被其他账号占用）"""
    email = data.email.strip().lower()
    existing = (
        await db.execute(select(User.id).where(func.lower(User.email) == email))
    ).scalar_one_or_none()
    if existing is not None and existing != user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="该邮箱已被其他账号使用")

    try:
        expires_in = await send_code(db, email, "bind", ip=_client_ip(request))
    except VerificationError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=e.message)
    except RuntimeError as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(e))
    return {"message": "验证码已发送", "expires_in": expires_in}


@router.put("/me/email", response_model=UserPublic)
async def bind_email(
    data: EmailBindRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """绑定 / 更换邮箱（验证码验证 + 唯一性 + 域名检查）"""
    email = data.email.strip().lower()

    existing = (
        await db.execute(select(User).where(func.lower(User.email) == email))
    ).scalar_one_or_none()
    if existing and existing.id != user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="该邮箱已被使用")

    try:
        await verify_code(db, email, "bind", data.code)
    except VerificationError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=e.message)

    user.email = email
    user.email_verified = True
    await db.commit()
    await db.refresh(user)
    return user


# ==================== /me/prompts 我的提示词 ====================


@router.get("/me/prompts", response_model=List[PromptResponse])
async def my_prompts(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """我的提示词（全部状态，含 pending/rejected）"""
    result = await db.execute(
        select(Prompt)
        .options(selectinload(Prompt.author))
        .where(Prompt.author_id == user.id)
        .order_by(Prompt.created_at.desc(), Prompt.id.desc())
    )
    return result.scalars().all()


async def _get_own_prompt(prompt_id: int, user: User, db: AsyncSession) -> Prompt:
    prompt = (await db.execute(select(Prompt).where(Prompt.id == prompt_id))).scalar_one_or_none()
    if not prompt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="提示词不存在")
    if prompt.author_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="只能操作自己的提示词")
    return prompt


@router.put("/me/prompts/{prompt_id}", response_model=PromptResponse)
async def update_my_prompt(
    prompt_id: int,
    data: dict,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """改自己的提示词（仅 pending/rejected；已发布的找管理员）"""
    prompt = await _get_own_prompt(prompt_id, user, db)
    if prompt.status not in ("pending", "rejected"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="已发布的提示词请联系管理员修改",
        )

    allowed = ("title", "description", "content", "category")
    update_data = {k: v for k, v in data.items() if k in allowed and v is not None}
    if not update_data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="没有可更新的字段")
    if "category" in update_data and update_data["category"] not in (
        "Dev", "Writing", "Business", "Academic", "Thinking", "Growth", "Other"
    ):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="无效的分类")
    if "title" in update_data and not str(update_data["title"]).strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="标题不能为空")
    if "content" in update_data and not str(update_data["content"]).strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="内容不能为空")

    for field, value in update_data.items():
        setattr(prompt, field, value)
    if prompt.status == "rejected":
        prompt.status = "pending"
    await db.commit()
    await db.refresh(prompt)
    prompt = (
        await db.execute(select(Prompt).options(selectinload(Prompt.author)).where(Prompt.id == prompt.id))
    ).scalar_one()
    return PromptResponse.model_validate(prompt)


@router.delete("/me/prompts/{prompt_id}")
async def delete_my_prompt(
    prompt_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """删自己的提示词（仅 pending/rejected；已发布的找管理员）"""
    prompt = await _get_own_prompt(prompt_id, user, db)
    if prompt.status not in ("pending", "rejected"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="已发布的提示词请联系管理员删除",
        )
    await db.delete(prompt)
    await db.commit()
    return {"message": "删除成功"}


# ==================== /me/articles 用户文章管线 ====================


async def _get_own_article(
    article_id: int,
    user: User,
    db: AsyncSession,
    allowed_statuses: Optional[tuple] = None,
    status_detail: str = "",
) -> Article:
    article = (await db.execute(select(Article).where(Article.id == article_id))).scalar_one_or_none()
    if not article:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="文章不存在")
    if article.author_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="只能操作自己的文章")
    if allowed_statuses and article.status not in allowed_statuses:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=status_detail)
    return article


@router.get("/me/articles", response_model=PaginatedResponse[ArticleListResponse])
async def list_my_articles(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    status_filter: Optional[str] = Query(
        None,
        alias="status",
        description="draft/pending_review/rejected/published，缺省为全部",
    ),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """列出自己的文章"""
    query = (
        select(Article)
        .options(selectinload(Article.author), selectinload(Article.tags))
        .where(Article.author_id == user.id)
    )
    if status_filter:
        query = query.where(Article.status == status_filter)

    total = (
        await db.execute(select(func.count()).select_from(query.order_by(None).subquery()))
    ).scalar() or 0

    query = query.order_by(Article.updated_at.desc(), Article.id.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)
    articles = (await db.execute(query)).scalars().all()

    return PaginatedResponse(
        data=[ArticleListResponse.model_validate(a) for a in articles],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=(total + page_size - 1) // page_size,
    )


@router.post("/me/articles", response_model=ArticleResponse, status_code=201)
async def create_my_article(
    article_data: ArticleBase,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """创建草稿文章"""
    article = Article(
        title=article_data.title,
        summary=article_data.summary,
        content_md=article_data.content_md,
        cover_image=article_data.cover_image,
        category=article_data.category,
        author_id=user.id,
        status="draft",
    )

    db.add(article)
    await db.flush()

    if article_data.tags:
        result = await db.execute(
            select(Article).options(selectinload(Article.tags)).where(Article.id == article.id)
        )
        article = result.scalar_one()

        for tag_name in article_data.tags:
            tag = (await db.execute(select(Tag).where(Tag.name == tag_name))).scalar_one_or_none()
            if not tag:
                tag = Tag(name=tag_name)
                db.add(tag)
                await db.flush()
            article.tags.append(tag)

    await db.commit()

    result = await db.execute(
        select(Article)
        .options(selectinload(Article.author), selectinload(Article.tags))
        .where(Article.id == article.id)
    )
    return result.scalar_one()


@router.get("/me/articles/{article_id}", response_model=ArticleResponse)
async def get_my_article(
    article_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """取自己单篇文章的完整内容"""
    article = await _get_own_article(article_id, user, db)
    result = await db.execute(
        select(Article)
        .options(selectinload(Article.author), selectinload(Article.tags))
        .where(Article.id == article.id)
    )
    return result.scalar_one()


@router.put("/me/articles/{article_id}", response_model=ArticleResponse)
async def update_my_article(
    article_id: int,
    article_data: UserArticleUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """编辑自己的文章（仅 draft/rejected 状态可编辑）"""
    article = await _get_own_article(
        article_id,
        user,
        db,
        allowed_statuses=("draft", "rejected"),
        status_detail="仅草稿或被驳回的文章可编辑",
    )

    update_data = article_data.model_dump(exclude_unset=True)

    if "tags" in update_data:
        tags = update_data.pop("tags") or []
        article.tags.clear()
        for tag_name in tags:
            tag = (await db.execute(select(Tag).where(Tag.name == tag_name))).scalar_one_or_none()
            if not tag:
                tag = Tag(name=tag_name)
                db.add(tag)
                await db.flush()
            article.tags.append(tag)

    for field, value in update_data.items():
        setattr(article, field, value)

    article.status = "draft"
    await db.commit()

    result = await db.execute(
        select(Article)
        .options(selectinload(Article.author), selectinload(Article.tags))
        .where(Article.id == article.id)
    )
    return result.scalar_one()


@router.post(
    "/me/articles/{article_id}/submit",
    response_model=ArticleResponse,
    dependencies=[Depends(rate_limit("article_submit", limit=3, window_seconds=86400, key_scope="user"))],
)
async def submit_my_article(
    article_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """提交自己的文章进入审核"""
    article = await _get_own_article(
        article_id,
        user,
        db,
        allowed_statuses=("draft", "rejected"),
        status_detail="仅草稿或被驳回的文章可提交审核",
    )

    article.status = "pending_review"
    article.review_note = None
    await db.commit()

    result = await db.execute(
        select(Article)
        .options(selectinload(Article.author), selectinload(Article.tags))
        .where(Article.id == article.id)
    )
    return result.scalar_one()


@router.delete("/me/articles/{article_id}")
async def delete_my_article(
    article_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """删除自己的文章（已发布需走管理员下架）"""
    article = await _get_own_article(article_id, user, db)
    if article.status == "published":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="已发布的文章不能删除")
    await db.delete(article)
    await db.commit()
    return {"message": "删除成功"}


# ==================== /me/threads & /me/comments 我的社区与评论 ====================


@router.get("/me/threads", response_model=PaginatedResponse[ForumThreadListItem])
async def list_my_threads(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """我发布的社区讨论主题"""
    query = (
        select(ForumThread)
        .options(selectinload(ForumThread.category), selectinload(ForumThread.user))
        .where(ForumThread.user_id == user.id, ForumThread.status == "approved")
    )
    total = (
        await db.execute(select(func.count()).select_from(query.order_by(None).subquery()))
    ).scalar() or 0

    rows = (
        await db.execute(
            query.order_by(ForumThread.created_at.desc(), ForumThread.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).scalars().all()

    thread_ids = [t.id for t in rows]
    liked_ids: set[int] = set()
    if thread_ids:
        liked_ids = set(
            (
                await db.execute(
                    select(ForumThreadLike.thread_id).where(
                        ForumThreadLike.user_id == user.id,
                        ForumThreadLike.thread_id.in_(thread_ids),
                    )
                )
            ).scalars().all()
        )

    data = [
        ForumThreadListItem(
            id=t.id,
            category_id=t.category_id,
            category_name=t.category.name if t.category else None,
            category_slug=t.category.slug if t.category else None,
            title=t.title,
            reply_count=t.reply_count,
            view_count=t.view_count,
            like_count=t.like_count,
            viewer_liked=t.id in liked_ids,
            is_pinned=t.is_pinned,
            is_locked=t.is_locked,
            is_featured=t.is_featured,
            is_solved=t.is_solved,
            is_hidden=t.is_hidden,
            accepted_post_id=t.accepted_post_id,
            last_post_at=t.last_post_at,
            user_id=t.user_id,
            username=t.user.username if t.user else user.username,
            author_nickname=t.author_nickname,
            author_display_name=(t.user.display_name or t.user.username) if t.user else t.author_nickname,
            author_avatar=t.user.avatar_url if t.user else user.avatar_url,
            author_role=t.user.role if t.user else user.role,
            edited_at=t.edited_at,
            created_at=t.created_at,
        )
        for t in rows
    ]

    return PaginatedResponse(
        data=data,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=(total + page_size - 1) // page_size,
    )


@router.get("/me/comments")
async def list_my_comments(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """我发表过的文章/热点评论列表"""
    query = select(Comment).where(Comment.user_id == user.id)
    total = (
        await db.execute(select(func.count()).select_from(query.order_by(None).subquery()))
    ).scalar() or 0

    comments = (
        await db.execute(
            query.order_by(Comment.created_at.desc(), Comment.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).scalars().all()

    art_ids = sorted({c.target_id for c in comments if c.target_type == "article"})
    hot_ids = sorted({c.target_id for c in comments if c.target_type == "hotspot"})

    art_titles: Dict[int, str] = {}
    hot_titles: Dict[int, str] = {}
    if art_ids:
        art_titles = dict(
            (await db.execute(select(Article.id, Article.title).where(Article.id.in_(art_ids)))).all()
        )
    if hot_ids:
        hot_titles = dict(
            (await db.execute(select(HotTopic.id, HotTopic.title).where(HotTopic.id.in_(hot_ids)))).all()
        )

    items = []
    for c in comments:
        if c.target_type == "article":
            title = art_titles.get(c.target_id, f"文章 #{c.target_id}")
            link = f"/articles/{c.target_id}#comments"
        else:
            title = hot_titles.get(c.target_id, f"AI 热点 #{c.target_id}")
            link = f"/hotspots/{c.target_id}#comments"
        items.append(
            {
                "id": c.id,
                "target_type": c.target_type,
                "target_id": c.target_id,
                "target_title": title,
                "link": link,
                "content": c.content,
                "status": c.status,
                "like_count": c.like_count,
                "edited_at": c.edited_at,
                "created_at": c.created_at,
            }
        )

    return {
        "data": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size,
    }


# ==================== /me/bookmarks & /me/likes ====================


async def _bookmark_target_exists(db: AsyncSession, target_type: str, target_id: int) -> bool:
    if target_type == "article":
        return (
            await db.execute(
                select(Article.id).where(Article.id == target_id, Article.status == "published")
            )
        ).scalar_one_or_none() is not None
    if target_type == "hotspot":
        return (
            await db.execute(
                select(HotTopic.id).where(HotTopic.id == target_id, HotTopic.status == "published")
            )
        ).scalar_one_or_none() is not None
    if target_type == "prompt":
        return (
            await db.execute(
                select(Prompt.id).where(Prompt.id == target_id, Prompt.status == "approved")
            )
        ).scalar_one_or_none() is not None
    if target_type == "thread":
        return (
            await db.execute(
                select(ForumThread.id).where(
                    ForumThread.id == target_id,
                    ForumThread.status == "approved",
                    ForumThread.is_hidden == False,
                )
            )
        ).scalar_one_or_none() is not None
    return False


@router.post("/me/bookmarks/toggle")
async def toggle_bookmark(
    data: BookmarkToggleRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """收藏 / 取消收藏（article / hotspot / prompt / thread）"""
    ttype = (data.target_type or "").strip().lower()
    if ttype not in BOOKMARK_TARGET_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="target_type 仅支持 article / hotspot / prompt / thread",
        )

    existing = (
        await db.execute(
            select(Bookmark).where(
                Bookmark.user_id == user.id,
                Bookmark.target_type == ttype,
                Bookmark.target_id == data.target_id,
            )
        )
    ).scalar_one_or_none()

    if existing is not None:
        await db.delete(existing)
        await db.commit()
        return {"bookmarked": False, "target_type": ttype, "target_id": data.target_id}

    if not await _bookmark_target_exists(db, ttype, data.target_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="目标内容不存在或不可见")

    db.add(Bookmark(user_id=user.id, target_type=ttype, target_id=data.target_id))
    await db.commit()
    return {"bookmarked": True, "target_type": ttype, "target_id": data.target_id}


@router.get("/me/bookmarks/status")
async def get_bookmark_status(
    target_type: str = Query(...),
    target_id: int = Query(..., ge=1),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """查询单条内容收藏状态"""
    ttype = (target_type or "").strip().lower()
    if ttype not in BOOKMARK_TARGET_TYPES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="不支持的收藏类型")

    existing = (
        await db.execute(
            select(Bookmark.id).where(
                Bookmark.user_id == user.id,
                Bookmark.target_type == ttype,
                Bookmark.target_id == target_id,
            )
        )
    ).scalar_one_or_none()
    return {"bookmarked": existing is not None}


@router.get("/me/bookmarks", response_model=PaginatedResponse[BookmarkItemResponse])
async def list_my_bookmarks(
    target_type: Optional[str] = Query(None, description="article/hotspot/prompt/thread，缺省全部"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """列出我的收藏夹并聚合目标标题与跳转链接"""
    query = select(Bookmark).where(Bookmark.user_id == user.id)
    if target_type:
        ttype = target_type.strip().lower()
        if ttype not in BOOKMARK_TARGET_TYPES:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="不支持的收藏类型")
        query = query.where(Bookmark.target_type == ttype)

    total = (
        await db.execute(select(func.count()).select_from(query.order_by(None).subquery()))
    ).scalar() or 0

    bookmarks = (
        await db.execute(
            query.order_by(Bookmark.created_at.desc(), Bookmark.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).scalars().all()

    art_ids = [b.target_id for b in bookmarks if b.target_type == "article"]
    hot_ids = [b.target_id for b in bookmarks if b.target_type == "hotspot"]
    prompt_ids = [b.target_id for b in bookmarks if b.target_type == "prompt"]
    thread_ids = [b.target_id for b in bookmarks if b.target_type == "thread"]

    articles_map: Dict[int, Article] = {}
    hot_map: Dict[int, HotTopic] = {}
    prompt_map: Dict[int, Prompt] = {}
    thread_map: Dict[int, ForumThread] = {}

    if art_ids:
        rows = (
            await db.execute(select(Article).where(Article.id.in_(art_ids), Article.status == "published"))
        ).scalars().all()
        articles_map = {a.id: a for a in rows}
    if hot_ids:
        rows = (
            await db.execute(select(HotTopic).where(HotTopic.id.in_(hot_ids), HotTopic.status == "published"))
        ).scalars().all()
        hot_map = {h.id: h for h in rows}
    if prompt_ids:
        rows = (
            await db.execute(select(Prompt).where(Prompt.id.in_(prompt_ids), Prompt.status == "approved"))
        ).scalars().all()
        prompt_map = {p.id: p for p in rows}
    if thread_ids:
        rows = (
            await db.execute(
                select(ForumThread)
                .options(selectinload(ForumThread.category))
                .where(
                    ForumThread.id.in_(thread_ids),
                    ForumThread.status == "approved",
                    ForumThread.is_hidden == False,
                )
            )
        ).scalars().all()
        thread_map = {t.id: t for t in rows}

    items: List[BookmarkItemResponse] = []
    for b in bookmarks:
        if b.target_type == "article":
            obj = articles_map.get(b.target_id)
            items.append(
                BookmarkItemResponse(
                    id=b.id,
                    target_type="article",
                    target_id=b.target_id,
                    title=obj.title if obj else "（文章已下架或删除）",
                    summary=obj.summary if obj else None,
                    link=f"/articles/{b.target_id}",
                    extra={"available": obj is not None, "category": obj.category if obj else None},
                    created_at=b.created_at,
                )
            )
        elif b.target_type == "hotspot":
            obj = hot_map.get(b.target_id)
            items.append(
                BookmarkItemResponse(
                    id=b.id,
                    target_type="hotspot",
                    target_id=b.target_id,
                    title=obj.title if obj else "（热点已下架或删除）",
                    summary=obj.summary if obj else None,
                    link=f"/hotspots/{b.target_id}",
                    extra={"available": obj is not None, "category": obj.primary_category if obj else None},
                    created_at=b.created_at,
                )
            )
        elif b.target_type == "prompt":
            obj = prompt_map.get(b.target_id)
            items.append(
                BookmarkItemResponse(
                    id=b.id,
                    target_type="prompt",
                    target_id=b.target_id,
                    title=obj.title if obj else "（提示词已下架或删除）",
                    summary=(obj.description or (obj.content[:120] if obj.content else None)) if obj else None,
                    link=f"/prompts/{b.target_id}",
                    extra={"available": obj is not None, "category": obj.category if obj else None},
                    created_at=b.created_at,
                )
            )
        else:
            obj = thread_map.get(b.target_id)
            items.append(
                BookmarkItemResponse(
                    id=b.id,
                    target_type="thread",
                    target_id=b.target_id,
                    title=obj.title if obj else "（主题已删除或隐藏）",
                    summary=None,
                    link=f"/forum/threads/{b.target_id}",
                    extra={
                        "available": obj is not None,
                        "category": obj.category.name if obj and obj.category else None,
                        "reply_count": obj.reply_count if obj else 0,
                    },
                    created_at=b.created_at,
                )
            )

    return PaginatedResponse(
        data=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=(total + page_size - 1) // page_size,
    )


@router.get("/me/likes")
async def list_my_likes(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """查询我在站内账号绑定的点赞（社区主题 + 楼层）"""
    offset = (page - 1) * page_size

    total_threads = (
        await db.execute(
            select(func.count())
            .select_from(ForumThreadLike)
            .join(ForumThread, ForumThread.id == ForumThreadLike.thread_id)
            .where(
                ForumThreadLike.user_id == user.id,
                ForumThread.status == "approved",
                ForumThread.is_hidden == False,
            )
        )
    ).scalar() or 0

    liked_thread_rows = (
        await db.execute(
            select(ForumThread, ForumThreadLike.created_at)
            .join(ForumThreadLike, ForumThread.id == ForumThreadLike.thread_id)
            .options(selectinload(ForumThread.category))
            .where(
                ForumThreadLike.user_id == user.id,
                ForumThread.status == "approved",
                ForumThread.is_hidden == False,
            )
            .order_by(ForumThreadLike.created_at.desc(), ForumThreadLike.id.desc())
            .offset(offset)
            .limit(page_size)
        )
    ).all()

    total_posts = (
        await db.execute(
            select(func.count())
            .select_from(ForumPostLike)
            .join(ForumPost, ForumPost.id == ForumPostLike.post_id)
            .join(ForumThread, ForumThread.id == ForumPost.thread_id)
            .where(
                ForumPostLike.user_id == user.id,
                ForumPost.status == "approved",
                ForumPost.is_hidden == False,
                ForumThread.status == "approved",
                ForumThread.is_hidden == False,
            )
        )
    ).scalar() or 0

    liked_post_rows = (
        await db.execute(
            select(ForumPost, ForumThread.title, ForumPostLike.created_at)
            .join(ForumPostLike, ForumPost.id == ForumPostLike.post_id)
            .join(ForumThread, ForumThread.id == ForumPost.thread_id)
            .where(
                ForumPostLike.user_id == user.id,
                ForumPost.status == "approved",
                ForumPost.is_hidden == False,
                ForumThread.status == "approved",
                ForumThread.is_hidden == False,
            )
            .order_by(ForumPostLike.created_at.desc(), ForumPostLike.id.desc())
            .offset(offset)
            .limit(page_size)
        )
    ).all()

    return {
        "threads": [
            {
                "id": t.id,
                "title": t.title,
                "category_name": t.category.name if t.category else None,
                "like_count": t.like_count,
                "reply_count": t.reply_count,
                "liked_at": liked_at,
                "link": f"/forum/threads/{t.id}",
            }
            for t, liked_at in liked_thread_rows
        ],
        "posts": [
            {
                "id": p.id,
                "thread_id": p.thread_id,
                "thread_title": thread_title,
                "floor": p.floor,
                "content_preview": p.content[:140] + ("..." if len(p.content) > 140 else ""),
                "like_count": p.like_count,
                "liked_at": liked_at,
                "link": f"/forum/threads/{p.thread_id}",
            }
            for p, thread_title, liked_at in liked_post_rows
        ],
        "total_threads": total_threads,
        "total_posts": total_posts,
    }


# ==================== /me/notifications 站内通知 ====================


@router.get("/me/notifications", response_model=PaginatedResponse[NotificationResponse])
async def list_notifications(
    unread_only: bool = Query(False),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """获取当前用户站内通知列表"""
    query = select(Notification).where(Notification.user_id == user.id)
    if unread_only:
        query = query.where(Notification.is_read == False)

    total = (
        await db.execute(select(func.count()).select_from(query.order_by(None).subquery()))
    ).scalar() or 0

    rows = (
        await db.execute(
            query.order_by(Notification.created_at.desc(), Notification.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).scalars().all()

    return PaginatedResponse(
        data=[NotificationResponse.model_validate(n) for n in rows],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=(total + page_size - 1) // page_size,
    )


@router.get("/me/notifications/unread-count")
async def get_unread_notifications_count(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """未读通知数量"""
    cnt = (
        await db.execute(
            select(func.count())
            .select_from(Notification)
            .where(Notification.user_id == user.id, Notification.is_read == False)
        )
    ).scalar() or 0
    return {"unread_count": cnt}


@router.put("/me/notifications/read-all")
async def mark_all_notifications_read(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """全部通知标记为已读"""
    from sqlalchemy import update as sa_update

    await db.execute(
        sa_update(Notification)
        .where(Notification.user_id == user.id, Notification.is_read == False)
        .values(is_read=True)
    )
    await db.commit()
    return {"message": "已全部标为已读"}


@router.put("/me/notifications/{notif_id}/read")
async def mark_notification_read(
    notif_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """单条通知标记为已读"""
    item = (
        await db.execute(
            select(Notification).where(Notification.id == notif_id, Notification.user_id == user.id)
        )
    ).scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="通知不存在")
    item.is_read = True
    await db.commit()
    return {"message": "已标为已读", "id": notif_id}


# ==================== 公开作者页 ====================


@router.get("/{username}", response_model=UserProfilePublic)
async def get_public_profile(
    username: str,
    db: AsyncSession = Depends(get_db),
):
    """
    公开作者主页（严格不含 email / qq / wechat）：
    返回公开资料 + 已发布文章 + 已审核提示词 + 公开社区主题
    """
    user = (await db.execute(select(User).where(User.username == username))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="用户不存在")

    articles = (
        await db.execute(
            select(Article)
            .options(selectinload(Article.author), selectinload(Article.tags))
            .where(Article.author_id == user.id, Article.status == "published")
            .order_by(Article.published_at.desc(), Article.id.desc())
        )
    ).scalars().all()

    prompts = (
        await db.execute(
            select(Prompt)
            .where(Prompt.author_id == user.id, Prompt.status == "approved")
            .order_by(Prompt.created_at.desc(), Prompt.id.desc())
        )
    ).scalars().all()

    threads = (
        await db.execute(
            select(ForumThread)
            .options(selectinload(ForumThread.category))
            .where(
                ForumThread.user_id == user.id,
                ForumThread.status == "approved",
                ForumThread.is_hidden == False,
            )
            .order_by(ForumThread.created_at.desc(), ForumThread.id.desc())
        )
    ).scalars().all()

    thread_items = [
        UserPublicThreadSummary(
            id=t.id,
            category_id=t.category_id,
            category_name=t.category.name if t.category else None,
            title=t.title,
            reply_count=t.reply_count,
            view_count=t.view_count,
            like_count=t.like_count,
            is_solved=t.is_solved,
            created_at=t.created_at,
            last_post_at=t.last_post_at,
        )
        for t in threads
    ]

    return UserProfilePublic(
        **UserPublicSafe.model_validate(user).model_dump(),
        articles=[ArticleListResponse.model_validate(a) for a in articles],
        prompts=[PromptListResponse.model_validate(p) for p in prompts],
        threads=thread_items,
        stats={
            "articles": len(articles),
            "prompts": len(prompts),
            "threads": len(threads),
        },
    )
