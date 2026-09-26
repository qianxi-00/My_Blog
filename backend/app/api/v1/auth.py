"""
认证 API

2026-09-24 用户系统改造：
- 登录/资料/密码端点改查 users 表，响应 JSON 形状向后兼容（可加字段不删字段）
- 新增 POST /register 用户注册（站点设置 user_registration_enabled 控制开关）
"""

from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ...core.database import get_db
from ...core.config import settings
from ...core.deps import get_current_admin, get_current_user
from ...core.ratelimit import rate_limit
from ...models.user import User
from ...models.settings import SiteSetting
from ...schemas.admin import (
    AdminLogin, 
    AdminLoginResponse, 
    AdminResponse,
    AdminUpdate,
    AdminPasswordUpdate
)
from ...schemas.user import UserPublic, UserRegister, UserRegisterResponse
from ...core.security import verify_password, create_access_token, get_password_hash

router = APIRouter()


async def _registration_enabled(db: AsyncSession) -> bool:
    """读站点设置 user_registration_enabled，缺省视为开启（"true"）"""
    result = await db.execute(
        select(SiteSetting).where(SiteSetting.key == "user_registration_enabled")
    )
    setting = result.scalar_one_or_none()
    if setting is None or setting.value is None:
        return True
    return str(setting.value).strip().lower() not in ("false", "0", "no", "off")


@router.post("/login", response_model=AdminLoginResponse)
async def login(
    login_data: AdminLogin,
    db: AsyncSession = Depends(get_db)
):
    """
    登录（users 表，user/admin/super_admin 都在此登录；
    响应形状保持旧版兼容，admin 字段为当前用户序列化）
    """
    # 查询用户
    result = await db.execute(
        select(User).where(User.username == login_data.username)
    )
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名或密码错误"
        )
    
    # 验证密码
    if not await verify_password(login_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名或密码错误"
        )
    
    # 检查账号状态
    if user.status != "active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="账号已被禁用"
        )
    
    # 生成 Token
    expires_delta = timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": str(user.id)},
        expires_delta=expires_delta
    )
    
    return AdminLoginResponse(
        access_token=access_token,
        token_type="bearer",
        expires_in=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        admin=AdminResponse.model_validate(user)
    )


@router.post("/register", response_model=UserRegisterResponse, status_code=201,
             dependencies=[Depends(rate_limit("auth_register", limit=5, window_seconds=3600, key_scope="ip"))])
async def register(
    register_data: UserRegister,
    db: AsyncSession = Depends(get_db)
):
    """
    用户注册（公开；site_settings.user_registration_enabled 关闭时 403）
    """
    if not await _registration_enabled(db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="注册暂未开放"
        )
    
    # 用户名唯一（正则校验在 UserRegister schema 完成）
    result = await db.execute(
        select(User).where(User.username == register_data.username)
    )
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="用户名已存在"
        )
    
    # 邮箱可选，提供则唯一（格式校验在 schema 完成）
    if register_data.email:
        result = await db.execute(
            select(User).where(User.email == register_data.email)
        )
        if result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="该邮箱已被使用"
            )
    
    user = User(
        username=register_data.username,
        email=register_data.email,
        password_hash=await get_password_hash(register_data.password),
        display_name=register_data.display_name or register_data.username,
        role="user",
    )
    
    db.add(user)
    await db.commit()
    await db.refresh(user)
    
    # 注册即登录：直接发 token
    expires_delta = timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": str(user.id)},
        expires_delta=expires_delta
    )
    
    return UserRegisterResponse(
        access_token=access_token,
        user=UserPublic.model_validate(user)
    )


@router.post("/logout")
async def logout(
    user: User = Depends(get_current_user)
):
    """
    退出登录（任何已登录用户都可调用）
    注意：JWT 是无状态的，这里只是一个形式上的接口
    客户端应该删除本地存储的 Token
    """
    return {"message": "退出成功"}


@router.get("/me", response_model=AdminResponse)
async def get_current_admin_info(
    user: User = Depends(get_current_admin)
):
    """
    获取当前登录管理员信息（AdminResponse 自带 role 字段，形状不变）
    """
    return AdminResponse.model_validate(user)


@router.put("/me", response_model=AdminResponse)
async def update_profile(
    profile_in: AdminUpdate,
    user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """
    更新个人资料
    """
    # 如果修改了邮箱，检查唯一性
    if profile_in.email and profile_in.email != user.email:
        existing_email = await db.scalar(
            select(User).where(User.email == profile_in.email)
        )
        if existing_email:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="该邮箱已被使用"
            )
            
    # 更新字段（is_active 是 User 的只读 property，落到 status）
    update_data = profile_in.model_dump(exclude_unset=True)
    is_active = update_data.pop("is_active", None)
    if is_active is not None:
        user.status = "active" if is_active else "banned"
    for field, value in update_data.items():
        setattr(user, field, value)
        
    await db.commit()
    await db.refresh(user)
    return user


@router.put("/password")
async def update_password(
    password_in: AdminPasswordUpdate,
    user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """
    修改密码
    """
    # 验证旧密码 (verify_password first arg is plain, second is hashed)
    if password_in.old_password:
        if not await verify_password(password_in.old_password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="旧密码错误"
            )
        
    # Set new password
    user.password_hash = await get_password_hash(password_in.new_password)
    
    await db.commit()
    return {"message": "密码修改成功"}
