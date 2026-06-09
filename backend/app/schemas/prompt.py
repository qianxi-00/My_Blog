"""
Prompt Pydantic 模型
"""

from datetime import datetime
from typing import Optional, Literal

from pydantic import BaseModel, Field


PromptCategory = Literal["Dev", "Writing", "Business", "Academic", "Other"]


class PromptBase(BaseModel):
    """Prompt 基础模型"""
    title: str = Field(..., min_length=1, max_length=100, description="标题")
    description: Optional[str] = Field(None, description="描述")
    content: str = Field(..., min_length=1, description="Prompt 内容")
    category: PromptCategory = Field(..., description="分类")


class PromptCreate(PromptBase):
    """创建 Prompt 请求模型（管理员）"""
    pass


class PromptUserSubmit(PromptBase):
    """用户提交 Prompt 请求模型"""
    submitted_by: str = Field(..., min_length=1, max_length=50, description="提交者昵称")


class PromptUpdate(BaseModel):
    """更新 Prompt 请求模型"""
    title: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = None
    content: Optional[str] = Field(None, min_length=1)
    category: Optional[PromptCategory] = None
    use_count: Optional[int] = Field(None, ge=0, description="使用次数")
    like_count: Optional[int] = Field(None, ge=0, description="点赞量")


class PromptAuthorResponse(BaseModel):
    """Prompt 作者简要信息"""
    id: int
    username: str
    display_name: Optional[str] = None
    
    class Config:
        from_attributes = True


class PromptResponse(BaseModel):
    """Prompt 响应模型"""
    id: int
    title: str
    description: Optional[str] = None
    content: str
    category: str
    author: Optional[PromptAuthorResponse] = None
    submitted_by: Optional[str] = None
    status: str
    use_count: int = 0
    like_count: int = 0
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


class PromptListResponse(BaseModel):
    """Prompt 列表响应模型（简化版）"""
    id: int
    title: str
    description: Optional[str] = None
    content: str
    category: str
    use_count: int = 0
    like_count: int = 0
    created_at: datetime
    
    class Config:
        from_attributes = True
