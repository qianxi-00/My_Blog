"""
评论模型
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional, List, TYPE_CHECKING

from sqlalchemy import String, Boolean, Enum, DateTime, Text, Integer, ForeignKey, func, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..core.database import Base

if TYPE_CHECKING:
    from .article import Article
    from .admin import Admin


COMMENT_TARGET_TYPES = ("article", "hotspot")


class Comment(Base):
    """评论表"""

    __tablename__ = "comments"
    __table_args__ = (
        Index("ix_comments_target_lookup", "target_type", "target_id", "status", "created_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    article_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("articles.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    target_type: Mapped[str] = mapped_column(
        Enum(*COMMENT_TARGET_TYPES, name="comment_target_type_enum"),
        nullable=False,
        default="article",
        index=True,
    )
    target_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)

    parent_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("comments.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    nickname: Mapped[str] = mapped_column(String(50), nullable=False)
    email: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    avatar_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)

    is_admin_reply: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    admin_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("admins.id", ondelete="SET NULL"),
        nullable=True,
    )

    status: Mapped[str] = mapped_column(
        Enum("pending", "approved", "rejected", name="comment_status_enum"),
        nullable=False,
        default="approved",  # 默认直接通过
    )

    # 点赞和举报相关
    like_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    report_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_reported: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    ip_address: Mapped[Optional[str]] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now(), nullable=False)

    # 关联关系
    article: Mapped[Optional["Article"]] = relationship("Article", back_populates="comments")
    admin: Mapped[Optional["Admin"]] = relationship("Admin", back_populates="comments")

    # 自关联 - 嵌套回复
    parent: Mapped[Optional["Comment"]] = relationship(
        "Comment",
        remote_side=[id],
        back_populates="replies",
        lazy="selectin",
    )
    replies: Mapped[List["Comment"]] = relationship(
        "Comment",
        back_populates="parent",
        lazy="selectin",
        cascade="all, delete-orphan",
    )

    # 点赞关联
    likes: Mapped[List["CommentLike"]] = relationship(
        "CommentLike",
        back_populates="comment",
        cascade="all, delete-orphan",
    )

    # 举报关联
    reports: Mapped[List["CommentReport"]] = relationship(
        "CommentReport",
        back_populates="comment",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return (
            f"<Comment(id={self.id}, target={self.target_type}:{self.target_id}, "
            f"article_id={self.article_id}, status='{self.status}')>"
        )


class CommentLike(Base):
    """评论点赞表"""

    __tablename__ = "comment_likes"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    comment_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("comments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_identifier: Mapped[str] = mapped_column(String(100), nullable=False)  # IP 或设备指纹
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now(), nullable=False)

    # 关联
    comment: Mapped["Comment"] = relationship("Comment", back_populates="likes")


class CommentReport(Base):
    """评论举报表"""

    __tablename__ = "comment_reports"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    comment_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("comments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    reporter_identifier: Mapped[str] = mapped_column(String(100), nullable=False)
    reason: Mapped[str] = mapped_column(String(50), nullable=False)  # 举报原因
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # 补充说明
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)  # pending/processed
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now(), nullable=False)

    # 关联
    comment: Mapped["Comment"] = relationship("Comment", back_populates="reports")
