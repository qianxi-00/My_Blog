"""
Agent AI 助手 Pydantic 模型
"""

from datetime import datetime
from typing import Optional, List, Any, Literal

from pydantic import BaseModel, Field, ConfigDict


AgentRole = Literal["user", "assistant", "system", "tool"]


class AgentChatRequest(BaseModel):
    """Agent 聊天请求"""
    session_id: Optional[str] = Field(None, description="会话 ID，为空则创建新会话")
    content: str = Field(..., min_length=1, max_length=20000, description="消息内容")


class AgentMessageResponse(BaseModel):
    """Agent 消息响应"""
    id: int
    session_id: str
    role: str
    content: Optional[str] = None
    tool_calls: Optional[Any] = None
    tool_call_id: Optional[str] = None
    tool_name: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AgentSessionResponse(BaseModel):
    """Agent 会话响应"""
    id: str
    title: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class AgentSessionWithMessages(AgentSessionResponse):
    """包含消息的 Agent 会话响应"""
    messages: List[AgentMessageResponse] = []
