"""论坛模型

- ForumCategory：论坛分类（粗粒度，发帖必选）
- ForumThread：主题（包含统计字段与最后回复信息）
- ForumPost：帖子/楼层（首帖 floor=1，回复从 2 开始）

说明：论坛为匿名发帖回帖，但编辑/删除仅管理员（API 层控制）。
"""

from __future__ import annotations

from datetime import datetime
from typing import List, Optional, TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..core.database import Base

if TYPE_CHECKING:
    from .admin import Admin


# 为了避免循环依赖，Admin 的反向 relationship 不在 Admin 模型中声明。
# ForumPost.admin 仅用于在服务端需要时加载管理员信息（例如管理员编辑/删除记录）。


class ForumCategory(Base):
    """论坛分类表"""

    __tablename__ = "forum_categories"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    name: Mapped[str] = mapped_column(String(50), nullable=False, unique=True, index=True)
    slug: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, unique=True)

    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now(), nullable=False)

    threads: Mapped[List["ForumThread"]] = relationship(
        "ForumThread",
        back_populates="category",
        lazy="selectin",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<ForumCategory(id={self.id}, name='{self.name}')>"


class ForumThread(Base):
    """论坛主题表"""

    __tablename__ = "forum_threads"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    category_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("forum_categories.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    title: Mapped[str] = mapped_column(String(200), nullable=False)

    status: Mapped[str] = mapped_column(
        Enum("approved", "deleted", name="forum_thread_status_enum"),
        nullable=False,
        default="approved",
        index=True,
    )

    is_pinned: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_locked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    reply_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    view_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    last_post_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True, index=True)
    last_post_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("forum_posts.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # 主题内最后一个楼层号（并发分配楼层用）；首帖创建后应为 1。
    last_floor: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    author_nickname: Mapped[str] = mapped_column(String(50), nullable=False)
    author_email: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    ip_address: Mapped[Optional[str]] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    user_identifier: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now(), nullable=False)
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        default=func.now(),
        onupdate=func.now(),
        nullable=True,
    )

    category: Mapped[ForumCategory] = relationship("ForumCategory", back_populates="threads")

    posts: Mapped[List["ForumPost"]] = relationship(
        "ForumPost",
        back_populates="thread",
        foreign_keys="ForumPost.thread_id",
        lazy="selectin",
        cascade="all, delete-orphan",
        order_by="ForumPost.floor",
    )

    last_post: Mapped[Optional["ForumPost"]] = relationship(
        "ForumPost",
        foreign_keys=[last_post_id],
        lazy="selectin",
    )

    def __repr__(self) -> str:
        return f"<ForumThread(id={self.id}, title='{self.title}', status='{self.status}')>"


class ForumPost(Base):
    """论坛帖子/楼层表"""

    __tablename__ = "forum_posts"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    thread_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("forum_threads.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    parent_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("forum_posts.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    floor: Mapped[int] = mapped_column(Integer, nullable=False)

    nickname: Mapped[str] = mapped_column(String(50), nullable=False)
    email: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    content: Mapped[str] = mapped_column(Text, nullable=False)

    status: Mapped[str] = mapped_column(
        Enum("approved", "deleted", name="forum_post_status_enum"),
        nullable=False,
        default="approved",
        index=True,
    )

    is_admin_post: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    admin_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("admins.id", ondelete="SET NULL"),
        nullable=True,
    )

    ip_address: Mapped[Optional[str]] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    user_identifier: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now(), nullable=False)
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        default=func.now(),
        onupdate=func.now(),
        nullable=True,
    )

    thread: Mapped[ForumThread] = relationship(
        "ForumThread",
        back_populates="posts",
        foreign_keys=[thread_id],
    )

    parent: Mapped[Optional["ForumPost"]] = relationship(
        "ForumPost",
        remote_side=[id],
        back_populates="replies",
        lazy="selectin",
    )

    replies: Mapped[List["ForumPost"]] = relationship(
        "ForumPost",
        back_populates="parent",
        lazy="selectin",
    )

    admin: Mapped[Optional["Admin"]] = relationship("Admin", lazy="selectin", viewonly=True)

    def __repr__(self) -> str:
        return f"<ForumPost(id={self.id}, thread_id={self.thread_id}, floor={self.floor}, status='{self.status}')>"
