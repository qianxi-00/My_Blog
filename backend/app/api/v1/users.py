"""
用户 API（2026-09-24 用户系统改造：users 表为全站唯一人员表）

- /me：当前用户资料、密码
- /me/articles：用户文章管线（草稿 -> 提交审核 -> 管理员通过/驳回）
- /{username}：公开作者页（不含 email，仅 published 文章）
"""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ...core.database import get_db
from ...core.deps import get_current_user
from ...core.ratelimit import rate_limit
from ...core.security import verify_password, get_password_hash, utc_now_naive
from ...models.article import Article, Tag
from ...models.prompt import Prompt
from ...models.user import User
from ...schemas.article import (
    ArticleBase,
    ArticleResponse,
    ArticleListResponse,
    UserArticleUpdate,
)
from ...schemas.common import PaginatedResponse
from ...schemas.prompt import PromptResponse
from ...schemas.user import (
    UserPublic,
    UserUpdate,
    PasswordChange,
    UserProfilePublic,
    UserPublicSafe,
    EmailCodeRequest,
    EmailBindRequest,
)
from ...services.verification_service import (
    send_code, verify_code, VerificationError,
)

router = APIRouter()

# 注意：所有 /me 开头的路径必须注册在 GET /{username} 之前，否则 "me" 会被当成 username 匹配


# ==================== /me 资料 ====================

@router.get("/me", response_model=UserPublic)
async def get_me(
    user: User = Depends(get_current_user)
):
    """获取当前用户资料"""
    return user


@router.put("/me", response_model=UserPublic)
async def update_me(
    profile_in: UserUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """更新当前用户资料（display_name/bio/avatar_url；邮箱必须走验证码绑定）"""
    # 邮箱必须走验证码绑定（2026-09-26 二期：邮箱认证强制）
    if profile_in.email and profile_in.email != user.email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="更换邮箱请使用验证码绑定（用户中心 → 绑定邮箱）"
        )

    update_data = profile_in.model_dump(exclude_unset=True)
    update_data.pop("email", None)
    for field, value in update_data.items():
        setattr(user, field, value)

    await db.commit()
    await db.refresh(user)
    return user


@router.put("/me/password")
async def change_password(
    password_in: PasswordChange,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """修改当前用户密码（必须验证旧密码；成功后旧 token 立即失效）"""
    if not await verify_password(password_in.old_password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="旧密码错误"
        )

    user.password_hash = await get_password_hash(password_in.new_password)
    user.password_changed_at = utc_now_naive()  # 踢掉所有旧 token（2026-09-26 二期）
    await db.commit()
    return {"message": "密码修改成功"}


# ==================== /me/email 绑定邮箱（2026-09-26 二期） ====================

def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


@router.post("/me/email/code",
             dependencies=[Depends(rate_limit("email_code", limit=10, window_seconds=3600, key_scope="ip"))])
async def send_bind_email_code(
    data: EmailCodeRequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """发送绑定/更换邮箱验证码（同 IP 10 次/小时，同邮箱 60 秒冷却 / 5 次每天）"""
    try:
        expires_in = await send_code(db, data.email, "bind", ip=_client_ip(request))
    except VerificationError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=e.message)
    except RuntimeError as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(e))
    return {"message": "验证码已发送", "expires_in": expires_in}


@router.put("/me/email", response_model=UserPublic)
async def bind_email(
    data: EmailBindRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """绑定 / 更换邮箱（验证码验证 + 唯一性 + 白名单）"""
    email = data.email.strip().lower()

    # 唯一性
    existing = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if existing and existing.id != user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="该邮箱已被使用")

    # 验证码（purpose=bind）
    try:
        await verify_code(db, email, "bind", data.code)
    except VerificationError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=e.message)

    user.email = email
    user.email_verified = True
    await db.commit()
    await db.refresh(user)
    return user


# ==================== /me/prompts 我的提示词（2026-09-26 二期） ====================

@router.get("/me/prompts", response_model=List[PromptResponse])
async def my_prompts(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
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
    """取自己的提示词（只能动自己的）"""
    prompt = (await db.execute(
        select(Prompt).where(Prompt.id == prompt_id)
    )).scalar_one_or_none()
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
    db: AsyncSession = Depends(get_db)
):
    """改自己的提示词（仅 pending/rejected；已发布的找管理员）"""
    prompt = _get_own_prompt(prompt_id, user, db)
    if prompt.status not in ("pending", "rejected"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="已发布的提示词请联系管理员修改"
        )

    allowed = ("title", "description", "content", "category")
    update_data = {k: v for k, v in data.items() if k in allowed and v is not None}
    if not update_data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="没有可更新的字段")
    if "category" in update_data and update_data["category"] not in ("Dev", "Writing", "Business", "Academic", "Other"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="无效的分类")
    if "title" in update_data and not str(update_data["title"]).strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="标题不能为空")
    if "content" in update_data and not str(update_data["content"]).strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="内容不能为空")

    # 驳回后重新编辑 → 回到待审核
    for field, value in update_data.items():
        setattr(prompt, field, value)
    if prompt.status == "rejected":
        prompt.status = "pending"
    await db.commit()
    await db.refresh(prompt)
    return prompt


