"""
订阅者模型
"""

from datetime import datetime
from typing import Optional
import secrets

from sqlalchemy import String, DateTime, Boolean, func
from sqlalchemy.orm import Mapped, mapped_column

from ..core.database import Base


def generate_unsubscribe_token():
    """生成取消订阅的唯一 token"""
    return secrets.token_urlsafe(32)


class Subscriber(Base):
    """邮件订阅者表"""
    
    __tablename__ = "subscribers"
    
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    
    # 订阅状态
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    
    # 取消订阅用的 token
    unsubscribe_token: Mapped[str] = mapped_column(
        String(64), 
        unique=True, 
        nullable=False, 
        default=generate_unsubscribe_token
    )
    
    # 时间戳
    subscribed_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=func.now(),
        nullable=False
    )
    unsubscribed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        nullable=True
    )
    
    # 冻结状态（管理员控制）
    is_frozen: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    frozen_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        nullable=True
    )
    
    def __repr__(self) -> str:
        return f"<Subscriber(id={self.id}, email='{self.email}', is_active={self.is_active}, is_frozen={self.is_frozen})>"
