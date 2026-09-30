"""
AI 聊天 API
"""

import asyncio
import json
import logging
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from ...core.database import get_db
from ...core.deps import get_optional_user
from ...core.ratelimit import rate_limit
from ...models.chat import ChatSession, ChatMessage
from ...models.user import User
from ...schemas.chat import (
    ChatMessageCreate, ChatResponse, ChatSessionResponse,
    ChatSessionWithMessages, ChatMessageResponse,
    PromptLabRequest, PromptLabResponse
)
from ...services.openai_service import OpenAIService
from ...services.poro_rag_agent import PoroRagAgent
from ...services.arag_agent import build_arag_agent
from .stats import record_ai_call
from ...core.prompt import SYSTEM_PROMPT_CHAT

router = APIRouter()
logger = logging.getLogger(__name__)

# A-RAG 每路对话是一个完整 agent 循环（多轮 LLM + 工具），768MB 容器设 8 路并发上限
_ARAG_SEMAPHORE = asyncio.Semaphore(8)

# 2026-09-30：chat 全部是直连 LLM 的端点，此前既无认证也无限流 —— 未认证即可无限放大
# 模型费用（A-RAG 一条消息最多 8 轮 LLM 往返）。加进程内限流兜底。
_CHAT_LIMIT = dict(limit=20, window_seconds=60, key_scope="ip")
_CHAT_HEAVY_LIMIT = dict(limit=6, window_seconds=60, key_scope="ip")
_LAB_LIMIT = dict(limit=10, window_seconds=60, key_scope="ip")


def _client_ip(request: Request) -> Optional[str]:
    """取客户端 IP。nginx 已覆写 X-Forwarded-For（2026-09-30 修复），所以它可信。"""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        first = forwarded.split(",")[0].strip()
        if first:
            return first
    return request.client.host if request.client else None


def _is_admin(user: Optional[User]) -> bool:
    return user is not None and user.role in ("admin", "super_admin")


def _owns_session(session: ChatSession, user: Optional[User], ip: Optional[str]) -> bool:
    """会话归属判定：登录用户按 user_id，匿名按创建时的 IP。存量无主行任何人都不算主人。"""
    if _is_admin(user):
        return True
    if session.user_id is not None:
        return user is not None and int(user.id) == int(session.user_id)
    if session.owner_ip is not None:
        return ip is not None and session.owner_ip == ip
    return False


