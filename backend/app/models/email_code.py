"""邮箱验证码模型

2026-09-26 二期（邮箱认证）：注册 / 重置密码 / 绑定邮箱共用的验证码表。
- 存 sha256 哈希，不存明文（纪律同密码）
- 用途隔离：purpose register/reset/bind 不可混用
- 错 5 次作废、10 分钟过期；过期行由发码时顺手清理（>24h）
"""

from datetime import datetime

from sqlalchemy import DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from ..core.database import Base

CODE_PURPOSES = ("register", "reset", "bind")


class EmailCode(Base):
    """邮箱验证码"""

    __tablename__ = "email_codes"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    email: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    purpose: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    code_hash: Mapped[str] = mapped_column(String(255), nullable=False)

    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now(), nullable=False)
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)

    def __repr__(self) -> str:
        return f"<EmailCode(id={self.id}, purpose='{self.purpose}', email='{self.email}')>"
