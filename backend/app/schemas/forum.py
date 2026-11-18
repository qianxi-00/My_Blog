"""论坛 Pydantic 模型

约定：
- 发帖/回帖/点赞/采纳/举报强制登录，服务端绑定 user_id 与最新用户资料
- 分类必选
- Markdown 内容以纯文本存储，前端统一用 MarkdownContent 渲染（默认禁用 HTML）
- 蜜罐字段 honeypot：正常前端不填；若非空视为机器人提交
"""

from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class ForumCategoryResponse(BaseModel):
    id: int
    name: str
    slug: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    is_default: bool = False
    sort_order: int = 0
    is_active: bool = True
    thread_count: int = 0

    model_config = ConfigDict(from_attributes=True)


class ForumCategoryCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)
    slug: Optional[str] = Field(None, max_length=50)
    description: Optional[str] = Field(None, max_length=500)
    icon: Optional[str] = Field(None, max_length=50)
    color: Optional[str] = Field(None, max_length=30)
    is_default: bool = False
    sort_order: int = 0


class ForumCategoryUpdateRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=50)
    slug: Optional[str] = Field(None, max_length=50)
    description: Optional[str] = Field(None, max_length=500)
    icon: Optional[str] = Field(None, max_length=50)
    color: Optional[str] = Field(None, max_length=30)
    is_default: Optional[bool] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None


class ForumThreadListItem(BaseModel):
    id: int
    category_id: int
    category_name: Optional[str] = None
    category_slug: Optional[str] = None

    title: str

    reply_count: int = 0
    view_count: int = 0
    like_count: int = 0
    viewer_liked: bool = False

    is_pinned: bool = False
    is_locked: bool = False
    is_featured: bool = False
    is_solved: bool = False
    is_hidden: bool = False
    accepted_post_id: Optional[int] = None

    last_post_at: Optional[datetime] = None

    user_id: Optional[int] = None
    username: Optional[str] = None
    author_nickname: str
    author_display_name: Optional[str] = None
    author_avatar: Optional[str] = None
    author_role: Optional[str] = None

    edited_at: Optional[datetime] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ForumThreadDetailResponse(BaseModel):
    id: int
    category_id: int
    category_name: Optional[str] = None
    category_slug: Optional[str] = None

    title: str

    reply_count: int = 0
    view_count: int = 0
    like_count: int = 0
    viewer_liked: bool = False

    is_pinned: bool = False
    is_locked: bool = False
    is_featured: bool = False
    is_solved: bool = False
    is_hidden: bool = False
    accepted_post_id: Optional[int] = None
    is_reported: bool = False
    report_count: int = 0

    last_post_at: Optional[datetime] = None

    user_id: Optional[int] = None
    username: Optional[str] = None
    author_nickname: str
    author_display_name: Optional[str] = None
    author_avatar: Optional[str] = None
    author_role: Optional[str] = None

    edited_at: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class ForumPostResponse(BaseModel):
    id: int
    thread_id: int
    parent_id: Optional[int] = None
    floor: int

    user_id: Optional[int] = None
    username: Optional[str] = None
    nickname: str
    author_display_name: Optional[str] = None
    author_avatar: Optional[str] = None
    author_role: Optional[str] = None

    content: str

    is_admin_post: bool = False
    admin_display_name: Optional[str] = None
    like_count: int = 0
    viewer_liked: bool = False
    is_hidden: bool = False
    is_reported: bool = False
    report_count: int = 0

    edited_at: Optional[datetime] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ForumThreadCreateRequest(BaseModel):
    category_id: int = Field(..., description="分类 ID（必选）")
    title: str = Field(..., min_length=1, max_length=200, description="标题")
    content: str = Field(..., min_length=1, max_length=20000, description="首帖内容（Markdown）")

    nickname: Optional[str] = Field(None, max_length=50, description="兼容字段（已登录后忽略）")
    email: Optional[EmailStr] = Field(None, description="兼容字段（已登录后忽略）")

    honeypot: Optional[str] = Field(None, max_length=200, description="蜜罐字段（正常为空）")


class ForumPostCreateRequest(BaseModel):
    content: str = Field(..., min_length=1, max_length=20000, description="回复内容（Markdown）")

    nickname: Optional[str] = Field(None, max_length=50, description="兼容字段（已登录后忽略）")
    email: Optional[EmailStr] = Field(None, description="兼容字段（已登录后忽略）")

    parent_id: Optional[int] = Field(None, description="回复某楼（可选）")

    honeypot: Optional[str] = Field(None, max_length=200, description="蜜罐字段（正常为空）")


class ForumThreadAdminUpdateRequest(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    category_id: Optional[int] = None
    content: Optional[str] = Field(None, min_length=1, max_length=20000)

    is_pinned: Optional[bool] = None
    is_locked: Optional[bool] = None
    is_featured: Optional[bool] = None
    is_hidden: Optional[bool] = None


class ForumPostAdminUpdateRequest(BaseModel):
    content: str = Field(..., min_length=1, max_length=20000)


class ForumAcceptPostRequest(BaseModel):
    post_id: Optional[int] = Field(None, description="采纳的楼层 ID；传 null 取消采纳")


class ForumHideRequest(BaseModel):
    is_hidden: bool = True


class ForumReportRequest(BaseModel):
    reason: str = Field(..., min_length=1, max_length=50, description="举报原因")
    description: Optional[str] = Field(None, max_length=500, description="补充说明")


class ForumReportItemResponse(BaseModel):
    id: int
    target_type: str
    target_id: int
    user_id: Optional[int] = None
    reason: str
    description: Optional[str] = None
    status: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ForumReportedTargetResponse(BaseModel):
    target_type: str  # thread / post
    target_id: int
    thread_id: int
    thread_title: str
    floor: Optional[int] = None
    author_name: str
    content_preview: str
    is_hidden: bool = False
    report_count: int = 0
    reports: List[ForumReportItemResponse] = Field(default_factory=list)


class ForumReportConfirmRequest(BaseModel):
    action: str = Field("delete", description="delete 或 hide")
