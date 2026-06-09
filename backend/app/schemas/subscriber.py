"""
订阅相关 Pydantic 模型
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, EmailStr


class SubscribeRequest(BaseModel):
    """订阅请求模型"""
    email: EmailStr = Field(..., description="邮箱地址")


class SubscribeResponse(BaseModel):
    """订阅响应模型"""
    success: bool
    message: str


class SubscriberResponse(BaseModel):
    """订阅者响应模型"""
    id: int
    email: str
    is_active: bool
    is_frozen: bool = False
    subscribed_at: datetime
    unsubscribed_at: Optional[datetime] = None
    frozen_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True
