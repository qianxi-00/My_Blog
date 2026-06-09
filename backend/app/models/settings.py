"""
站点配置模型
"""

from datetime import datetime
from typing import Optional

from sqlalchemy import String, DateTime, Text, Enum, func
from sqlalchemy.orm import Mapped, mapped_column

from ..core.database import Base


class SiteSetting(Base):
    """站点配置表"""
    
    __tablename__ = "site_settings"
    
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    
    key: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    value: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    type: Mapped[str] = mapped_column(
        Enum("string", "json", "number", "boolean", name="setting_type_enum"),
        nullable=False,
        default="string"
    )
    
    description: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        default=func.now(),
        onupdate=func.now(),
        nullable=True
    )
    
    def __repr__(self) -> str:
        return f"<SiteSetting(key='{self.key}', type='{self.type}')>"


# 预置配置项常量
DEFAULT_SETTINGS = [
    {"key": "site_title", "value": "DevLog", "type": "string", "description": "站点标题"},
    {"key": "site_description", "value": "记录技术与生活的点滴", "type": "string", "description": "站点描述"},
    {"key": "admin_avatar", "value": "", "type": "string", "description": "管理员头像 URL"},
    {"key": "admin_bio", "value": "专注 AI 技术分享与博客系统维护", "type": "string", "description": "管理员简介"},
    {"key": "contact_email", "value": "", "type": "string", "description": "联系邮箱"},
    {"key": "contact_wechat", "value": "", "type": "string", "description": "微信号"},
    {"key": "contact_github", "value": "", "type": "string", "description": "GitHub 链接"},
    {"key": "contact_qq", "value": "", "type": "string", "description": "QQ 号"},
    {"key": "contact_bilibili", "value": "", "type": "string", "description": "B站链接"},
]
