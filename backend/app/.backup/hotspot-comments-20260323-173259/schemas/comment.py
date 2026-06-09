"""
评论 Pydantic 模型
"""

from datetime import datetime
from typing import Optional, List

from pydantic import BaseModel, Field, EmailStr, ConfigDict


class CommentBase(BaseModel):
    """评论基础模型"""

    nickname: Optional[str] = Field(None, max_length=50, description="昵称（选填，不填则生成游客昵称）")
    email: Optional[EmailStr] = Field(None, description="邮箱（可选）")
    content: str = Field(..., min_length=1, max_length=2000, description="评论内容")


class CommentCreate(CommentBase):
    """创建评论请求模型"""

    parent_id: Optional[int] = Field(None, description="父评论 ID（回复）")


class AdminReplyCreate(BaseModel):
    """管理员回复请求模型"""

    content: str = Field(..., min_length=1, max_length=2000, description="回复内容")


class CommentLikeRequest(BaseModel):
    """点赞请求"""

    pass  # 只需要评论 ID，由路径参数提供


class CommentReportRequest(BaseModel):
    """举报请求"""

    reason: str = Field(..., description="举报原因")
    description: Optional[str] = Field(None, max_length=500, description="补充说明")


class CommentResponse(BaseModel):
    """评论响应模型"""

    id: int
    article_id: Optional[int] = None
    target_type: str = "article"
    target_id: int
    parent_id: Optional[int] = None
    nickname: str
    avatar_url: Optional[str] = None
    content: str
    is_admin_reply: bool = False
    admin_display_name: Optional[str] = None  # 管理员回复时显示
    status: str
    like_count: int = 0
    is_reported: bool = False
    created_at: datetime
    replies: List["CommentResponse"] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class CommentListResponse(BaseModel):
    """评论列表响应模型（含回复）"""

    total: int
    comments: List[CommentResponse]


class CommentPendingResponse(BaseModel):
    """待审核/被举报评论响应模型"""

    id: int
    article_id: Optional[int] = None
    article_title: Optional[str] = None  # 兼容旧前端字段
    target_type: str = "article"
    target_id: int
    target_title: Optional[str] = None
    parent_id: Optional[int] = None
    nickname: str
    email: Optional[str] = None
    avatar_url: Optional[str] = None
    content: str
    ip_address: Optional[str] = None
    status: str
    like_count: int = 0
    report_count: int = 0
    is_reported: bool = False
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CommentReportResponse(BaseModel):
    """举报信息响应"""

    id: int
    comment_id: int
    reason: str
    description: Optional[str] = None
    status: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ReportedCommentResponse(BaseModel):
    """被举报评论的详细响应"""

    comment: CommentPendingResponse
    reports: List[CommentReportResponse]


# 解决循环引用
CommentResponse.model_rebuild()
