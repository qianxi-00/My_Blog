"""
Agent AI 助手模型
管理后台 AI Agent 的会话和消息
"""

from datetime import datetime
from typing import Optional, List, Any
import json
import uuid

from sqlalchemy import String, Enum, DateTime, Text, Integer, ForeignKey, JSON, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import TypeDecorator

from ..core.database import Base


def generate_uuid() -> str:
    """生成 UUID 字符串"""
    return str(uuid.uuid4())


class LenientJSON(TypeDecorator):
    """容错 JSON 列：库里存了非法 JSON 时返回 None，而不是让整个查询抛 JSONDecodeError。

    2026-09-30 实测踩到：工具调用的 arguments 被上游网关双重转义（`\\"` 而非 `\"`），
    写进库就是非法 JSON；又因为 AgentSession.messages 是 lazy="selectin"，只要查会话
    列表就会连带反序列化所有消息，一条坏数据就让 `GET /agent/sessions` 整个 500，
    后台 AI 助手界面直接打不开。
    """

    impl = JSON
    cache_ok = True

    def process_result_value(self, value: Any, dialect: Any) -> Any:
        if isinstance(value, (str, bytes, bytearray)):
            try:
                return json.loads(value)
            except (ValueError, TypeError):
                return None
        return value


def normalize_tool_arguments(raw: Optional[str]) -> Optional[str]:
    """把工具调用的 arguments 规范化成**合法 JSON 字符串**。

    上游（new-api 网关 / 模型服务商）返回的 function.arguments 已经是转义过的字符串，
    直接入库会变成二次转义（`{\\"days\\":7}`），既让 `json.loads` 失败、工具拿到空参数，
    也让整列读不出来。这里入库前先试解析，解析不了就反转义一次再试。

    2026-09-30 实测：历史数据里 get_daily_stats / call_api 的 arguments 全是这个形态。
    """
    if raw is None:
        return None
    text = raw.strip()
    if not text:
        return None
    try:
        json.loads(text)
        return text
    except ValueError:
        pass
    # 反转义一次再试：把 \" 还原成 "
    for candidate in (text.replace('\\"', '"'), text.replace("\\\\", "\\")):
        try:
            parsed = json.loads(candidate)
        except ValueError:
            continue
        return json.dumps(parsed, ensure_ascii=False)
    return text


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
    # 用 LenientJSON 而不是原生 JSON：坏数据只丢这一条消息的内容，不能让整个会话列表 500
    tool_calls: Mapped[Optional[Any]] = mapped_column(LenientJSON, nullable=True)
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
