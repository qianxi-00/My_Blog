"""
每日热点模型
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Optional, List, TYPE_CHECKING

from sqlalchemy import String, DateTime, Text, Integer, ForeignKey, Enum, Date, Numeric, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..core.database import Base

if TYPE_CHECKING:
    from .article import Article, Tag
    from .admin import Admin


class HotTopic(Base):
    """每日热点主表"""

    __tablename__ = "hot_topics"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    topic_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)

    title: Mapped[str] = mapped_column(String(220), nullable=False)
    slug: Mapped[str] = mapped_column(String(220), nullable=False, unique=True, index=True)
    summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    analysis_md: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    key_points_json: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    heat_score: Mapped[float] = mapped_column(Numeric(6, 2), nullable=False, default=0)
    status: Mapped[str] = mapped_column(
        Enum("draft", "published", "hidden", name="hot_topic_status_enum"),
        nullable=False,
        default="draft",
        index=True,
    )

    article_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("articles.id", ondelete="SET NULL"),
        nullable=True,
        unique=True,
        index=True,
    )

    primary_category: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, index=True)
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    created_by: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("admins.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.now,
        onupdate=datetime.now,
        nullable=False,
    )

    article: Mapped[Optional["Article"]] = relationship("Article", lazy="selectin")
    creator: Mapped[Optional["Admin"]] = relationship("Admin", lazy="selectin")

    sources: Mapped[List["HotTopicSource"]] = relationship(
        "HotTopicSource",
        back_populates="topic",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    tags: Mapped[List["Tag"]] = relationship(
        "Tag",
        secondary="hot_topic_tags",
        lazy="selectin",
    )


class HotTopicSource(Base):
    """热点来源表"""

    __tablename__ = "hot_topic_sources"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    topic_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("hot_topics.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    source_type: Mapped[str] = mapped_column(
        Enum("rss", "api", "manual", name="hot_source_type_enum"),
        nullable=False,
        default="rss",
    )
    source_name: Mapped[str] = mapped_column(String(100), nullable=False)
    source_domain: Mapped[Optional[str]] = mapped_column(String(120), nullable=True, index=True)
    source_url: Mapped[str] = mapped_column(String(1000), nullable=False)

    original_title: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    content_snippet: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    dedupe_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    quality_score: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False, default=0)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, nullable=False)

    topic: Mapped["HotTopic"] = relationship("HotTopic", back_populates="sources")


class HotTopicTag(Base):
    """热点-标签关联表"""

    __tablename__ = "hot_topic_tags"

    topic_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("hot_topics.id", ondelete="CASCADE"),
        primary_key=True,
    )
    tag_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("tags.id", ondelete="CASCADE"),
        primary_key=True,
    )


class HotFetchJob(Base):
    """热点抓取任务记录"""

    __tablename__ = "hot_fetch_jobs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    run_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)

    trigger_mode: Mapped[str] = mapped_column(
        Enum("manual", "scheduled", name="hot_fetch_trigger_mode_enum"),
        nullable=False,
        default="manual",
    )
    status: Mapped[str] = mapped_column(
        Enum("running", "success", "partial", "failed", name="hot_fetch_job_status_enum"),
        nullable=False,
        default="running",
        index=True,
    )

    source_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    candidate_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    selected_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, nullable=False)
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
