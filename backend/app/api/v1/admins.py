"""
管理员 API

2026-09-24 用户系统改造：操作对象从 admins 表切到 users 表（role in admin/super_admin）。
端点路径与响应形状保持向后兼容（AdminResponse 字段是 User 字段的子集，User.is_active 为只读 property）。
新增普通用户管理（列表 / 封禁 / 解封）。
"""

from typing import List, Optional
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, update
import secrets

from ...core.database import get_db
from ...core.security import get_password_hash, verify_password, utc_now_naive
from ...core.deps import get_current_admin, get_super_admin
from ...models.user import User
from ...models.article import Article
from ...models.comment import Comment
from ...models.prompt import Prompt
from ...schemas.admin import (
    AdminCreate, AdminUpdate, AdminPasswordUpdate, AdminResponse, AdminUserListItem
)
from ...schemas.common import PaginatedResponse
# 复用文章删除时的缓存失效（articles.py 不反向 import 本模块，无循环风险）
from .articles import _invalidate_article_caches

router = APIRouter()

ADMIN_ROLES = ("admin", "super_admin")


def _apply_admin_update(user: User, update_data: dict) -> str | None:
    """
    把 AdminUpdate 的字段落到 User 上。

    is_active 在 User 上是只读 property（映射 status 列），必须转换而不能 setattr，
    否则 AttributeError: can't set attribute。
    """
    is_active = update_data.pop("is_active", None)
    if is_active is not None:
        user.status = "active" if is_active else "banned"
    for field, value in update_data.items():
        setattr(user, field, value)
    return None


# ==================== 普通用户管理（必须在 /{admin_id} 之前注册） ====================

@router.get("/users/stats")
async def users_stats(
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin)
):
    """用户管理卡片统计（admin+）"""
    total = (await db.execute(select(func.count()).select_from(User))).scalar() or 0
    regular = (await db.execute(
        select(func.count()).select_from(User).where(User.role == "user")
    )).scalar() or 0
    admins = (await db.execute(
        select(func.count()).select_from(User).where(User.role.in_(ADMIN_ROLES))
    )).scalar() or 0
    banned = (await db.execute(
        select(func.count()).select_from(User).where(User.status == "banned")
    )).scalar() or 0
    today_new = (await db.execute(
        select(func.count()).select_from(User).where(User.created_at >= utc_now_naive() - timedelta(days=1))
    )).scalar() or 0
    pending_articles = (await db.execute(
        select(func.count()).select_from(Article).where(Article.status == "pending_review")
    )).scalar() or 0
    return {
        "total": total,
        "regular": regular,
        "admins": admins,
        "banned": banned,
        "today_new": today_new,
        "pending_articles": pending_articles,
    }


@router.get("/users", response_model=PaginatedResponse[AdminUserListItem])
async def get_users(
    search: Optional[str] = Query(None, description="按用户名/昵称/邮箱搜索"),
    status_filter: Optional[str] = Query(None, alias="status", description="active/banned，缺省全部"),
    role_filter: Optional[str] = Query(None, alias="role", description="user/admin/super_admin，缺省全部"),
    sort: str = Query("created_at", description="created_at/last_login_at/article_count"),
    order: str = Query("desc", description="asc/desc"),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin)
):
    """
    用户列表（admin+；role/status 筛选 + 排序 + 按邮箱搜索 + 带统计）

    统计用相关子查询，不碰 User.articles / User.comments 关系（那是 selectin 级联加载）。
    """
    query = select(User)

    if role_filter in ("user", "admin", "super_admin"):
        query = query.where(User.role == role_filter)
    if status_filter in ("active", "banned"):
        query = query.where(User.status == status_filter)
    if search:
        keyword = f"%{search.strip()}%"
        query = query.where(or_(
            User.username.ilike(keyword),
            User.display_name.ilike(keyword),
            User.email.ilike(keyword),
        ))

    total = (await db.execute(
        select(func.count()).select_from(query.order_by(None).subquery())
    )).scalar() or 0

    # 统计子查询（相关）
    article_count_sq = (
        select(func.count(Article.id))
        .where(Article.author_id == User.id)
        .correlate(User)
        .scalar_subquery()
    )
    comment_count_sq = (
        select(func.count(Comment.id))
        .where(Comment.user_id == User.id)
        .correlate(User)
        .scalar_subquery()
    )

    # 排序（白名单字段，缺省 created_at desc）
    sort_col = {
        "created_at": User.created_at,
        "last_login_at": User.last_login_at,
        "article_count": article_count_sq,
    }.get(sort, User.created_at)
    order_expr = sort_col.asc() if order == "asc" else sort_col.desc()

    query = query.order_by(order_expr, User.id.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)
    users = (await db.execute(query)).scalars().all()

    # 每页统计用两条聚合补齐（不逐用户发查询，也不加载关系）
    ids = [u.id for u in users]
    art_counts: dict = {}
    com_counts: dict = {}
    if ids:
        art_counts = dict((await db.execute(
            select(Article.author_id, func.count())
            .where(Article.author_id.in_(ids))
            .group_by(Article.author_id)
        )).all())
        com_counts = dict((await db.execute(
            select(Comment.user_id, func.count())
            .where(Comment.user_id.in_(ids))
            .group_by(Comment.user_id)
        )).all())

    return PaginatedResponse(
        data=[
            AdminUserListItem.from_user(u, art_counts.get(u.id, 0) or 0, com_counts.get(u.id, 0) or 0)
            for u in users
        ],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=(total + page_size - 1) // page_size
    )


