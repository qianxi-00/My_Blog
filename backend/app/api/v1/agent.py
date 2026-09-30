"""
管理后台 AI Agent API
"""

import json
import logging
from datetime import datetime
from typing import AsyncGenerator, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ...core.database import get_db
from ...core.deps import get_current_admin, security
from ...models.admin import Admin
from ...models.agent import AgentSession, AgentMessage
from ...schemas.agent import (
    AgentChatRequest,
    AgentSessionRename,
    AgentSessionResponse,
    AgentSessionWithMessages,
    AgentMessageResponse,
)

logger = logging.getLogger(__name__)
from ...services.agent import AgentService

router = APIRouter()


def _sse_event(event_type: str, data: dict) -> str:
    payload = json.dumps(data, ensure_ascii=False)
    return f"event: {event_type}\ndata: {payload}\n\n"


@router.post("/chat")
async def chat_with_agent(
    request: AgentChatRequest,
    db: AsyncSession = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin),
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    """Agent 聊天（SSE）"""
    _ = current_admin

    if request.session_id:
        result = await db.execute(
            select(AgentSession)
            .options(selectinload(AgentSession.messages))
            .where(AgentSession.id == request.session_id)
        )
        session = result.scalar_one_or_none()
        if not session:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="会话不存在",
            )
    # 会话 id 提前取成局部变量：生成器跑的过程中 session 对象可能因 commit/rollback
    # 而 expire/close，届时再读 `session.id` 会抛 "not bound to a Session"（2026-09-30 线上实踩）
    session_id: str
    if request.session_id:
        result = await db.execute(
            select(AgentSession)
            .options(selectinload(AgentSession.messages))
            .where(AgentSession.id == request.session_id)
        )
        session = result.scalar_one_or_none()
        if not session:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="会话不存在",
            )
        session_id = session.id
    else:
        session = AgentSession(title="新对话")
        db.add(session)
        await db.commit()
        await db.refresh(session)
        session_id = session.id

    history_result = await db.execute(
        select(AgentMessage)
        .where(AgentMessage.session_id == session_id)
        .order_by(AgentMessage.created_at.asc())
    )
    history_messages = history_result.scalars().all()

    service = AgentService()
    token = credentials.credentials if credentials else ""

    async def generate() -> AsyncGenerator[str, None]:
        try:
            yield _sse_event("ready", {"session_id": session_id})
            async for event in service.chat_stream(
                db=db,
                session=session,
                user_content=request.content,
                token=token,
                history_messages=history_messages,
                role=current_admin.role,
            ):
                yield _sse_event(event["type"], event["data"])
        except Exception as exc:
            # 必须打日志：异常被转成 SSE 事件返回后，日志里什么都没有，
            # 线上出问题时只能靠前端那行错误文本反推（2026-09-30 实踩）
            logger.exception("agent chat 流式失败 session_id=%s", session_id)
            await db.rollback()
            yield _sse_event("error", {"message": str(exc)})

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@router.get("/sessions", response_model=list[AgentSessionResponse])
async def get_sessions(
    keyword: Optional[str] = None,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin),
):
    """获取 Agent 会话列表（2026-09-30 加 keyword 搜索与 message_count）"""
    _ = current_admin
    limit = max(1, min(limit, 500))

    # 消息数用标量子查询取，不做 outerjoin + group_by：
    # 同时 select 整个 ORM 实体又 group_by 主键，SQLAlchemy 2.0 编译不过（500）。
    count_sq = (
        select(func.count(AgentMessage.id))
        .where(AgentMessage.session_id == AgentSession.id)
        .correlate(AgentSession)
        .scalar_subquery()
    )
    query = select(AgentSession, count_sq.label("message_count"))

    if keyword:
        query = query.where(AgentSession.title.contains(keyword.strip()))
    query = query.order_by(AgentSession.updated_at.desc(), AgentSession.created_at.desc()).limit(limit)

    rows = (await db.execute(query)).all()
    return [
        AgentSessionResponse(
            id=item.id,
            title=item.title,
            created_at=item.created_at,
            updated_at=item.updated_at,
            message_count=count or 0,
        )
        for item, count in rows
    ]


@router.get("/sessions/{session_id}", response_model=AgentSessionWithMessages)
async def get_session_detail(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin),
):
    """获取 Agent 会话详情"""
    _ = current_admin
    result = await db.execute(
        select(AgentSession)
        .options(selectinload(AgentSession.messages))
        .where(AgentSession.id == session_id)
    )
    session = result.scalar_one_or_none()

    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="会话不存在",
        )

    return AgentSessionWithMessages(
        id=session.id,
        title=session.title,
        created_at=session.created_at,
        updated_at=session.updated_at,
        messages=[AgentMessageResponse.model_validate(msg) for msg in session.messages],
    )


@router.patch("/sessions/{session_id}")
async def rename_session(
    session_id: str,
    payload: AgentSessionRename,
    db: AsyncSession = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin),
):
    """重命名会话（2026-09-30 补：Cherry Studio 式界面需要能改会话名）"""
    _ = current_admin
    result = await db.execute(select(AgentSession).where(AgentSession.id == session_id))
    session = result.scalar_one_or_none()

    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="会话不存在",
        )

    session.title = payload.title.strip()[:100]
    session.updated_at = datetime.now()
    await db.commit()
    await db.refresh(session)
    return AgentSessionResponse.model_validate(session)


@router.delete("/sessions/{session_id}")
async def delete_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin),
):
    """删除 Agent 会话"""
    _ = current_admin
    result = await db.execute(select(AgentSession).where(AgentSession.id == session_id))
    session = result.scalar_one_or_none()

    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="会话不存在",
        )

    await db.delete(session)
    await db.commit()
    return {"message": "删除成功"}
