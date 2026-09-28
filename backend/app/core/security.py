"""
安全模块
JWT 认证和密码加密
"""

import asyncio
from datetime import datetime, timedelta, timezone
from typing import Optional

from jose import JWTError, jwt
from passlib.context import CryptContext

from .config import settings


# 密码加密上下文
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


async def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    验证密码（bcrypt 是 100-300ms 的纯 CPU 计算，丢线程池执行，
    避免在登录时阻塞事件循环上的所有并发请求）

    Args:
        plain_password: 明文密码
        hashed_password: 哈希后的密码

    Returns:
        密码是否匹配
    """
    return await asyncio.to_thread(pwd_context.verify, plain_password, hashed_password)


async def get_password_hash(password: str) -> str:
    """
    获取密码哈希值（同样丢线程池，理由同上）

    Args:
        password: 明文密码

    Returns:
        哈希后的密码
    """
    return await asyncio.to_thread(pwd_context.hash, password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """
    创建 JWT 访问令牌

    Args:
        data: 要编码的数据（通常包含 sub 字段）
        expires_delta: 过期时间增量

    Returns:
        JWT 令牌字符串
    """
    to_encode = data.copy()

    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(
            minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES
        )

    # iat（签发时间）：改密 / 重置后旧 token 依据它立即失效（deps.get_current_user）
    # 必须是浮点微秒精度而非 int：password_changed_at 是微秒精度，若 iat 按秒截断，
    # 「改密后同一秒内重新登录」拿到的 token 会被误判为旧 token 而 401。
    to_encode.update({"exp": expire, "iat": datetime.now(timezone.utc).timestamp()})
    encoded_jwt = jwt.encode(
        to_encode,
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM
    )

    return encoded_jwt


def utc_now_naive() -> datetime:
    """
    UTC naive 时间（给 SQLite 的 DateTime 列用）。

    SQLite 的 CURRENT_TIMESTAMP/func.now() 就是 UTC naive；
    密码变更时间必须同口径存储，deps 里比较时按 UTC 补 tzinfo 才不会差时区。
    """
    return datetime.now(timezone.utc).replace(tzinfo=None)


def decode_access_token(token: str) -> Optional[dict]:
    """
    解码 JWT 访问令牌
    
    Args:
        token: JWT 令牌字符串
    
    Returns:
        解码后的数据，如果令牌无效则返回 None
    """
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM]
        )
        return payload
    except JWTError:
        return None
