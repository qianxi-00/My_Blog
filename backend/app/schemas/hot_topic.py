"""
每日热点 Pydantic 模型
"""

from datetime import date, datetime
from decimal import Decimal
from typing import Optional, List, Dict, Any

from pydantic import BaseModel, Field, ConfigDict


class HotTopicSourceResponse(BaseModel):
    id: int
    source_type: str
    source_name: str
    source_domain: Optional[str] = None
    source_url: str
    original_title: Optional[str] = None
    published_at: Optional[datetime] = None
    content_snippet: Optional[str] = None
    quality_score: Decimal = Decimal("0")
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class HotTopicListItem(BaseModel):
    id: int
    topic_date: date
    title: str
    slug: str
    summary: Optional[str] = None
    heat_score: Decimal = Decimal("0")
    status: str
    primary_category: Optional[str] = None
    published_at: Optional[datetime] = None
    article_id: Optional[int] = None
    comment_count: int = 0
    source_count: int = 0
    tags: List[str] = Field(default_factory=list)
    source_type: Optional[str] = None
    source_types: List[str] = Field(default_factory=list)
    source_domains: List[str] = Field(default_factory=list)
    created_at: Optional[datetime] = None


class HotTopicDetailResponse(BaseModel):
    id: int
    topic_date: date
    title: str
    slug: str
    summary: Optional[str] = None
    analysis_md: Optional[str] = None
    key_points_json: Optional[Dict[str, Any]] = None
    heat_score: Decimal = Decimal("0")
    status: str
    primary_category: Optional[str] = None
    published_at: Optional[datetime] = None
    article_id: Optional[int] = None
    comment_count: int = 0
    source_count: int = 0
    source_type: Optional[str] = None
    source_types: List[str] = Field(default_factory=list)
    source_domains: List[str] = Field(default_factory=list)
    tags: List[str] = Field(default_factory=list)
    sources: List[HotTopicSourceResponse] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class HotTopicFacetCount(BaseModel):
    name: str
    count: int


class HotTopicArchiveCount(BaseModel):
    month: str
    count: int


class HotTopicMetaResponse(BaseModel):
    total_published: int = 0
    featured_ids: List[int] = Field(default_factory=list)
    category_counts: List[HotTopicFacetCount] = Field(default_factory=list)
    tag_counts: List[HotTopicFacetCount] = Field(default_factory=list)
    source_type_counts: List[HotTopicFacetCount] = Field(default_factory=list)
    source_domain_counts: List[HotTopicFacetCount] = Field(default_factory=list)
    archive_month_counts: List[HotTopicArchiveCount] = Field(default_factory=list)


class HotTopicSourceCreateInput(BaseModel):
    source_type: str = Field("manual", description="rss/api/manual")
    source_name: str = Field(..., min_length=1, max_length=100)
    source_url: str = Field(..., min_length=1, max_length=1000)
    source_domain: Optional[str] = Field(None, max_length=120)
    original_title: Optional[str] = Field(None, max_length=300)
    published_at: Optional[datetime] = None
    content_snippet: Optional[str] = None
    quality_score: Optional[float] = Field(None, ge=0)


class HotTopicCreateRequest(BaseModel):
    topic_date: date
    title: str = Field(..., min_length=1, max_length=220)
    slug: str = Field(..., min_length=1, max_length=220)
    summary: Optional[str] = None
    analysis_md: Optional[str] = None
    key_points_json: Optional[Dict[str, Any]] = None
    heat_score: Optional[float] = Field(0, ge=0)
    primary_category: Optional[str] = Field(None, max_length=50)
    tag_names: List[str] = Field(default_factory=list)
    sources: List[HotTopicSourceCreateInput] = Field(default_factory=list)
    status: str = Field("draft", description="draft/published/hidden")
    published_at: Optional[datetime] = None
    auto_publish: bool = False
    upsert_strategy: str = Field("error", description="error/update")


class HotTopicUpdateRequest(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=220)
    summary: Optional[str] = None
    analysis_md: Optional[str] = None
    key_points_json: Optional[Dict[str, Any]] = None
    heat_score: Optional[float] = Field(None, ge=0)
    primary_category: Optional[str] = Field(None, max_length=50)
    tag_names: Optional[List[str]] = None
    status: Optional[str] = Field(None, description="draft/published/hidden")
    published_at: Optional[datetime] = None


class HotspotSourceInput(BaseModel):
    source_type: str = Field("rss", description="rss/api/manual")
    source_name: str
    source_url: str
    source_domain: Optional[str] = None


class HotTopicTaskRunRequest(BaseModel):
    topic_date: Optional[date] = None
    auto_publish: bool = False
    sources: Optional[List[HotspotSourceInput]] = None


class HotTopicTaskRunResponse(BaseModel):
    job_id: int
    status: str
    source_count: int
    candidate_count: int
    selected_count: int
    created_topic_ids: List[int]
    errors: List[str] = Field(default_factory=list)


class HotFetchJobResponse(BaseModel):
    id: int
    run_date: date
    trigger_mode: str
    status: str
    source_count: int
    candidate_count: int
    selected_count: int
    error_message: Optional[str] = None
    started_at: datetime
    finished_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class HotTopicPublishRequest(BaseModel):
    published_at: Optional[datetime] = None