@router.delete("/me/prompts/{prompt_id}")
async def delete_my_prompt(
    prompt_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """删自己的提示词（仅 pending/rejected；已发布的找管理员）"""
    prompt = _get_own_prompt(prompt_id, user, db)
    if prompt.status not in ("pending", "rejected"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="已发布的提示词请联系管理员删除"
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
    """取当前用户自己的文章并校验状态（响应用的 author/tags 由各端点在 commit 后统一重查）"""
    article = (await db.execute(
        select(Article).where(Article.id == article_id)
    )).scalar_one_or_none()

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
    status_filter: Optional[str] = Query(None, alias="status",
                                         description="draft/pending_review/rejected/published，缺省为全部"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """列出自己的文章（可按状态过滤）"""
    query = (
        select(Article)
        .options(selectinload(Article.author), selectinload(Article.tags))
        .where(Article.author_id == user.id)
    )
    if status_filter:
        query = query.where(Article.status == status_filter)

    total = (await db.execute(
        select(func.count()).select_from(query.order_by(None).subquery())
    )).scalar() or 0

    query = query.order_by(Article.updated_at.desc(), Article.id.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)
    articles = (await db.execute(query)).scalars().all()

    return PaginatedResponse(
        data=[ArticleListResponse.model_validate(a) for a in articles],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=(total + page_size - 1) // page_size
    )


@router.post("/me/articles", response_model=ArticleResponse, status_code=201)
async def create_my_article(
    article_data: ArticleBase,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    创建文章（status="draft"；slug 与现有文章创建逻辑保持一致——现状不生成 slug，
    content_html/toc_html/read_time 等审核通过时渲染）
    """
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

    # 处理标签（预加载 tags 关系再 append，避免异步环境 MissingGreenlet）
    if article_data.tags:
        result = await db.execute(
            select(Article)
            .options(selectinload(Article.tags))
            .where(Article.id == article.id)
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

    # 重新加载关联（author/tags）用于响应
    result = await db.execute(
        select(Article)
        .options(selectinload(Article.author), selectinload(Article.tags))
        .where(Article.id == article.id)
    )
    article = result.scalar_one()
    return article


@router.put("/me/articles/{article_id}", response_model=ArticleResponse)
async def update_my_article(
    article_id: int,
    article_data: UserArticleUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    编辑自己的文章（仅 draft/rejected 状态可编辑；驳回后重新编辑回草稿）
    """
    article = await _get_own_article(
        article_id, user, db,
        allowed_statuses=("draft", "rejected"),
        status_detail="仅草稿或被驳回的文章可编辑",
    )

    update_data = article_data.model_dump(exclude_unset=True)

    # 标签全量替换
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

    # 重新编辑后回到草稿（rejected 重新提交走 /submit）
    article.status = "draft"

    await db.commit()

    result = await db.execute(
        select(Article)
        .options(selectinload(Article.author), selectinload(Article.tags))
        .where(Article.id == article.id)
    )
    article = result.scalar_one()
    return article


@router.post("/me/articles/{article_id}/submit", response_model=ArticleResponse,
             dependencies=[Depends(rate_limit("article_submit", limit=3, window_seconds=86400, key_scope="user"))])
async def submit_my_article(
    article_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    提交自己的文章进入审核（仅 draft/rejected；置 pending_review 并清空驳回理由）
    """
    article = await _get_own_article(
        article_id, user, db,
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
    article = result.scalar_one()
    return article


@router.delete("/me/articles/{article_id}")
async def delete_my_article(
    article_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """删除自己的文章（已发布的不可删，需走管理员下架流程）"""
    article = await _get_own_article(
        article_id, user, db,
    )

    if article.status == "published":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="已发布的文章不能删除"
        )

    await db.delete(article)
    await db.commit()
    return {"message": "删除成功"}


# ==================== 公开作者页 ====================

@router.get("/{username}", response_model=UserProfilePublic)
async def get_public_profile(
    username: str,
    db: AsyncSession = Depends(get_db)
):
    """
    公开作者页：公开资料（不含 email）+ 已发布文章列表
    """
    user = (await db.execute(select(User).where(User.username == username))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="用户不存在")

    articles = (await db.execute(
        select(Article)
        .options(selectinload(Article.author), selectinload(Article.tags))
        .where(Article.author_id == user.id)
        .where(Article.status == "published")
        .order_by(Article.published_at.desc(), Article.id.desc())
    )).scalars().all()

    # 不直接 model_validate(user)：User.articles 是全量文章关系（含草稿），必须避开
    profile = UserProfilePublic(
        **UserPublicSafe.model_validate(user).model_dump(),
        articles=[ArticleListResponse.model_validate(a) for a in articles],
    )
    return profile
