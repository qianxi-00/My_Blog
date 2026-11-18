"""
认证 API

支持：
- 用户名或邮箱 + 密码登录（POST /login）
- 注册预检验证码 & 注册（POST /register/code, POST /register，适配 email_verification_required 开关）
- 邮箱验证码免密登录/自动建号（POST /login/code, POST /login/code/verify）
- 自助重置密码（POST /password/reset/code, POST /password/reset）
- 管理员自身信息维护（GET/PUT /me, PUT /password）
"""

from datetime import timedelta
import logging
import re
import secrets

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.config import settings
from ...core.database import get_db
from ...core.deps import get_current_admin, get_current_user
from ...core.ratelimit import rate_limit
from ...core.redis import CacheKeys, cache_delete
from ...core.security import create_access_token, get_password_hash, utc_now_naive, verify_password
from ...models.settings import SiteSetting
from ...models.user import User
from ...schemas.admin import (
    AdminLogin,
    AdminLoginResponse,
    AdminPasswordUpdate,
    AdminResponse,
    AdminUpdate,
)
from ...schemas.user import (
    EmailCodeRequest,
    EmailLoginCodeVerify,
    PasswordResetCodeRequest,
    PasswordResetRequest,
    UserPublic,
    UserRegister,
    UserRegisterResponse,
)
from ...services.verification_service import (
    VerificationError,
    _assert_domain_allowed,
    send_code,
    verify_code,
)

router = APIRouter()
logger = logging.getLogger(__name__)

RESERVED_USERNAMES = {"me", "admin", "admins", "login", "register", "system", "root"}
USERNAME_RE = re.compile(r"^[a-zA-Z0-9_-]{3,30}$")


async def _setting_bool(db: AsyncSession, key: str, default: bool = True) -> bool:
    result = await db.execute(select(SiteSetting).where(SiteSetting.key == key))
    setting = result.scalar_one_or_none()
    if setting is None or setting.value is None:
        return default
    return str(setting.value).strip().lower() not in ("false", "0", "no", "off")


async def _registration_enabled(db: AsyncSession) -> bool:
    """读站点设置 user_registration_enabled，缺省视为开启（true）"""
    return await _setting_bool(db, "user_registration_enabled", True)


async def _email_verification_required(db: AsyncSession) -> bool:
    """读站点设置 email_verification_required，缺省视为开启（true）"""
    return await _setting_bool(db, "email_verification_required", True)


def _client_ip(request: Request) -> str:
    """真实客户端 IP（uvicorn --proxy-headers 时为 X-Forwarded-For 首个）"""
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


async def _generate_unique_username(db: AsyncSession, email: str) -> str:
    """根据邮箱前缀生成合法且唯一的初始用户名（3-30 位 [a-zA-Z0-9_-]）"""
    local = email.split("@", 1)[0]
    cleaned = re.sub(r"[^a-zA-Z0-9_-]", "_", local)
    cleaned = re.sub(r"_{2,}", "_", cleaned).strip("_-")
    if not cleaned or cleaned.lower() in RESERVED_USERNAMES:
        cleaned = "user"
    if len(cleaned) < 3:
        cleaned = f"{cleaned}_u"[:20]
        if len(cleaned) < 3:
            cleaned = "user"
    base = cleaned[:18]

    for attempt in range(20):
        candidate = base if attempt == 0 else f"{base}_{secrets.token_hex(2)}"
        existing = (
            await db.execute(
                select(User.id).where(func.lower(User.username) == candidate.lower())
            )
        ).scalar_one_or_none()
        if existing is None and candidate.lower() not in RESERVED_USERNAMES:
            return candidate
    return f"user_{secrets.token_hex(4)}"


@router.post(
    "/login",
    response_model=AdminLoginResponse,
    dependencies=[Depends(rate_limit("login", limit=10, window_seconds=60, key_scope="ip"))],
)
async def login(
    login_data: AdminLogin,
    db: AsyncSession = Depends(get_db),
):
    """
    登录（users 表，支持用户名或完整邮箱 + 密码）
    """
    ident = login_data.username.strip()
    result = await db.execute(
        select(User).where(
            or_(
                User.username == ident,
                func.lower(User.email) == ident.lower(),
            )
        )
    )
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名/邮箱或密码错误",
        )

    if not user.has_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="该账号尚未设置密码，请使用邮箱验证码登录或在登录页通过找回密码设置密码",
        )

    if not await verify_password(login_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名/邮箱或密码错误",
        )

    if user.status != "active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="账号已被禁用",
        )

    user.last_login_at = utc_now_naive()
    await db.commit()
    await db.refresh(user)

    expires_delta = timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": str(user.id)},
        expires_delta=expires_delta,
    )

    return AdminLoginResponse(
        access_token=access_token,
        token_type="bearer",
        expires_in=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        admin=AdminResponse.model_validate(user),
        is_new_user=False,
    )


