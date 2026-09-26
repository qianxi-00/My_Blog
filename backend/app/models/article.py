"""
文章模型
"""

from datetime import datetime
from typing import Optional, List, TYPE_CHECKING

from sqlalchemy import String, Boolean, Enum, DateTime, Text, Integer, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..core.database import Base

if TYPE_CHECKING:
    from .user import User
    from .comment import Comment
    from .image import ArticleImage


class Article(Base):
    """文章表"""
    
    __tablename__ = "articles"
    
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[Optional[str]] = mapped_column(String(200), unique=True, nullable=True, index=True)
    summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    content_md: Mapped[str] = mapped_column(Text, nullable=False)
    content_html: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    toc_html: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    cover_image: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    category: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, index=True)
    
    author_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    status: Mapped[str] = mapped_column(
        Enum("draft", "pending_review", "published", "rejected", "scheduled", name="article_status_enum"),
        nullable=False,
        default="draft"
    )
    review_note: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)  # 审核驳回理由
    is_pinned: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    scheduled_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    read_time_minutes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    view_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    like_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)  # 点赞数
    comment_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)  # 评论数
    
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
    # 2026-09-24 用户系统改造：作者从 admins 表改指 users 表，保留 `author` 名字，
    # 全项目 article.author.xxx 的读路径零改动。
    author: Mapped["User"] = relationship(
        "User",
        foreign_keys=[author_id],
        back_populates="articles",
        lazy="selectin",
        overlaps="author_user",
    )
    # user.py（已定案）的 User.articles 声明 back_populates="author_user"，
    # SQLAlchemy 要求本表存在同名关系才能完成 mapper 配置；
    # author_user 仅作为该配对的只读镜像，业务代码一律使用 author。
    author_user: Mapped["User"] = relationship(
        "User",
        foreign_keys=[author_id],
        back_populates="articles",
        viewonly=True,
        overlaps="author",
    )
    tags: Mapped[List["Tag"]] = relationship(
        "Tag",
        secondary="article_tags",
        back_populates="articles",
        lazy="selectin"
    )
    comments: Mapped[List["Comment"]] = relationship(
        "Comment",
        back_populates="article",
        lazy="selectin",
        cascade="all, delete-orphan"
    )
    images: Mapped[List["ArticleImage"]] = relationship(
        "ArticleImage",
        back_populates="article",
        lazy="selectin"
    )
    likes: Mapped[List["ArticleLike"]] = relationship(
        "ArticleLike",
        back_populates="article",
        lazy="selectin",
        cascade="all, delete-orphan"
    )
    
    def __repr__(self) -> str:
        return f"<Article(id={self.id}, title='{self.title}', status='{self.status}')>"


class Tag(Base):
    """标签表"""
    
    __tablename__ = "tags"
    
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    slug: Mapped[Optional[str]] = mapped_column(String(50), unique=True, nullable=True)
    color: Mapped[Optional[str]] = mapped_column(String(7), nullable=True)  # HEX 颜色
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=func.now(),
        nullable=False
    )
    
    # 关联关系
    articles: Mapped[List["Article"]] = relationship(
        "Article",
        secondary="article_tags",
        back_populates="tags"
    )
    
    def __repr__(self) -> str:
        return f"<Tag(id={self.id}, name='{self.name}')>"


class ArticleTag(Base):
    """文章-标签关联表"""
    
    __tablename__ = "article_tags"
    
    article_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("articles.id", ondelete="CASCADE"),
        primary_key=True
    )
    tag_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("tags.id", ondelete="CASCADE"),
        primary_key=True
    )


class ArticleLike(Base):
    """文章点赞表"""
    
    __tablename__ = "article_likes"
    
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    article_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("articles.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    user_identifier: Mapped[str] = mapped_column(String(100), nullable=False)  # IP + UA hash
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=func.now(),
        nullable=False
    )
    
    # 关联
    article: Mapped["Article"] = relationship("Article", back_populates="likes")