@router.get("/users/{user_id}")
async def user_detail(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin)
):
    """
    用户详情（admin+）：资料 + 统计 + 最近 20 篇文章 + 最近 20 条评论
    """
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="用户不存在")

    art_by_status = dict((await db.execute(
        select(Article.status, func.count())
        .where(Article.author_id == user_id)
        .group_by(Article.status)
    )).all())
    comment_count = (await db.execute(
        select(func.count()).select_from(Comment).where(Comment.user_id == user_id)
    )).scalar() or 0

    articles = (await db.execute(
        select(Article.id, Article.title, Article.status, Article.category,
               Article.created_at, Article.published_at)
        .where(Article.author_id == user_id)
        .order_by(Article.created_at.desc(), Article.id.desc())
        .limit(20)
    )).all()

    comments = (await db.execute(
        select(Comment.id, Comment.content, Comment.status,
               Comment.target_type, Comment.target_id, Comment.created_at)
        .where(Comment.user_id == user_id)
        .order_by(Comment.created_at.desc(), Comment.id.desc())
        .limit(20)
    )).all()

    return {
        **AdminResponse.model_validate(user).model_dump(),
        "email_verified": user.email_verified,
        "last_login_at": user.last_login_at,
        "stats": {
            "articles_total": sum(art_by_status.values()),
            "articles_published": art_by_status.get("published", 0),
            "articles_pending": art_by_status.get("pending_review", 0),
            "articles_rejected": art_by_status.get("rejected", 0),
            "articles_draft": art_by_status.get("draft", 0),
            "comments_total": comment_count,
        },
        "recent_articles": [
            {
                "id": a.id, "title": a.title, "status": a.status, "category": a.category,
                "created_at": a.created_at, "published_at": a.published_at,
            } for a in articles
        ],
        "recent_comments": [
            {
                "id": c.id,
                "content": (c.content[:100] + "...") if c.content and len(c.content) > 100 else c.content,
                "status": c.status, "target_type": c.target_type, "target_id": c.target_id,
                "created_at": c.created_at,
            } for c in comments
        ],
    }


@router.put("/users/{user_id}/ban")
async def ban_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin)
):
    """封禁普通用户（不能封禁管理员账号）"""
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="用户不存在")
    if user.role in ADMIN_ROLES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="不能封禁管理员账号")

    user.status = "banned"
    await db.commit()
    return {"message": "已封禁"}


@router.put("/users/{user_id}/unban")
async def unban_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin)
):
    """解封用户"""
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="用户不存在")

    user.status = "active"
    await db.commit()
    return {"message": "已解封"}


@router.put("/users/{user_id}/password")
async def reset_user_password(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin)
):
    """
    重置用户密码（admin+）：生成 12 位随机临时密码，响应里一次性返回，不落明文。
    成功后写 password_changed_at，该用户所有旧 token 立即失效。
    目标是管理员账号时 403（走 /admins/{id}/password）。
    """
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="用户不存在")
    if user.role in ADMIN_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="管理员账号请走管理员密码接口")

    temp_password = secrets.token_urlsafe(9)  # 12 位 URL 安全字符
    user.password_hash = await get_password_hash(temp_password)
    user.password_changed_at = utc_now_naive()
    await db.commit()

    return {"message": "密码已重置，请立即转告用户（仅此一次显示）", "temp_password": temp_password}


