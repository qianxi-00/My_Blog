"""
认证 API

2026-09-24 用户系统改造：
- 登录/资料/密码端点改查 users 表，响应 JSON 形状向后兼容（可加字段不删字段）
- 新增 POST /register 用户注册（站点设置 user_registration_enabled 控制开关）
"""

import logging
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ...core.database import get_db
from ...core.config import settings
from ...core.deps import get_current_admin, get_current_user
from ...core.ratelimit import rate_limit
from ...core.security import verify_password, create_access_token, get_password_hash, utc_now_naive
from ...models.user import User
from ...models.settings import SiteSetting
from ...schemas.admin import (
    AdminLogin, 
    AdminLoginResponse, 
    AdminResponse,
    AdminUpdate,
    AdminPasswordUpdate
)
from ...schemas.user import (
    UserPublic, UserRegister, UserRegisterResponse,
    EmailCodeRequest, PasswordResetCodeRequest, PasswordResetRequest,
)
from ...services.verification_service import (
    send_code, verify_code, VerificationError,
)

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


logger = logging.getLogger(__name__)


@router.post("/login", response_model=AdminLoginResponse,
             dependencies=[Depends(rate_limit("login", limit=10, window_seconds=60, key_scope="ip"))])
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
    
    # 记录最后登录时间（2026-09-26 二期）
    # 用 Python 值（utc_now_naive）而非 func.now()：SQL 表达式赋值 + updated_at 的
    # onupdate=func.now() 都会让属性在 flush 后处于过期态，随后的同步序列化
    # （AdminResponse.model_validate）读过期属性会触发 lazy IO -> MissingGreenlet -> 500。
    # commit 后 refresh 一次，跟本文件注册路径/仓库既有约定一致。
    user.last_login_at = utc_now_naive()
    await db.commit()
    await db.refresh(user)
    
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


def _client_ip(request: Request) -> str:
    """真实客户端 IP（uvicorn --proxy-headers 时为 X-Forwarded-For 首个）"""
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


@router.post("/register/code",
             dependencies=[Depends(rate_limit("email_code", limit=10, window_seconds=3600, key_scope="ip"))])
async def register_code(
    data: EmailCodeRequest,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """
    发送注册验证码（公开；同 IP 10 次/小时，同邮箱 60 秒冷却 / 5 次每天）
    """
    if not await _registration_enabled(db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="注册暂未开放"
        )
    try:
        expires_in = await send_code(db, data.email, "register", ip=_client_ip(request))
    except VerificationError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=e.message)
    except RuntimeError as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(e))
    return {"message": "验证码已发送", "expires_in": expires_in}


@router.post("/register", response_model=UserRegisterResponse, status_code=201,
             dependencies=[Depends(rate_limit("auth_register", limit=5, window_seconds=3600, key_scope="ip"))])
async def register(
    register_data: UserRegister,
    db: AsyncSession = Depends(get_db)
):
    """
    用户注册（2026-09-26 二期：邮箱验证码强制；site_settings.user_registration_enabled 关闭时 403）
    """
    if not await _registration_enabled(db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="注册暂未开放"
        )
    
    # 邮箱验证码（purpose=register，错 5 次作废）
    try:
        await verify_code(db, register_data.email, "register", register_data.code)
    except VerificationError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=e.message)
    
    # 用户名唯一（正则校验在 UserRegister schema 完成）
    result = await db.execute(
        select(User).where(User.username == register_data.username)
    )
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="用户名已存在"
        )
    
    # 邮箱唯一（必填，schema 校验格式）
    result = await db.execute(
        select(User).where(User.email == register_data.email.strip().lower())
    )
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="该邮箱已被使用"
        )
    
    user = User(
        username=register_data.username,
        email=register_data.email.strip().lower(),
        password_hash=await get_password_hash(register_data.password),
        display_name=register_data.display_name or register_data.username,
        role="user",
        email_verified=True,  # 走验证码注册，视为已验证
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


# ===== 2026-09-26 二期：自助重置密码（邮箱验证码） =====

@router.post("/password/reset/code",
             dependencies=[Depends(rate_limit("email_code", limit=10, window_seconds=3600, key_scope="ip"))])
async def password_reset_code(
    data: PasswordResetCodeRequest,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """
    发起自助重置密码：发送验证码。
    无论邮箱是否存在都返回同样的成功提示（防枚举）；存在才真发码。
    """
    email = data.email.strip().lower()
    user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
    try:
        # 邮箱不存在时也走同一套域名/冷却/频率校验并落库（只是不真发信）：
        # 任何差异化响应（"该域名不支持""发送太频繁"）都会把这个端点变成"该邮箱是否已注册"的预言机
        await send_code(db, email, "reset", ip=_client_ip(request), deliver=user is not None)
    except (VerificationError, RuntimeError) as e:
        logger.warning("发送重置验证码未成功（对外统一同一句提示）: %s", e)
    return {"message": "如果该邮箱已注册，验证码已发送，请查收"}


@router.post("/password/reset",
             dependencies=[Depends(rate_limit("password_reset", limit=5, window_seconds=3600, key_scope="ip"))])
async def password_reset(
    data: PasswordResetRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    自助重置密码（第二步）：邮箱验证码 + 新密码。
    成功后写 password_changed_at，旧 token 立即失效。
    """
    email = data.email.strip().lower()
    user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if user is None:
        # 不泄露注册情况：与"验证码错误"同形（码不存在本来也到不了这里）
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="验证码错误或已过期，请重新获取")

    try:
        await verify_code(db, email, "reset", data.code)
    except VerificationError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=e.message)

    user.password_hash = await get_password_hash(data.new_password)
    user.password_changed_at = utc_now_naive()  # 踢掉所有旧 token
    await db.commit()

    return {"message": "密码已重置，请使用新密码登录"}


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
    # 这是"改自己的密码"：旧密码必填，不允许省略即改密（2026-09-28 修复）
    if not password_in.old_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="请提供旧密码"
        )
    if not await verify_password(password_in.old_password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="旧密码错误"
        )
        
    # Set new password
    user.password_hash = await get_password_hash(password_in.new_password)
    user.password_changed_at = utc_now_naive()  # 踢掉所有旧 token（2026-09-26 二期）
    
    await db.commit()
    return {"message": "密码修改成功"}
