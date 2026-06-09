"""
文章 Pydantic 模型
"""

from datetime import datetime
from typing import Optional, List

from pydantic import BaseModel, Field, ConfigDict


class TagBase(BaseModel):
    """标签基础模型"""
    name: str = Field(..., min_length=1, max_length=50, description="标签名")
    color: Optional[str] = Field(None, max_length=7, description="标签颜色 (HEX)")


class TagCreate(TagBase):
    """创建标签请求模型"""
    pass


class TagResponse(TagBase):
    """标签响应模型"""
    id: int
    slug: Optional[str] = None
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)


class ArticleBase(BaseModel):
    """文章基础模型"""
    title: str = Field(..., min_length=1, max_length=200, description="标题")
    summary: Optional[str] = Field(None, description="摘要")
    content_md: str = Field(..., description="Markdown 内容")
    cover_image: Optional[str] = Field(None, max_length=500, description="封面图 URL")
    category: Optional[str] = Field(None, max_length=50, description="分类")
    tags: Optional[List[str]] = Field(default=[], description="标签列表")


class ArticleCreate(ArticleBase):
    """创建文章请求模型"""
    status: str = Field("draft", description="状态: draft, published, scheduled")
    is_pinned: bool = Field(False, description="是否置顶")
    scheduled_at: Optional[datetime] = Field(None, description="定时发布时间")


class ArticleUpdate(BaseModel):
    """更新文章请求模型"""
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    summary: Optional[str] = None
    content_md: Optional[str] = None
    cover_image: Optional[str] = Field(None, max_length=500)
    category: Optional[str] = Field(None, max_length=50)
    tags: Optional[List[str]] = None
    status: Optional[str] = None
    is_pinned: Optional[bool] = None
    scheduled_at: Optional[datetime] = None
    published_at: Optional[datetime] = None
    view_count: Optional[int] = Field(None, ge=0, description="浏览量")
    like_count: Optional[int] = Field(None, ge=0, description="点赞量")


class ArticlePublish(BaseModel):
    """发布文章请求模型"""
    scheduled_at: Optional[datetime] = Field(None, description="定时发布时间，为空则立即发布")


class AuthorResponse(BaseModel):
    """作者简要信息"""
    id: int
    username: str
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    bio: Optional[str] = None
    qq: Optional[str] = None
    wechat: Optional[str] = None
    github: Optional[str] = None
    bilibili: Optional[str] = None
    email: Optional[str] = None
    
    model_config = ConfigDict(from_attributes=True)


class ArticleResponse(BaseModel):
    """文章响应模型"""
    id: int
    title: str
    slug: Optional[str] = None
    summary: Optional[str] = None
    content_md: str
    content_html: Optional[str] = None
    toc_html: Optional[str] = None
    cover_image: Optional[str] = None
    category: Optional[str] = None
    author: AuthorResponse
    tags: List[TagResponse] = []
    status: str
    is_pinned: bool
    scheduled_at: Optional[datetime] = None
    published_at: Optional[datetime] = None
    read_time_minutes: Optional[int] = None
    view_count: int = 0
    like_count: int = 0
    comment_count: int = 0
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    model_config = ConfigDict(from_attributes=True)


class ArticleListResponse(BaseModel):
    """文章列表响应模型（简化版）"""
    id: int
    title: str
    slug: Optional[str] = None
    summary: Optional[str] = None
    cover_image: Optional[str] = None
    category: Optional[str] = None
    author: AuthorResponse
    tags: List[TagResponse] = []
    status: str
    is_pinned: bool
    published_at: Optional[datetime] = None
    read_time_minutes: Optional[int] = None
    view_count: int = 0
    like_count: int = 0
    comment_count: int = 0
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)


class ArchiveItem(BaseModel):
    """归档项目模型"""
    id: int
    title: str
    slug: Optional[str] = None
    published_at: Optional[datetime] = None
    category: Optional[str] = None


class ArticleSeriesItem(BaseModel):
    """系列文章响应模型"""
    id: int
    title: str
    slug: Optional[str] = None
    published_at: Optional[datetime] = None
    category: Optional[str] = None


class ArchiveGroup(BaseModel):
    """归档分组模型"""
    year: int
    month: int
    articles: List[ArchiveItem]


class CategoryCount(BaseModel):
    """分类统计"""
    category: str
    count: int


class SummaryGenerateRequest(BaseModel):
    """摘要生成请求模型"""
    content_md: str = Field(..., description="Markdown 格式的文章内容")


class SummaryGenerateResponse(BaseModel):
    """摘要生成响应模型"""
    summary: str = Field(..., description="生成的摘要")
