"""
图片模型
"""

from datetime import datetime
from typing import Optional, TYPE_CHECKING

from sqlalchemy import String, DateTime, Integer, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..core.database import Base

if TYPE_CHECKING:
    from .article import Article
    from .admin import Admin


class ArticleImage(Base):
    """文章图片表"""
    
    __tablename__ = "article_images"
    
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    
    article_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("articles.id", ondelete="SET NULL"),
        nullable=True,
        index=True
    )
    
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    stored_name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    file_size: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    mime_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    
    uploaded_by: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("admins.id", ondelete="SET NULL"),
        nullable=True
    )
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=func.now(),
        nullable=False
    )
    
    # 关联关系
    article: Mapped[Optional["Article"]] = relationship("Article", back_populates="images")
    
    def __repr__(self) -> str:
        return f"<ArticleImage(id={self.id}, filename='{self.filename}')>"