@router.put("/users/{user_id}/role")
async def set_user_role(
    user_id: int,
    data: dict,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_super_admin)
):
    """
    改角色（仅超管）：user <-> admin。
    不能改自己；超管角色请走管理员管理（不在这里降级/删除超管）。
    """
    role = data.get("role")
    if role not in ("user", "admin"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="role 必须是 user 或 admin")

    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="用户不存在")
    if user.id == current_admin.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="不能修改自己的角色")
    if user.role == "super_admin":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="超级管理员请通过管理员管理调整")

    user.role = role
    await db.commit()
    return {"message": "角色已更新", "role": role}


@router.put("/users/{user_id}/email")
async def set_user_email(
    user_id: int,
    data: dict,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_super_admin)
):
    """
    给用户绑定/更换邮箱（仅超管；管理员设置的邮箱视为已验证）。
    传空字符串解除绑定。
    """
    email = (data.get("email") or "").strip().lower() or None
    if email and "@" not in email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="邮箱格式不正确")

    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="用户不存在")

    if email:
        existing = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
        if existing and existing.id != user.id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="该邮箱已被使用")

    user.email = email
    user.email_verified = bool(email)
    await db.commit()
    return {"message": "邮箱已更新", "email": email, "email_verified": user.email_verified}


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: int,
    with_content: bool = False,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_super_admin)
):
    """
    删除用户（仅超管）。不能删自己、不能删最后一个超级管理员。

    内容归属（2026-09-26 二期实测修正）：
    - 评论 / 提示词：user_id / author_id 可空 → 置空保留内容；
    - 文章：Article.author_id 是 NOT NULL（模型 nullable=False，线上库同），**置空会
      直接 IntegrityError**。所以文章按「显式确认」处理：
        · 该用户有文章且未带 with_content=true → 409，附带文章/评论/提示词数量，让前台先确认；
        · 带 with_content=true → 逐篇走 ORM db.delete()（与 DELETE /articles/{id} 同路径，
          连二级表 article_tags 一并清理）+ 失效文章缓存。
      注意：本应用从未设置 PRAGMA foreign_keys，SQLite 默认 FK 关闭，ondelete=CASCADE
      实际不会触发，因此这里不能依赖级联、也不能用批量 delete(Article)。
    """
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="用户不存在")
    if user.id == current_admin.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="不能删除自己")

    if user.role == "super_admin":
        remaining = (await db.execute(
            select(func.count()).select_from(User)
            .where(User.role == "super_admin", User.id != user_id)
        )).scalar() or 0
        if remaining == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="不能删除最后一个超级管理员"
            )

    counts = {
        "articles": (await db.execute(
            select(func.count()).select_from(Article).where(Article.author_id == user_id)
        )).scalar() or 0,
        "comments": (await db.execute(
            select(func.count()).select_from(Comment).where(Comment.user_id == user_id)
        )).scalar() or 0,
        "prompts": (await db.execute(
            select(func.count()).select_from(Prompt).where(Prompt.author_id == user_id)
        )).scalar() or 0,
    }

    if counts["articles"] and not with_content:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"该用户还有 {counts['articles']} 篇文章（评论 {counts['comments']} 条、"
                f"提示词 {counts['prompts']} 个）。文章作者不能为空，删除用户会一并删除这些文章；"
                f"确认请带 with_content=true 重试。"
            ),
        )

    # 文章：逐篇 ORM 删除（与 DELETE /articles/{id} 完全同路径）+ 清缓存
    if counts["articles"]:
        articles = (await db.execute(
            select(Article).where(Article.author_id == user_id)
        )).scalars().all()
        for article in articles:
            await db.delete(article)
        await db.flush()  # 让后续计数/删除在同一事务里看到结果
        for article in articles:
            await _invalidate_article_caches(article.id)

    # 评论 / 提示词：可空 → 置空保留
    await db.execute(update(Comment).where(Comment.user_id == user_id).values(user_id=None))
    await db.execute(update(Prompt).where(Prompt.author_id == user_id).values(author_id=None))

    await db.delete(user)
    await db.commit()

    return {
        "message": "已删除" + ("（其文章已一并删除）" if counts["articles"] else "（其内容归属已置空保留）"),
        "deleted_articles": counts["articles"],
        "orphaned_comments": counts["comments"],
        "orphaned_prompts": counts["prompts"],
    }


# ==================== 管理员管理 ====================

@router.get("", response_model=List[AdminResponse])
async def get_admins(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_super_admin)
):
    """
    获取管理员列表（仅超级管理员）
    """
    result = await db.execute(
        select(User).where(User.role.in_(ADMIN_ROLES)).order_by(User.created_at.desc())
    )
    admins = result.scalars().all()
    return [AdminResponse.model_validate(a) for a in admins]


