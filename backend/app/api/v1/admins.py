"""
管理员 API
"""

from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ...core.database import get_db
from ...core.security import get_password_hash, verify_password
from ...core.deps import get_current_admin, get_super_admin
from ...models.admin import Admin
from ...schemas.admin import (
    AdminCreate, AdminUpdate, AdminPasswordUpdate, AdminResponse
)
from ...schemas.common import ResponseModel

router = APIRouter()


@router.get("", response_model=List[AdminResponse])
async def get_admins(
    db: AsyncSession = Depends(get_db),
    admin: Admin = Depends(get_super_admin)
):
    """
    获取管理员列表（仅超级管理员）
    """
    result = await db.execute(select(Admin).order_by(Admin.created_at.desc()))
    admins = result.scalars().all()
    return [AdminResponse.model_validate(a) for a in admins]


@router.post("", response_model=AdminResponse)
async def create_admin(
    admin_data: AdminCreate,
    db: AsyncSession = Depends(get_db),
    current_admin: Admin = Depends(get_super_admin)
):
    """
    创建管理员（仅超级管理员）
    """
    # 检查用户名是否已存在
    result = await db.execute(
        select(Admin).where(Admin.username == admin_data.username)
    )
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="用户名已存在"
        )
    
    # 检查邮箱是否已存在
    if admin_data.email:
        result = await db.execute(
            select(Admin).where(Admin.email == admin_data.email)
        )
        if result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="邮箱已被使用"
            )
    
    # 创建管理员
    admin = Admin(
        username=admin_data.username,
        email=admin_data.email,
        password_hash=get_password_hash(admin_data.password),
        display_name=admin_data.display_name,
        avatar_url=admin_data.avatar_url,
        bio=admin_data.bio,
        role=admin_data.role if admin_data.role in ["super_admin", "admin"] else "admin"
    )
    
    db.add(admin)
    await db.commit()
    await db.refresh(admin)
    
    return AdminResponse.model_validate(admin)


@router.get("/{admin_id}", response_model=AdminResponse)
async def get_admin(
    admin_id: int,
    db: AsyncSession = Depends(get_db),
    current_admin: Admin = Depends(get_super_admin)
):
    """
    获取管理员详情（仅超级管理员）
    """
    result = await db.execute(select(Admin).where(Admin.id == admin_id))
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
    current_admin: Admin = Depends(get_current_admin)
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
    
    result = await db.execute(select(Admin).where(Admin.id == admin_id))
    admin = result.scalar_one_or_none()
    
    if not admin:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="管理员不存在"
        )
    
    # 更新字段
    update_data = admin_data.model_dump(exclude_unset=True)
    
    # 普通管理员不能修改 is_active 状态
    if current_admin.role != "super_admin" and "is_active" in update_data:
        del update_data["is_active"]
    
    for field, value in update_data.items():
        setattr(admin, field, value)
    
    await db.commit()
    await db.refresh(admin)
    
    return AdminResponse.model_validate(admin)


@router.delete("/{admin_id}")
async def delete_admin(
    admin_id: int,
    db: AsyncSession = Depends(get_db),
    current_admin: Admin = Depends(get_super_admin)
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
    
    result = await db.execute(select(Admin).where(Admin.id == admin_id))
    admin = result.scalar_one_or_none()
    
    if not admin:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="管理员不存在"
        )
    
    await db.delete(admin)
    await db.commit()
    
    return {"message": "删除成功"}


@router.put("/{admin_id}/password")
async def update_password(
    admin_id: int,
    password_data: AdminPasswordUpdate,
    db: AsyncSession = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin)
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
    
    result = await db.execute(select(Admin).where(Admin.id == admin_id))
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
        if not verify_password(password_data.old_password, admin.password_hash):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="旧密码错误"
            )
    
    # 更新密码
    admin.password_hash = get_password_hash(password_data.new_password)
    await db.commit()
    
    return {"message": "密码修改成功"}