async def _load_owned_session(
    session_id: str, db: AsyncSession, user: Optional[User], ip: Optional[str]
) -> ChatSession:
    result = await db.execute(select(ChatSession).where(ChatSession.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="会话不存在")
    if not _owns_session(session, user, ip):
        # 不区分"不存在"与"无权"，避免被用来枚举别人的会话 id
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权访问该会话")
    return session


def _sse(event_type: str, data: dict) -> str:
    return f"event: {event_type}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def _summarize_tool_output(output: Any) -> str:
    """把工具输出压成给前端芯片用的一行摘要。"""
    content = getattr(output, "content", None)
    text = content if isinstance(content, str) else (
        output if isinstance(output, str) else json.dumps(output, ensure_ascii=False, default=str)
    )
    try:
        parsed = json.loads(text)
        if isinstance(parsed, list):
            return f"{len(parsed)} 条结果"
        if isinstance(parsed, dict):
            if "error" in parsed:
                return str(parsed["error"])[:80]
            for key in ("results", "items", "matched_blocks"):
                value = parsed.get(key)
                if isinstance(value, list):
                    return f"{len(value)} 条结果"
            return "完成"
    except Exception:
        pass
    return text[:80]



@router.post("/session", response_model=ChatSessionResponse,
             dependencies=[Depends(rate_limit("chat_session", **_CHAT_LIMIT))])
async def create_session(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_user),
):
    """
    创建聊天会话（记录归属：登录用户记 user_id，访客记创建时的 IP）
    """
    session = ChatSession(
        title="新对话",
        user_id=current_user.id if current_user else None,
        owner_ip=_client_ip(request),
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    
    return ChatSessionResponse.model_validate(session)


@router.post("/message", response_model=ChatResponse,
             dependencies=[Depends(rate_limit("chat_message", **_CHAT_HEAVY_LIMIT))])
async def send_message(
    message_data: ChatMessageCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_user),
):
    """
    发送消息并获取 AI 回复
    """
    client_ip = _client_ip(request)

    # 获取或创建会话
    if message_data.session_id:
        result = await db.execute(
            select(ChatSession)
            .options(selectinload(ChatSession.messages))
            .where(ChatSession.id == message_data.session_id)
        )
        session = result.scalar_one_or_none()
        
        if not session:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="会话不存在"
            )
        # 2026-09-30：不能往别人的会话里写消息（会把其历史一起喂进 LLM）
        if not _owns_session(session, current_user, client_ip):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权访问该会话")
    else:
        # 创建新会话
        session = ChatSession(
            title="新对话",
            user_id=current_user.id if current_user else None,
            owner_ip=client_ip,
        )
        db.add(session)
        await db.flush()
    
    # 保存用户消息
    user_message = ChatMessage(
        session_id=session.id,
        role="user",
        content=message_data.content
    )
    db.add(user_message)
    await db.flush()
    
    # 获取历史消息用于上下文（短期记忆，最近10条）
    result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.session_id == session.id)
        .order_by(ChatMessage.created_at.desc())
        .limit(10)
    )
    history = list(reversed(result.scalars().all()))
    
    # 小魄罗无向量 RAG Agent：让模型按需调用关键词检索、目录/glob、文章读取等工具。
    poro_agent = PoroRagAgent(db)

    try:
        agent_result = await poro_agent.run(
            history=[
                {"role": msg.role, "content": msg.content}
                for msg in history
            ]
        )
        ai_response = agent_result["answer"]
        # 记录 AI 调用
        await record_ai_call(db)
    except Exception as e:
        error_text = str(e)
        if "Invalid token" in error_text or "401" in error_text:
            ai_response = "抱歉，小魄罗的模型网关鉴权失败了，暂时无法回答。请站长检查后端 AI API Key 配置。"
        else:
            ai_response = "抱歉，小魄罗的 Agent 服务暂时不可用，请稍后再试。"
    
    # 保存 AI 回复
    assistant_message = ChatMessage(
        session_id=session.id,
        role="assistant",
        content=ai_response
    )
    db.add(assistant_message)
    
    # 更新会话标题（如果是第一条消息）
    if len(history) <= 1:
        # 使用第一条消息的前20个字符作为标题
        session.title = message_data.content[:20] + "..." if len(message_data.content) > 20 else message_data.content
    
    await db.commit()
    await db.refresh(user_message)
    await db.refresh(assistant_message)
    
    return ChatResponse(
        session_id=session.id,
        message=ChatMessageResponse.model_validate(user_message),
        reply=ChatMessageResponse.model_validate(assistant_message)
    )

from fastapi.responses import StreamingResponse

@router.post("/message/stream",
             dependencies=[Depends(rate_limit("chat_message", **_CHAT_HEAVY_LIMIT))])
async def send_message_stream(
    message_data: ChatMessageCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_user),
):
    """
    流式发送消息
    """
    client_ip = _client_ip(request)

    # 获取或创建会话
    if message_data.session_id:
        result = await db.execute(
            select(ChatSession)
            .options(selectinload(ChatSession.messages))
            .where(ChatSession.id == message_data.session_id)
        )
        session = result.scalar_one_or_none()
        
        if not session:
            # 如果会话不存在，创建新会话（容错处理）
            session = ChatSession(
                title="新对话",
                user_id=current_user.id if current_user else None,
                owner_ip=client_ip,
            )
            db.add(session)
            await db.flush()
        elif not _owns_session(session, current_user, client_ip):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权访问该会话")
    else:
        session = ChatSession(
            title="新对话",
            user_id=current_user.id if current_user else None,
            owner_ip=client_ip,
        )
        db.add(session)
        await db.flush()
    
    # 保存用户消息
    user_message = ChatMessage(
        session_id=session.id,
        role="user",
        content=message_data.content
    )
    db.add(user_message)
    await db.flush() # 获取 ID
    await db.refresh(user_message)
    # 必须在这里落库：用户输入不是可有可无的副产物，客户端中途断开不该把它一起回滚
    await db.commit()
    
    # 获取历史消息
    result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.session_id == session.id)
        .order_by(ChatMessage.created_at.desc())
        .limit(10)
    )
    history = list(reversed(result.scalars().all()))
    
    # 流式接口保持响应协议不变：先由 Agent 完成工具检索和推理，再按文本块返回。
    poro_agent = PoroRagAgent(db)
    
    async def generate():
        ai_response_content = ""
        try:
            agent_result = await poro_agent.run(
                history=[
                    {"role": msg.role, "content": msg.content} 
                    for msg in history
                ]
            )
            ai_response_content = agent_result["answer"]
            for i in range(0, len(ai_response_content), 24):
                yield ai_response_content[i:i + 24]
        except Exception as e:
            error_text = str(e)
            if "Invalid token" in error_text or "401" in error_text:
                yield "抱歉，小魄罗的模型网关鉴权失败了，暂时无法回答。请站长检查后端 AI API Key 配置。"
            else:
                yield "抱歉，小魄罗的 Agent 服务暂时不可用，请稍后再试。"
        
        # 保存 AI 回复
        if ai_response_content:
            assistant_message = ChatMessage(
                session_id=session.id,
                role="assistant",
                content=ai_response_content
            )
            db.add(assistant_message)
            
            # 更新标题
            if len(history) <= 1:
                title = message_data.content[:20] + "..." if len(message_data.content) > 20 else message_data.content
                # Update DB via update statement or session merge? session object is attached.
                session.title = title
            
            # 记录 AI 调用
            await record_ai_call(db)
            
            await db.commit()
            
    return StreamingResponse(generate(), media_type="text/plain")