@router.post("", response_model=AdminResponse)
async def create_admin(
    admin_data: AdminCreate,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_super_admin)
):
    """
    创建管理员（仅超级管理员）
    """
    # 检查用户名是否已存在
    result = await db.execute(
        select(User).where(User.username == admin_data.username)
    )
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="用户名已存在"
        )

    # 检查邮箱是否已存在
    if admin_data.email:
        result = await db.execute(
            select(User).where(User.email == admin_data.email)
        )
        if result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="邮箱已被使用"
            )

    # 创建管理员（users 表，role 限定为管理员角色）
    admin = User(
        username=admin_data.username,
        email=admin_data.email,
        password_hash=await get_password_hash(admin_data.password),
        display_name=admin_data.display_name or admin_data.username,
        avatar_url=admin_data.avatar_url,
        bio=admin_data.bio,
        qq=admin_data.qq,
        wechat=admin_data.wechat,
        github=admin_data.github,
        bilibili=admin_data.bilibili,
        role=admin_data.role if admin_data.role in ADMIN_ROLES else "admin",
        status="active",
    )

    db.add(admin)
    await db.commit()
    await db.refresh(admin)

    return AdminResponse.model_validate(admin)


@router.get("/{admin_id}", response_model=AdminResponse)
async def get_admin(
    admin_id: int,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_super_admin)
):
    """
    获取管理员详情（仅超级管理员）
    """
    result = await db.execute(
        select(User).where(User.id == admin_id, User.role.in_(ADMIN_ROLES))
    )
    admin = result.scalar_one_or_none()

    if not admin:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="管理员不存在"
        )

    return AdminResponse.model_validate(admin)


@router.put("/{admin_id}", response_model=AdminResponse)
async def update_admin(
    admin_id: int,
    admin_data: AdminUpdate,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin)
):
    """
    更新管理员信息（超级管理员或本人）
    """
    # 权限检查：超级管理员可以修改任何人，普通管理员只能修改自己
    if current_admin.role != "super_admin" and current_admin.id != admin_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="权限不足"
        )

    result = await db.execute(
        select(User).where(User.id == admin_id, User.role.in_(ADMIN_ROLES))
    )
    admin = result.scalar_one_or_none()

    if not admin:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="管理员不存在"
        )

    update_data = admin_data.model_dump(exclude_unset=True)

    # 普通管理员不能修改启用状态
    if current_admin.role != "super_admin":
        update_data.pop("is_active", None)

    _apply_admin_update(admin, update_data)

    await db.commit()
    await db.refresh(admin)

    return AdminResponse.model_validate(admin)


@router.delete("/{admin_id}")
async def delete_admin(
    admin_id: int,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_super_admin)
):
    """
    删除管理员（仅超级管理员）
    """
    # 不能删除自己
    if current_admin.id == admin_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="不能删除自己"
        )

    result = await db.execute(
        select(User).where(User.id == admin_id, User.role.in_(ADMIN_ROLES))
    )
    admin = result.scalar_one_or_none()

    if not admin:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="管理员不存在"
        )

    # 不能删掉最后一个超级管理员（防锁死后台）
    if admin.role == "super_admin":
        remaining = (await db.execute(
            select(func.count()).select_from(User)
            .where(User.role == "super_admin", User.id != admin_id)
        )).scalar() or 0
        if remaining == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="不能删除最后一个超级管理员"
            )

    await db.delete(admin)
    await db.commit()

    return {"message": "删除成功"}


@router.put("/{admin_id}/password")
async def update_password(
    admin_id: int,
    password_data: AdminPasswordUpdate,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin)
):
    """
    修改密码（超级管理员或本人）
    """
    # 权限检查
    if current_admin.role != "super_admin" and current_admin.id != admin_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="权限不足"
        )

    result = await db.execute(
        select(User).where(User.id == admin_id, User.role.in_(ADMIN_ROLES))
    )
    admin = result.scalar_one_or_none()

    if not admin:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="管理员不存在"
        )

    # 非超级管理员需要验证旧密码
    if current_admin.role != "super_admin":
        if not password_data.old_password:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="请提供旧密码"
            )
        if not await verify_password(password_data.old_password, admin.password_hash):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="旧密码错误"
            )

    # 更新密码
    admin.password_hash = await get_password_hash(password_data.new_password)
    await db.commit()

    return {"message": "密码修改成功"}
