"""
Prompt 模型
"""

from datetime import datetime
from typing import Optional, TYPE_CHECKING

from sqlalchemy import String, Enum, DateTime, Text, Integer, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..core.database import Base

if TYPE_CHECKING:
    from .user import User


class Prompt(Base):
    """Prompt 库表"""
    
    __tablename__ = "prompts"
    
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    
    category: Mapped[str] = mapped_column(
        Enum("Dev", "Writing", "Business", "Academic", "Other", name="prompt_category_enum"),
        nullable=False
    )
    
    author_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        # 2026-09-26 二期：从休眠的 admins 表改指 users（迁移保 id，历史值一一对应）
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True
    )
    
    submitted_by: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    
    status: Mapped[str] = mapped_column(
        Enum("pending", "approved", "rejected", name="prompt_status_enum"),
        nullable=False,
        default="approved"
    )
    
    use_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    like_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=func.now(),
        nullable=False
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        default=func.now(),
        onupdate=func.now(),
        nullable=True
    )
    
    # 关联关系
    author: Mapped[Optional["User"]] = relationship("User", foreign_keys=author_id, back_populates="prompts")
    
    def __repr__(self) -> str:
        return f"<Prompt(id={self.id}, title='{self.title}', category='{self.category}')>"
