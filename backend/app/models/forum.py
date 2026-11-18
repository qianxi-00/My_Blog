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
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..core.database import Base

if TYPE_CHECKING:
    from .admin import Admin
    from .user import User


class ForumCategory(Base):
    """论坛分类表"""

    __tablename__ = "forum_categories"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    name: Mapped[str] = mapped_column(String(50), nullable=False, unique=True, index=True)
    slug: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, unique=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    icon: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    color: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

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
    is_featured: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_hidden: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_solved: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    accepted_post_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    reply_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    view_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    like_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    report_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_reported: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    last_post_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True, index=True)
    last_post_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("forum_posts.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # 主题内最后一个楼层号（并发分配楼层用）；首帖创建后应为 1。
    last_floor: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    user_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    author_nickname: Mapped[str] = mapped_column(String(50), nullable=False)
    author_email: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    ip_address: Mapped[Optional[str]] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    user_identifier: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)

    edited_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now(), nullable=False)
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        default=func.now(),
        onupdate=func.now(),
        nullable=True,
    )

    category: Mapped[ForumCategory] = relationship("ForumCategory", back_populates="threads")
    user: Mapped[Optional["User"]] = relationship("User", foreign_keys=[user_id], lazy="selectin")

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
        post_update=True,
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

    user_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
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
    is_hidden: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    like_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    report_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_reported: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    admin_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("admins.id", ondelete="SET NULL"),
        nullable=True,
    )

    ip_address: Mapped[Optional[str]] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    user_identifier: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)

    edited_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
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
    user: Mapped[Optional["User"]] = relationship("User", foreign_keys=[user_id], lazy="selectin")

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


class ForumThreadLike(Base):
    """论坛主题点赞表"""

    __tablename__ = "forum_thread_likes"
    __table_args__ = (
        UniqueConstraint("thread_id", "user_id", name="uq_forum_thread_like"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    thread_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("forum_threads.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now(), nullable=False)


class ForumPostLike(Base):
    """论坛楼层点赞表"""

    __tablename__ = "forum_post_likes"
    __table_args__ = (
        UniqueConstraint("post_id", "user_id", name="uq_forum_post_like"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    post_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("forum_posts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now(), nullable=False)


class ForumReport(Base):
    """论坛举报表（主题 / 楼层）"""

    __tablename__ = "forum_reports"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    target_type: Mapped[str] = mapped_column(String(20), nullable=False, index=True)  # thread / post
    target_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    user_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    reporter_identifier: Mapped[str] = mapped_column(String(100), nullable=False)
    reason: Mapped[str] = mapped_column(String(50), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now(), nullable=False)
