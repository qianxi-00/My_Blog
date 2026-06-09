"""
管理员模型
"""

from datetime import datetime
from typing import Optional, List, TYPE_CHECKING

from sqlalchemy import String, Boolean, Enum, DateTime, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..core.database import Base

if TYPE_CHECKING:
    from .article import Article
    from .prompt import Prompt
    from .comment import Comment


class Admin(Base):
    """管理员表"""
    
    __tablename__ = "admins"
    
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    email: Mapped[Optional[str]] = mapped_column(String(100), unique=True, nullable=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    display_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    avatar_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    bio: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    qq: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    wechat: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    github: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    bilibili: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    role: Mapped[str] = mapped_column(
        Enum("super_admin", "admin", name="admin_role_enum"),
        nullable=False,
        default="admin"
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
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
    articles: Mapped[List["Article"]] = relationship(
        "Article",
        back_populates="author"
    )
    prompts: Mapped[List["Prompt"]] = relationship(
        "Prompt",
        back_populates="author"
    )
    comments: Mapped[List["Comment"]] = relationship(
        "Comment",
        back_populates="admin"
    )
    
    def __repr__(self) -> str:
        return f"<Admin(id={self.id}, username='{self.username}', role='{self.role}')>"