@router.post("/message/agentic",
             dependencies=[Depends(rate_limit("chat_message", **_CHAT_HEAVY_LIMIT))])
async def send_message_agentic(
    message_data: ChatMessageCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_user),
):
    """
    A-RAG 流式对话（SSE）

    事件协议（与管理端 agent 一致的 event/data 帧格式）：
    - reasoning: 模型思考增量 {"content"}
    - tool_start: {"name", "input"}
    - tool_result: {"name", "ok", "summary"}
    - text: 最终回答增量 {"content"}
    - done: {"session_id"}
    - error: {"message"}
    """
    if message_data.session_id:
        result = await db.execute(
            select(ChatSession)
            .options(selectinload(ChatSession.messages))
            .where(ChatSession.id == message_data.session_id)
        )
        session = result.scalar_one_or_none()
        if not session:
            session = ChatSession(
                title="新对话",
                user_id=current_user.id if current_user else None,
                owner_ip=_client_ip(request),
            )
            db.add(session)
            await db.flush()
        elif not _owns_session(session, current_user, _client_ip(request)):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权访问该会话")
    else:
        session = ChatSession(
            title="新对话",
            user_id=current_user.id if current_user else None,
            owner_ip=_client_ip(request),
        )
        db.add(session)
        await db.flush()

    user_message = ChatMessage(
        session_id=session.id,
        role="user",
        content=message_data.content
    )
    db.add(user_message)
    await db.flush()
    await db.refresh(user_message)
    # 同上：用户消息先落库，再进生成器，避免断连丢输入
    await db.commit()

    result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.session_id == session.id)
        .order_by(ChatMessage.created_at.desc())
        .limit(10)
    )
    history = list(reversed(result.scalars().all()))
    history_msgs = [{"role": msg.role, "content": msg.content} for msg in history]

    async def generate():
        if _ARAG_SEMAPHORE.locked():
            yield _sse("error", {"message": "小魄罗正在招呼太多客人啦，请稍等片刻再试～"})
            return
        async with _ARAG_SEMAPHORE:
            final_text = ""
            try:
                queue: asyncio.Queue = asyncio.Queue()
                # langgraph v3 messages 通道不透传 reasoning，改由模型子类回调直接入队
                agent = build_arag_agent(
                    on_reasoning=lambda delta: queue.put_nowait(("reasoning", {"content": delta})),
                )
                stream = await agent.astream_events({"messages": history_msgs}, version="v3")

                async def pump_messages():
                    async for message in stream.messages:
                        async for delta in message.text:
                            if delta:
                                await queue.put(("text", {"content": delta}))

                async def pump_tools():
                    async for call in stream.tool_calls:
                        input_text = call.input if isinstance(call.input, str) else json.dumps(
                            call.input if call.input else {}, ensure_ascii=False, default=str)
                        await queue.put(("tool_start", {
                            "name": call.tool_name,
                            "input": input_text[:160],
                        }))
                        async for _ in getattr(call, "output_deltas", []):
                            pass
                        error = getattr(call, "error", None)
                        await queue.put(("tool_result", {
                            "name": call.tool_name,
                            "ok": error is None,
                            "summary": _summarize_tool_output(call.output) if error is None else str(error)[:80],
                        }))

                tasks = [
                    asyncio.create_task(pump_messages()),
                    asyncio.create_task(pump_tools()),
                ]
                try:
                    while any(not t.done() for t in tasks) or not queue.empty():
                        try:
                            kind, data = await asyncio.wait_for(queue.get(), timeout=0.25)
                        except asyncio.TimeoutError:
                            continue
                        if kind == "text":
                            final_text += data["content"]
                        yield _sse(kind, data)
                    failed = next((t for t in tasks if t.done() and t.exception()), None)
                    if failed is not None:
                        raise failed.exception()
                finally:
                    for t in tasks:
                        t.cancel()
                yield _sse("done", {"session_id": session.id})
            except Exception as e:
                error_text = str(e)
                if "Invalid token" in error_text or "401" in error_text:
                    yield _sse("error", {"message": "模型网关鉴权失败，暂时无法回答，请站长检查后端 AI 配置。"})
                else:
                    yield _sse("error", {"message": f"A-RAG 服务暂时不可用：{error_text[:200]}"})

            # 持久化本轮回答（与旧接口一致）
            if final_text:
                assistant_message = ChatMessage(
                    session_id=session.id,
                    role="assistant",
                    content=final_text
                )
                db.add(assistant_message)
                if len(history) <= 1:
                    title = message_data.content[:20] + "..." if len(message_data.content) > 20 else message_data.content
                    session.title = title
                await record_ai_call(db)
                await db.commit()

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )

