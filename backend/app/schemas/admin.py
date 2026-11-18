"""
管理员与账号通用响应 Pydantic 模型
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field


class AdminBase(BaseModel):
    """管理员基础模型"""
    username: str = Field(..., min_length=3, max_length=50, description="用户名")
    email: Optional[EmailStr] = Field(None, description="邮箱")
    display_name: Optional[str] = Field(None, max_length=100, description="显示名称")
    avatar_url: Optional[str] = Field(None, max_length=500, description="头像 URL")
    bio: Optional[str] = Field(None, description="个人简介")
    qq: Optional[str] = Field(None, max_length=20, description="QQ号")
    wechat: Optional[str] = Field(None, max_length=50, description="微信号")
    github: Optional[str] = Field(None, max_length=100, description="GitHub")
    bilibili: Optional[str] = Field(None, max_length=100, description="Bilibili")
    website: Optional[str] = Field(None, max_length=255, description="个人主页")


class AdminCreate(AdminBase):
    """创建管理员请求模型"""
    password: str = Field(..., min_length=6, max_length=100, description="密码")
    role: str = Field("admin", description="角色: super_admin 或 admin")


class AdminUpdate(BaseModel):
    """更新管理员请求模型"""
    email: Optional[EmailStr] = None
    display_name: Optional[str] = Field(None, max_length=100)
    avatar_url: Optional[str] = Field(None, max_length=500)
    bio: Optional[str] = None
    qq: Optional[str] = Field(None, max_length=20)
    wechat: Optional[str] = Field(None, max_length=50)
    github: Optional[str] = Field(None, max_length=100)
    bilibili: Optional[str] = Field(None, max_length=100)
    website: Optional[str] = Field(None, max_length=255)
    is_active: Optional[bool] = None


class AdminPasswordUpdate(BaseModel):
    """更新密码请求模型"""
    old_password: Optional[str] = Field(None, description="旧密码（超级管理员可不填）")
    new_password: str = Field(..., min_length=6, max_length=100, description="新密码")


class AdminResponse(AdminBase):
    """管理员 / 登录用户完整响应模型"""
    id: int
    role: str
    is_active: bool
    email_verified: bool = False
    has_password: bool = True
    username_customized: bool = True
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class AdminUserListItem(AdminResponse):
    """用户管理列表项"""
    article_count: int = 0
    comment_count: int = 0
    last_login_at: Optional[datetime] = None

    @classmethod
    def from_user(cls, user, article_count: int = 0, comment_count: int = 0):
        return cls(
            **AdminResponse.model_validate(user).model_dump(),
            article_count=article_count,
            comment_count=comment_count,
            last_login_at=user.last_login_at,
        )


class AdminLogin(BaseModel):
    """登录请求模型（支持用户名或邮箱）"""
    username: str = Field(..., description="用户名或邮箱")
    password: str = Field(..., description="密码")


class AdminLoginResponse(BaseModel):
    """登录响应模型"""
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    admin: AdminResponse
    is_new_user: bool = False