@router.post(
    "/login/code",
    dependencies=[Depends(rate_limit("email_code", limit=10, window_seconds=3600, key_scope="ip"))],
)
async def send_login_code(
    data: EmailCodeRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    发送邮箱免密登录验证码（未注册邮箱若站点开放注册则会在验证时自动建号）
    """
    email = data.email.strip().lower()
    existing = (
        await db.execute(select(User).where(func.lower(User.email) == email))
    ).scalar_one_or_none()

    if existing is not None:
        if existing.status != "active":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="账号已被禁用",
            )
    else:
        if not await _registration_enabled(db):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="注册暂未开放，请使用已有账号登录",
            )

    try:
        expires_in = await send_code(db, email, "login", ip=_client_ip(request))
    except VerificationError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=e.message)
    except RuntimeError as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(e))
    return {"message": "登录验证码已发送", "expires_in": expires_in}


@router.post(
    "/login/code/verify",
    response_model=AdminLoginResponse,
    dependencies=[Depends(rate_limit("login_otp", limit=15, window_seconds=60, key_scope="ip"))],
)
async def verify_login_code(
    data: EmailLoginCodeVerify,
    db: AsyncSession = Depends(get_db),
):
    """
    邮箱验证码免密登录（已存在直接登录；未注册邮箱在开放注册前提下自动创建账号并登录）
    """
    email = data.email.strip().lower()
    user = (
        await db.execute(select(User).where(func.lower(User.email) == email))
    ).scalar_one_or_none()

    if user is not None and user.status != "active":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="账号已被禁用")
    if user is None and not await _registration_enabled(db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="注册暂未开放")

    try:
        await verify_code(db, email, "login", data.code)
    except VerificationError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=e.message)

    if user is not None:
        user.email_verified = True
        user.last_login_at = utc_now_naive()
        is_new_user = False
    else:
        username = await _generate_unique_username(db, email)
        display = email.split("@", 1)[0][:40] or username
        user = User(
            username=username,
            email=email,
            password_hash=await get_password_hash(secrets.token_urlsafe(32)),
            display_name=display,
            role="user",
            status="active",
            email_verified=True,
            has_password=False,
            username_customized=False,
            last_login_at=utc_now_naive(),
        )
        db.add(user)
        is_new_user = True

    await db.commit()
    await db.refresh(user)

    expires_delta = timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": str(user.id)},
        expires_delta=expires_delta,
    )

    return AdminLoginResponse(
        access_token=access_token,
        token_type="bearer",
        expires_in=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        admin=AdminResponse.model_validate(user),
        is_new_user=is_new_user,
    )


@router.post(
    "/register/code",
    dependencies=[Depends(rate_limit("email_code", limit=10, window_seconds=3600, key_scope="ip"))],
)
async def register_code(
    data: EmailCodeRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    发送注册验证码（发码前先预检注册开关、可选用户名、邮箱唯一性，避免浪费邮件配额）
    """
    if not await _registration_enabled(db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="注册暂未开放",
        )

    if data.username is not None and data.username.strip():
        uname = data.username.strip()
        if not USERNAME_RE.match(uname) or uname.lower() in RESERVED_USERNAMES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="用户名仅支持 3-30 位字母、数字、下划线或连字符，且不能使用保留词",
            )
        exists_user = (
            await db.execute(select(User.id).where(func.lower(User.username) == uname.lower()))
        ).scalar_one_or_none()
        if exists_user is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="用户名已被占用",
            )

    email = data.email.strip().lower()
    exists_email = (
        await db.execute(select(User.id).where(func.lower(User.email) == email))
    ).scalar_one_or_none()
    if exists_email is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="该邮箱已被注册，请直接登录",
        )

    try:
        expires_in = await send_code(db, email, "register", ip=_client_ip(request))
    except VerificationError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=e.message)
    except RuntimeError as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(e))
    return {"message": "验证码已发送", "expires_in": expires_in}


