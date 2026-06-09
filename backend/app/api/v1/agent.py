"""
管理后台 AI Agent API
"""

import json
from typing import AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ...core.database import get_db
from ...core.deps import get_current_admin, security
from ...models.admin import Admin
from ...models.agent import AgentSession, AgentMessage
from ...schemas.agent import AgentChatRequest, AgentSessionResponse, AgentSessionWithMessages, AgentMessageResponse
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
    else:
        session = AgentSession(title="新对话")
        db.add(session)
        await db.commit()
        await db.refresh(session)

    history_result = await db.execute(
        select(AgentMessage)
        .where(AgentMessage.session_id == session.id)
        .order_by(AgentMessage.created_at.asc())
    )
    history_messages = history_result.scalars().all()

    service = AgentService()
    token = credentials.credentials if credentials else ""

    async def generate() -> AsyncGenerator[str, None]:
        try:
            yield _sse_event("ready", {"session_id": session.id})
            async for event in service.chat_stream(
                db=db,
                session=session,
                user_content=request.content,
                token=token,
                history_messages=history_messages,
            ):
                yield _sse_event(event["type"], event["data"])
        except Exception as exc:
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
    db: AsyncSession = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin),
):
    """获取 Agent 会话列表"""
    _ = current_admin
    result = await db.execute(
        select(AgentSession)
        .order_by(AgentSession.updated_at.desc(), AgentSession.created_at.desc())
    )
    sessions = result.scalars().all()
    return [AgentSessionResponse.model_validate(item) for item in sessions]


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