@router.get("/session/{session_id}/history", response_model=ChatSessionWithMessages)
async def get_session_history(
    session_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_user),
):
    """
    获取会话历史

    2026-09-30：这个函数此前**没有路由装饰器**，是个死函数；而前端
    api/chat.ts 与 Live2DWaifu / DesktopPet 都在调 GET /chat/session/{id}/history，
    于是桌宠/看板娘的聊天历史永远加载不出来（异常还被 try/catch 吞掉，静默失败）。
    补上路由的同时加归属校验，避免变成"读任意人聊天记录"的洞。
    """
    session = await _load_owned_session(session_id, db, current_user, _client_ip(request))
    return ChatSessionWithMessages(
        id=session.id,
        title=session.title,
        created_at=session.created_at,
        updated_at=session.updated_at,
        messages=[ChatMessageResponse.model_validate(m) for m in session.messages]
    )


@router.delete("/session/{session_id}")
async def delete_session(
    session_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_user),
):
    """
    删除会话（2026-09-30 加归属校验：此前无鉴权，任意匿名用户可删任意会话）
    """
    session = await _load_owned_session(session_id, db, current_user, _client_ip(request))

    await db.delete(session)
    await db.commit()
    
    return {"message": "删除成功"}


@router.post("/prompt-lab", response_model=PromptLabResponse,
             dependencies=[Depends(rate_limit("prompt_lab", **_LAB_LIMIT))])
async def prompt_lab(
    request: PromptLabRequest,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_user),
):
    """
    Prompt 实验室 - 测试 Prompt 效果
    """
    openai_service = OpenAIService()
    
    # 构建最终 prompt
    full_prompt = request.prompt
    if request.input_text:
        full_prompt = f"{request.prompt}\n\n输入内容：\n{request.input_text}"
    
    try:
        result, usage = await openai_service.complete(
            prompt=full_prompt,
            max_tokens=request.max_tokens,
            temperature=request.temperature
        )
        
        # 记录 AI 调用
        await record_ai_call(db)
        
        return PromptLabResponse(
            result=result,
            prompt_tokens=usage.get("prompt_tokens", 0),
            completion_tokens=usage.get("completion_tokens", 0),
            total_tokens=usage.get("total_tokens", 0)
        )
    except Exception as e:
        # 2026-09-30：不再把 str(e) 回显给调用方（可能带上上游地址/密钥片段/内部路径）。
        # 详情只进服务端日志，对外给一句可行动的提示。
        logger.exception("prompt-lab 调用失败")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="AI 服务暂时不可用，请稍后再试"
        ) from e
