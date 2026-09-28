"""用户模型

users 表是全站唯一的人员表（2026-09-24 用户系统改造，方案见 AGENTS.md）：
- role 区分普通用户与站点管理员（admins 表迁移后退役为休眠表，仅保留兼容）
- 文章作者（articles.author_id）、登录用户评论（comments.user_id）都指向本表
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, Enum, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..core.database import Base

USER_ROLES = ("user", "admin", "super_admin")
USER_STATUSES = ("active", "banned")


class User(Base):
    """用户表"""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    username: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    email: Mapped[str | None] = mapped_column(String(100), unique=True, nullable=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)

    display_name: Mapped[str] = mapped_column(String(100), nullable=False)
    avatar_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    bio: Mapped[str | None] = mapped_column(Text, nullable=True)

    # 兼容旧 Admin 面板的资料页字段（admins 迁移而来，普通用户留空）
    qq: Mapped[str | None] = mapped_column(String(20), nullable=True)
    wechat: Mapped[str | None] = mapped_column(String(50), nullable=True)
    github: Mapped[str | None] = mapped_column(String(100), nullable=True)
    bilibili: Mapped[str | None] = mapped_column(String(100), nullable=True)

    role: Mapped[str] = mapped_column(
        Enum(*USER_ROLES, name="user_role_enum"),
        nullable=False,
        default="user",
        index=True,
    )
    status: Mapped[str] = mapped_column(
        Enum(*USER_STATUSES, name="user_status_enum"),
        nullable=False,
        default="active",
    )

    # 2026-09-26 二期（邮箱认证 + 三级权限）
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    password_changed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now(), nullable=False)
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime,
        default=func.now(),
        onupdate=func.now(),
        nullable=True,
    )

    if TYPE_CHECKING:
        from .article import Article
        from .comment import Comment
        from .prompt import Prompt

    # lazy 用默认 "select"（2026-09-26：原 selectin 会在列用户时把全部文章含草稿和
    # 评论捞进内存；需要关系的地方已用显式 selectinload，不走这里）
    articles: Mapped[list["Article"]] = relationship(
        "Article",
        foreign_keys="Article.author_id",
        back_populates="author_user",
    )
    comments: Mapped[list["Comment"]] = relationship(
        "Comment",
        foreign_keys="Comment.user_id",
        back_populates="user",
    )
    prompts: Mapped[list["Prompt"]] = relationship(
        "Prompt",
        foreign_keys="Prompt.author_id",
        back_populates="author",
    )

    @property
    def is_active(self) -> bool:
        """兼容旧 Admin 面板序列化：Admin 模型用 is_active 布尔，User 用 status 枚举。"""
        return self.status == "active"

    @property
    def is_admin_role(self) -> bool:
        return self.role in ("admin", "super_admin")

    def __repr__(self) -> str:
        return f"<User(id={self.id}, username='{self.username}', role='{self.role}')>"
