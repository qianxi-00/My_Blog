"""
聊天 Pydantic 模型
"""

from datetime import datetime
from typing import Optional, List, Literal

from pydantic import BaseModel, Field


ChatRole = Literal["user", "assistant", "system"]


class ChatMessageBase(BaseModel):
    """聊天消息基础模型"""
    role: ChatRole = Field(..., description="角色: user, assistant, system")
    content: str = Field(..., min_length=1, description="消息内容")


class ChatMessageCreate(BaseModel):
    """发送消息请求模型"""
    session_id: Optional[str] = Field(None, description="会话 ID，为空则创建新会话")
    content: str = Field(..., min_length=1, max_length=5000, description="消息内容")


class ChatMessageResponse(BaseModel):
    """聊天消息响应模型"""
    id: int
    role: str
    content: str
    created_at: datetime
    
    class Config:
        from_attributes = True


class ChatSessionResponse(BaseModel):
    """聊天会话响应模型"""
    id: str
    title: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


class ChatSessionWithMessages(ChatSessionResponse):
    """包含消息的聊天会话响应模型"""
    messages: List[ChatMessageResponse] = []


class ChatResponse(BaseModel):
    """聊天响应模型"""
    session_id: str
    message: ChatMessageResponse
    reply: ChatMessageResponse


class PromptLabRequest(BaseModel):
    """Prompt 实验室请求模型"""
    prompt: str = Field(..., min_length=1, description="Prompt 内容")
    input_text: Optional[str] = Field(None, description="输入文本/变量")
    max_tokens: int = Field(1000, ge=1, le=4000, description="最大 token 数")
    temperature: float = Field(0.7, ge=0, le=2, description="温度参数")


class PromptLabResponse(BaseModel):
    """Prompt 实验室响应模型"""
    result: str = Field(..., description="AI 生成结果")
    prompt_tokens: int = Field(0, description="Prompt Token 数")
    completion_tokens: int = Field(0, description="生成 Token 数")
    total_tokens: int = Field(0, description="总 Token 数")
