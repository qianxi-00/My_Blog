"""
通用 Pydantic 模型
"""

from typing import Generic, TypeVar, Optional, List

from pydantic import BaseModel

T = TypeVar("T")


class ResponseBase(BaseModel):
    """基础响应模型"""
    success: bool = True
    message: str = "操作成功"


class ResponseModel(ResponseBase, Generic[T]):
    """通用响应模型"""
    data: Optional[T] = None


class PaginatedResponse(ResponseBase, Generic[T]):
    """分页响应模型"""
    data: List[T] = []
    total: int = 0
    page: int = 1
    page_size: int = 10
    total_pages: int = 0


class TokenResponse(BaseModel):
    """Token 响应模型"""
    access_token: str
    token_type: str = "bearer"
    expires_in: int  # 过期时间（秒）
