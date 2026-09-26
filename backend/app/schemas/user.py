"""
用户 Pydantic 模型（2026-09-24 用户系统改造：users 表为全站唯一人员表）
"""

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from .article import ArticleListResponse


class UserPublic(BaseModel):
    """用户完整信息（本人或管理端可见）"""
    id: int
    username: str
    display_name: str
    email: Optional[EmailStr] = None
    avatar_url: Optional[str] = None
    bio: Optional[str] = None
    role: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class UserPublicSafe(BaseModel):
    """公开资料（公开作者页，不含 email）"""
    id: int
    username: str
    display_name: str
    avatar_url: Optional[str] = None
    bio: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class UserProfilePublic(UserPublicSafe):
    """公开作者页响应：资料 + 已发布文章列表"""
    articles: List[ArticleListResponse] = []


class UserRegister(BaseModel):
    """注册请求模型"""
    username: str = Field(..., pattern=r"^[a-zA-Z0-9_-]{3,30}$", description="用户名：字母/数字/下划线/连字符 3-30 位")
    password: str = Field(..., min_length=8, max_length=100, description="密码，至少 8 位")
    display_name: Optional[str] = Field(None, max_length=100, description="显示名称，缺省用用户名")
    email: Optional[EmailStr] = Field(None, description="邮箱，可选")


class UserLogin(BaseModel):
    """登录请求模型"""
    username: str = Field(..., description="用户名")
    password: str = Field(..., description="密码")


class UserUpdate(BaseModel):
    """更新个人资料请求模型"""
    display_name: Optional[str] = Field(None, min_length=1, max_length=100)
    bio: Optional[str] = None
    email: Optional[EmailStr] = None
    avatar_url: Optional[str] = Field(None, max_length=500)


class PasswordChange(BaseModel):
    """修改密码请求模型"""
    old_password: str = Field(..., description="旧密码")
    new_password: str = Field(..., min_length=8, max_length=100, description="新密码，至少 8 位")


class UserRegisterResponse(BaseModel):
    """注册响应模型"""
    access_token: str
    user: UserPublic
