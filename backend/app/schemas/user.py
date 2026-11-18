"""
用户 Pydantic 模型（2026-09-24 用户系统改造：users 表为全站唯一人员表）
"""

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from .article import ArticleListResponse
from .prompt import PromptListResponse


class UserPublicThreadSummary(BaseModel):
    """作者公开主页中的社区主题摘要"""
    id: int
    category_id: int
    category_name: Optional[str] = None
    title: str
    reply_count: int = 0
    view_count: int = 0
    like_count: int = 0
    is_solved: bool = False
    created_at: datetime
    last_post_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class UserPublic(BaseModel):
    """用户完整信息（本人或管理端可见）"""
    id: int
    username: str
    display_name: str
    email: Optional[EmailStr] = None
    avatar_url: Optional[str] = None
    bio: Optional[str] = None
    github: Optional[str] = None
    bilibili: Optional[str] = None
    website: Optional[str] = None
    role: str
    email_verified: bool = False
    has_password: bool = True
    username_customized: bool = True
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class UserPublicSafe(BaseModel):
    """公开资料（公开作者页，不含 email）"""
    id: int
    username: str
    display_name: str
    avatar_url: Optional[str] = None
    bio: Optional[str] = None
    role: str = "user"
    github: Optional[str] = None
    bilibili: Optional[str] = None
    website: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class UserProfilePublic(UserPublicSafe):
    """公开作者页响应：资料 + 已发布文章 / 提示词 / 社区主题列表"""
    articles: List[ArticleListResponse] = []
    prompts: List[PromptListResponse] = []
    threads: List[UserPublicThreadSummary] = []
    stats: Dict[str, int] = Field(default_factory=dict)


class UserRegister(BaseModel):
    """注册请求模型"""
    username: str = Field(..., pattern=r"^[a-zA-Z0-9_-]{3,30}$", description="用户名：字母/数字/下划线/连字符 3-30 位")
    password: str = Field(..., min_length=8, max_length=100, description="密码，至少 8 位")
    display_name: Optional[str] = Field(None, max_length=100, description="显示名称，缺省用用户名")
    email: EmailStr = Field(..., description="邮箱")
    code: Optional[str] = Field(None, max_length=8, description="邮箱验证码（开启邮箱验证时必填）")


class UserLogin(BaseModel):
    """登录请求模型"""
    username: str = Field(..., description="用户名或邮箱")
    password: str = Field(..., description="密码")


class UserUpdate(BaseModel):
    """更新个人资料请求模型"""
    display_name: Optional[str] = Field(None, min_length=1, max_length=100)
    bio: Optional[str] = None
    email: Optional[EmailStr] = None
    avatar_url: Optional[str] = Field(None, max_length=500)
    github: Optional[str] = Field(None, max_length=100)
    bilibili: Optional[str] = Field(None, max_length=100)
    website: Optional[str] = Field(None, max_length=255)


class PasswordChange(BaseModel):
    """修改密码 / 首次设置密码请求模型"""
    old_password: Optional[str] = Field(None, description="旧密码（首次设密可不填）")
    new_password: str = Field(..., min_length=8, max_length=100, description="新密码，至少 8 位")


class UsernameUpdateRequest(BaseModel):
    """引导修改一次性正式用户名"""
    username: str = Field(..., pattern=r"^[a-zA-Z0-9_-]{3,30}$", description="用户名：字母/数字/下划线/连字符 3-30 位")


class UserRegisterResponse(BaseModel):
    """注册响应模型"""
    access_token: str
    user: UserPublic


class EmailCodeRequest(BaseModel):
    """发送邮箱验证码请求（注册 / 登录 / 绑定邮箱共用）"""
    email: EmailStr = Field(..., description="接收验证码的邮箱")
    username: Optional[str] = Field(None, max_length=50, description="预检用户名（注册发码可选）")


class EmailLoginCodeVerify(BaseModel):
    """邮箱验证码免密登录/自动注册请求"""
    email: EmailStr = Field(..., description="邮箱")
    code: str = Field(..., min_length=4, max_length=8, description="邮箱验证码")


class PasswordResetCodeRequest(BaseModel):
    """发起自助重置密码请求"""
    email: EmailStr = Field(..., description="账号邮箱")


class PasswordResetRequest(BaseModel):
    """自助重置密码请求（第二步）"""
    email: EmailStr = Field(..., description="账号邮箱")
    code: str = Field(..., min_length=4, max_length=8, description="邮箱验证码")
    new_password: str = Field(..., min_length=8, max_length=100, description="新密码，至少 8 位")


class EmailBindRequest(BaseModel):
    """登录用户绑定 / 更换邮箱（第二步）"""
    email: EmailStr = Field(..., description="要绑定的邮箱")
    code: str = Field(..., min_length=4, max_length=8, description="邮箱验证码")


class BookmarkToggleRequest(BaseModel):
    """切换收藏请求"""
    target_type: str = Field(..., description="article / hotspot / prompt / thread")
    target_id: int = Field(..., ge=1)


class BookmarkItemResponse(BaseModel):
    """收藏条目展示模型"""
    id: int
    target_type: str
    target_id: int
    title: str
    summary: Optional[str] = None
    link: str
    extra: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


class NotificationResponse(BaseModel):
    """站内通知响应模型"""
    id: int
    actor_id: Optional[int] = None
    actor_name: Optional[str] = None
    actor_avatar: Optional[str] = None
    type: str
    target_type: Optional[str] = None
    target_id: Optional[int] = None
    title: str
    snippet: Optional[str] = None
    link: Optional[str] = None
    is_read: bool = False
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
