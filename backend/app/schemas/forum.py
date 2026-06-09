"""论坛 Pydantic 模型

约定：
- 昵称可选；未填时后端生成 `游客xxxx`（4 位字母数字）
- 分类必选
- Markdown 内容以纯文本存储，前端统一用 MarkdownContent 渲染（默认禁用 HTML）
- 蜜罐字段 honeypot：正常前端不填；若非空视为机器人提交
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional, List

from pydantic import BaseModel, Field, ConfigDict, EmailStr


class ForumCategoryResponse(BaseModel):
    id: int
    name: str
    slug: Optional[str] = None
    sort_order: int = 0

    model_config = ConfigDict(from_attributes=True)


class ForumThreadListItem(BaseModel):
    id: int
    category_id: int
    category_name: Optional[str] = None

    title: str

    reply_count: int = 0
    view_count: int = 0

    last_post_at: Optional[datetime] = None

    author_nickname: str

    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ForumThreadDetailResponse(BaseModel):
    id: int
    category_id: int
    category_name: Optional[str] = None

    title: str

    reply_count: int = 0
    view_count: int = 0

    is_pinned: bool = False
    is_locked: bool = False

    last_post_at: Optional[datetime] = None

    author_nickname: str

    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class ForumPostResponse(BaseModel):
    id: int
    thread_id: int
    parent_id: Optional[int] = None
    floor: int

    nickname: str
    content: str

    is_admin_post: bool = False
    admin_display_name: Optional[str] = None

    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ForumThreadCreateRequest(BaseModel):
    category_id: int = Field(..., description="分类 ID（必选）")
    title: str = Field(..., min_length=1, max_length=200, description="标题")
    content: str = Field(..., min_length=1, max_length=20000, description="首帖内容（Markdown）")

    nickname: Optional[str] = Field(None, max_length=50, description="昵称（选填，不填则生成游客昵称）")
    email: Optional[EmailStr] = Field(None, description="邮箱（可选，不对外返回）")

    honeypot: Optional[str] = Field(None, max_length=200, description="蜜罐字段（正常为空）")


class ForumPostCreateRequest(BaseModel):
    content: str = Field(..., min_length=1, max_length=20000, description="回复内容（Markdown）")

    nickname: Optional[str] = Field(None, max_length=50, description="昵称（选填，不填则生成游客昵称）")
    email: Optional[EmailStr] = Field(None, description="邮箱（可选，不对外返回）")

    parent_id: Optional[int] = Field(None, description="回复某楼（可选）")

    honeypot: Optional[str] = Field(None, max_length=200, description="蜜罐字段（正常为空）")


class ForumThreadAdminUpdateRequest(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    category_id: Optional[int] = None

    is_pinned: Optional[bool] = None
    is_locked: Optional[bool] = None


class ForumPostAdminUpdateRequest(BaseModel):
    content: str = Field(..., min_length=1, max_length=20000)
