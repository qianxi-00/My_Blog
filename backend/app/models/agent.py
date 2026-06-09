"""
Agent AI 助手模型
管理后台 AI Agent 的会话和消息
"""

from datetime import datetime
from typing import Optional, List
import uuid

from sqlalchemy import String, Enum, DateTime, Text, Integer, ForeignKey, JSON, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..core.database import Base


def generate_uuid() -> str:
    """生成 UUID 字符串"""
    return str(uuid.uuid4())


class AgentSession(Base):
    """Agent 会话表"""
    
    __tablename__ = "agent_sessions"
    
    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=generate_uuid
    )
    title: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=func.now(),
        nullable=False
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        default=func.now(),
        onupdate=func.now(),
        nullable=True
    )
    
    # 关联关系
    messages: Mapped[List["AgentMessage"]] = relationship(
        "AgentMessage",
        back_populates="session",
        lazy="selectin",
        cascade="all, delete-orphan",
        order_by="AgentMessage.created_at"
    )
    
    def __repr__(self) -> str:
        return f"<AgentSession(id='{self.id}', title='{self.title}')>"


class AgentMessage(Base):
    """Agent 消息表"""
    
    __tablename__ = "agent_messages"
    
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    
    session_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("agent_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    
    role: Mapped[str] = mapped_column(
        Enum("user", "assistant", "system", "tool", name="agent_role_enum"),
        nullable=False
    )
    
    content: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    # tool calling 相关字段
    tool_calls: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    tool_call_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    tool_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=func.now(),
        nullable=False
    )
    
    # 关联关系
    session: Mapped["AgentSession"] = relationship("AgentSession", back_populates="messages")
    
    def __repr__(self) -> str:
        return f"<AgentMessage(id={self.id}, role='{self.role}')>"
