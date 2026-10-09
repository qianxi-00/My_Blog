"""
聊天模型
"""

from datetime import datetime
from typing import Optional, List
import uuid

from sqlalchemy import String, Enum, DateTime, Text, Integer, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..core.database import Base


def generate_uuid() -> str:
    """生成 UUID 字符串"""
    return str(uuid.uuid4())


class ChatSession(Base):
    """AI 聊天会话表"""
    
    __tablename__ = "chat_sessions"
    
    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=generate_uuid
    )
    title: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    # 2026-09-30 加归属：此前本表没有任何归属字段，导致 DELETE /chat/session/{id}
    # 无鉴权、任何人可删任意会话，POST /message 也能往他人会话写消息并把其历史喂进 LLM。
    # 存量行这两列都是 NULL（视为"无主遗留"，只有管理员能删）。
    user_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True
    )
    owner_ip: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)

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
    messages: Mapped[List["ChatMessage"]] = relationship(
        "ChatMessage",
        back_populates="session",
        lazy="selectin",
        cascade="all, delete-orphan"
    )
    
    def __repr__(self) -> str:
        return f"<ChatSession(id='{self.id}', title='{self.title}')>"


class ChatMessage(Base):
    """聊天消息表"""
    
    __tablename__ = "chat_messages"
    
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    
    session_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("chat_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    
    role: Mapped[str] = mapped_column(
        Enum("user", "assistant", "system", name="chat_role_enum"),
        nullable=False
    )
    
    content: Mapped[str] = mapped_column(Text, nullable=False)
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=func.now(),
        nullable=False
    )
    
    # 关联关系
    session: Mapped["ChatSession"] = relationship("ChatSession", back_populates="messages")

    def __repr__(self) -> str:
        return f"<ChatMessage(id={self.id}, role='{self.role}')>"


class ChatQaCache(Base):
    """十一期「QA 一级缓存」：小魄罗的精确同问缓存（对照架构图的缓存层，无向量版）。

    设计约束：
    - 只缓存「带证据的回答」：写入侧要求回答里含 URL 且本轮用过检索工具——
      闲聊/兜底话术没有复用价值，还会让"你好"这种重复问题回放旧回答很怪。
    - 只做**归一化后的精确命中**（hash 相同）：近似命中需要相似度，即需要向量
      ——明确不做（资源红线）。
    - 回放时照常把答案写进该会话的 chat_messages，会话历史保持完整。
    - 人工清理走 sqlite；个人博客量级不需要自动过期（created_at 备查）。
    """

    __tablename__ = "chat_qa_cache"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    question_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    question: Mapped[str] = mapped_column(Text, nullable=False)
    answer: Mapped[str] = mapped_column(Text, nullable=False)
    hit_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now(), nullable=False)
    last_hit_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
