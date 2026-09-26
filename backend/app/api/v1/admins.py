"""
管理员 API

2026-09-24 用户系统改造：操作对象从 admins 表切到 users 表（role in admin/super_admin）。
端点路径与响应形状保持向后兼容（AdminResponse 字段是 User 字段的子集，User.is_active 为只读 property）。
新增普通用户管理（列表 / 封禁 / 解封）。
"""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_

from ...core.database import get_db
from ...core.security import get_password_hash, verify_password
from ...core.deps import get_current_admin, get_super_admin
from ...models.user import User
from ...schemas.admin import (
    AdminCreate, AdminUpdate, AdminPasswordUpdate, AdminResponse
)
from ...schemas.common import PaginatedResponse

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

@router.get("/users", response_model=PaginatedResponse[AdminResponse])
async def get_users(
    search: Optional[str] = Query(None, description="按用户名/昵称搜索"),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin)
):
    """
    普通用户列表（role == "user"，不含管理员；仅管理员可访问）
    """
    query = select(User).where(User.role == "user")

    if search:
        keyword = f"%{search.strip()}%"
        query = query.where(
            or_(User.username.ilike(keyword), User.display_name.ilike(keyword))
        )

    total = (await db.execute(
        select(func.count()).select_from(query.order_by(None).subquery())
    )).scalar() or 0

    query = query.order_by(User.created_at.desc(), User.id.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)
    users = (await db.execute(query)).scalars().all()

    return PaginatedResponse(
        data=[AdminResponse.model_validate(u) for u in users],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=(total + page_size - 1) // page_size
    )


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
