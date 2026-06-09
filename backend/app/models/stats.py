from datetime import datetime, date
from typing import Optional

from sqlalchemy import String, DateTime, Integer, Date, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column

from ..core.database import Base

class PageView(Base):
    """页面访问统计表"""
    
    __tablename__ = "page_views"
    
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    
    page_path: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    
    article_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, index=True)
    
    ip_address: Mapped[Optional[str]] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    referer: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=func.now(),
        nullable=False,
        index=True
    )
    
    def __repr__(self) -> str:
        return f"<PageView(id={self.id}, page_path='{self.page_path}')>"


class DailyStat(Base):
    """每日统计汇总表"""
    
    __tablename__ = "daily_stats"
    
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    
    date: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    
    total_views: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    unique_visitors: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    article_views: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    new_comments: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    ai_api_calls: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    
    def __repr__(self) -> str:
        return f"<DailyStat(id={self.id})>"