@router.post(
    "/register",
    response_model=UserRegisterResponse,
    status_code=201,
    dependencies=[Depends(rate_limit("auth_register", limit=5, window_seconds=3600, key_scope="ip"))],
)
async def register(
    register_data: UserRegister,
    db: AsyncSession = Depends(get_db),
):
    """
    用户注册（尊重 user_registration_enabled 与 email_verification_required 设置）
    """
    if not await _registration_enabled(db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="注册暂未开放",
        )

    username = register_data.username.strip()
    if username.lower() in RESERVED_USERNAMES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="该用户名不可使用",
        )

    email = register_data.email.strip().lower()

    # 先校验用户名与邮箱唯一性，避免占用失败时误消费掉正确验证码
    result = await db.execute(select(User).where(func.lower(User.username) == username.lower()))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="用户名已存在",
        )

    result = await db.execute(select(User).where(func.lower(User.email) == email))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="该邮箱已被使用",
        )

    need_email_code = await _email_verification_required(db)
    if need_email_code:
        code = (register_data.code or "").strip()
        if not code:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="请填写邮箱验证码",
            )
        try:
            await verify_code(db, email, "register", code)
        except VerificationError as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=e.message)
        email_verified = True
    else:
        try:
            await _assert_domain_allowed(db, email)
        except VerificationError as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=e.message)
        email_verified = False

    user = User(
        username=username,
        email=email,
        password_hash=await get_password_hash(register_data.password),
        display_name=(register_data.display_name or "").strip() or username,
        role="user",
        status="active",
        email_verified=email_verified,
        has_password=True,
        username_customized=True,
        last_login_at=utc_now_naive(),
    )

    db.add(user)
    await db.commit()
    await db.refresh(user)

    expires_delta = timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": str(user.id)},
        expires_delta=expires_delta,
    )

    return UserRegisterResponse(
        access_token=access_token,
        user=UserPublic.model_validate(user),
    )


@router.post("/logout")
async def logout(user: User = Depends(get_current_user)):
    """退出登录"""
    return {"message": "退出成功"}


@router.post(
    "/password/reset/code",
    dependencies=[Depends(rate_limit("email_code", limit=10, window_seconds=3600, key_scope="ip"))],
)
async def password_reset_code(
    data: PasswordResetCodeRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    发起自助重置密码：发送验证码（防枚举，统一返回成功文案）。
    """
    email = data.email.strip().lower()
    user = (
        await db.execute(select(User).where(func.lower(User.email) == email))
    ).scalar_one_or_none()
    try:
        await send_code(db, email, "reset", ip=_client_ip(request), deliver=user is not None)
    except (VerificationError, RuntimeError) as e:
        logger.warning("发送重置验证码未成功（对外统一同一句提示）: %s", e)
    return {"message": "如果该邮箱已注册，验证码已发送，请查收"}


@router.post(
    "/password/reset",
    dependencies=[Depends(rate_limit("password_reset", limit=5, window_seconds=3600, key_scope="ip"))],
)
async def password_reset(
    data: PasswordResetRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    自助重置密码（第二步）：邮箱验证码 + 新密码。
    """
    email = data.email.strip().lower()
    user = (
        await db.execute(select(User).where(func.lower(User.email) == email))
    ).scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="验证码错误或已过期，请重新获取",
        )

    try:
        await verify_code(db, email, "reset", data.code)
    except VerificationError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=e.message)

    user.password_hash = await get_password_hash(data.new_password)
    user.has_password = True
    user.password_changed_at = utc_now_naive()
    await db.commit()

    return {"message": "密码已重置，请使用新密码登录"}


@router.get("/me", response_model=AdminResponse)
async def get_current_admin_info(user: User = Depends(get_current_admin)):
    """获取当前登录管理员信息"""
    return AdminResponse.model_validate(user)


@router.put("/me", response_model=AdminResponse)
async def update_profile(
    profile_in: AdminUpdate,
    user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """更新管理员个人资料"""
    if profile_in.email and profile_in.email != user.email:
        existing_email = await db.scalar(
            select(User).where(func.lower(User.email) == profile_in.email.strip().lower())
        )
        if existing_email and existing_email.id != user.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="该邮箱已被使用",
            )

    update_data = profile_in.model_dump(exclude_unset=True)
    is_active = update_data.pop("is_active", None)
    if is_active is not None:
        user.status = "active" if is_active else "banned"
    for field, value in update_data.items():
        setattr(user, field, value)

    await db.commit()
    await db.refresh(user)
    if user.role == "super_admin":
        await cache_delete(CacheKeys.SETTINGS_PUBLIC)
    return user


@router.put("/password")
async def update_password(
    password_in: AdminPasswordUpdate,
    user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """管理员修改自身密码"""
    if not password_in.old_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="请提供旧密码",
        )
    if not await verify_password(password_in.old_password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="旧密码错误",
        )

    user.password_hash = await get_password_hash(password_in.new_password)
    user.has_password = True
    user.password_changed_at = utc_now_naive()

    await db.commit()
    return {"message": "密码修改成功"}
