"""
统计 Pydantic 模型
"""

from datetime import datetime, date
from typing import Optional, List

from pydantic import BaseModel, Field


class PageViewCreate(BaseModel):
    """记录页面访问请求模型"""
    page_path: str = Field(..., max_length=255, description="页面路径")
    article_id: Optional[int] = Field(None, description="文章 ID（如果是文章页）")
    referer: Optional[str] = Field(None, max_length=500, description="来源页面")


class DailyStatResponse(BaseModel):
    """每日统计响应模型"""
    date: date
    total_views: int = 0
    unique_visitors: int = 0
    article_views: int = 0
    new_comments: int = 0
    ai_api_calls: int = 0
    
    class Config:
        from_attributes = True


class DailyStatUpdate(BaseModel):
    """修改每日统计请求模型（增量式）"""
    date: str = Field(..., description="日期 YYYY-MM-DD")
    total_views: int = Field(0, description="访问次数增量")
    unique_visitors: int = Field(0, description="独立访客增量")
    article_views: int = Field(0, description="文章访问增量")
    new_comments: int = Field(0, description="新评论增量")
    ai_api_calls: int = Field(0, description="AI调用增量")


class StatsOverview(BaseModel):
    """统计概览响应模型"""
    today_views: int = 0
    today_visitors: int = 0
    total_articles: int = 0
    total_comments: int = 0
    pending_comments: int = 0
    today_ai_calls: int = 0
    total_ai_calls: int = 0


class PopularArticle(BaseModel):
    """热门文章模型"""
    id: int
    title: str
    view_count: int
    published_at: Optional[datetime] = None


class SiteSettingResponse(BaseModel):
    """站点配置响应模型"""
    key: str
    value: Optional[str] = None
    type: str
    description: Optional[str] = None
    
    class Config:
        from_attributes = True


class SiteSettingUpdate(BaseModel):
    """更新站点配置请求模型"""
    value: str = Field(..., description="配置值")


class ContactInfo(BaseModel):
    """联系方式信息"""
    email: Optional[str] = None
    wechat: Optional[str] = None
    github: Optional[str] = None
    qq: Optional[str] = None
    bilibili: Optional[str] = None


class PublicSiteSettings(BaseModel):
    """公开的站点配置"""
    site_title: str = "DevLog"
    site_description: str = ""
    admin_avatar: str = ""
    admin_bio: str = ""
    contact: ContactInfo = ContactInfo()
