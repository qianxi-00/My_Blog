"""
依赖注入模块
FastAPI 路由依赖

2026-09-24 用户系统改造：认证改查 users 表 + 角色门。
admins 表退役为休眠表；get_current_admin / get_current_admin_optional / get_super_admin
三个函数名保留不动（几十个 import 站点零改动），返回值从 Admin 变为 User——
User 是 Admin 字段的超集（is_active 有 property 兼容），旧调用站点运行时无感知。
"""

from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from .database import get_db
from .security import decode_access_token
from ..models.user import User


# HTTP Bearer 认证方案
security = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: AsyncSession = Depends(get_db)
) -> User:
    """
    获取当前登录用户（Bearer token -> users 表）

    Args:
        credentials: HTTP Bearer 凭证
        db: 数据库会话

    Returns:
        当前用户对象

    Raises:
        HTTPException: 认证失败时抛出 401，账号被禁用时抛出 403
    """
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="未提供认证凭证",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials
    payload = decode_access_token(token)

    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无效的认证令牌",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id: Optional[str] = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无效的令牌内容",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 查询用户（不信任 token 里的角色信息，一律以数据库行为准，防提权）
    result = await db.execute(select(User).where(User.id == int(user_id)))
    user = result.scalar_one_or_none()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户不存在",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if user.status != "active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="账号已被禁用",
        )

    return user


async def get_current_admin(
    user: User = Depends(get_current_user)
) -> User:
    """
    获取当前登录的管理员（函数名保留，实现改为查 User + 角色门）

    Args:
        user: 当前登录用户

    Returns:
        当前管理员用户对象（role 为 admin 或 super_admin）

    Raises:
        HTTPException: 认证失败时抛出 401，权限不足时抛出 403
    """
    if user.role not in ("admin", "super_admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="需要管理员权限",
        )
    return user


async def get_current_admin_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: AsyncSession = Depends(get_db)
) -> Optional[User]:
    """
    可选的管理员认证（函数名保留）
    如果提供了有效凭证且角色为管理员则返回用户，否则返回 None
    """
    if credentials is None:
        return None

    try:
        user = await get_current_user(credentials, db)
        return await get_current_admin(user)
    except HTTPException:
        return None


async def get_super_admin(
    admin: User = Depends(get_current_admin)
) -> User:
    """
    获取当前超级管理员（函数名保留）

    Args:
        admin: 当前管理员

    Returns:
        超级管理员用户对象

    Raises:
        HTTPException: 非超级管理员时抛出 403 错误
    """
    if admin.role != "super_admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="需要超级管理员权限",
        )
    return admin
