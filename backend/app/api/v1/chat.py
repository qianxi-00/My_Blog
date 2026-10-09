"""
AI 聊天 API
"""

import asyncio
import json
import logging
from datetime import datetime, timedelta
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
from sqlalchemy.orm import selectinload

from ...core.database import get_db
from ...core.deps import get_optional_user, get_current_admin
from ...core.ratelimit import rate_limit
from ...models.chat import ChatSession, ChatMessage, ChatQaCache
from ...models.user import User
from ...schemas.chat import (
    ChatMessageCreate, ChatSessionResponse,
    ChatSessionWithMessages, ChatMessageResponse,
    PromptLabRequest, PromptLabResponse,
    MyChatSessionItem,
)
from ...services.openai_service import OpenAIService
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


import hashlib as _hashlib
import re as _re_mod


def _normalize_question(question: str) -> str:
    """QA 缓存的键归一化：小写、压空白、去标点——挡"全角半角/多个空格"这类假性差异。
    不做分词/同义（那要向量），保持确定性。"""
    text = (question or "").strip().lower()
    text = _re_mod.sub(r"\s+", " ", text)
    text = _re_mod.sub(r"[，。？！、,.?!~～;；:：\s]+$", "", text)
    return text


def _question_hash(question: str) -> str:
    return _hashlib.sha256(_normalize_question(question).encode("utf-8")).hexdigest()


def _has_citation(text: str) -> bool:
    """回答里是否带了来源引用。完整 URL 或站内裸路径（#/articles/5）都算——
    十二期 review 修正：原来只认 "http"，模型用裸路径引用会被误判"没来源"。"""
    return "http" in text or "/articles/" in text


# QA 缓存有效期：个人博客的文章会更新，旧答案 7 天自愈（过期走 LLM 重答 + 覆盖更新）。
# 不做"文章变更联动失效"——那要解析答案里的文章 id 并挂到文章更新路径上，复杂度
# 换来的时效收益对低频更新的个人博客不划算，TTL 自愈足够。
_QA_CACHE_TTL_DAYS = 7



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


from fastapi.responses import StreamingResponse



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

    # 会话 id 与"是不是首次对话"都提前取成局部变量：生成器执行时依赖的 db session
    # 可能已 rollback+close，此时再访问 session 属性会抛
    # "Instance <ChatSession> is not bound to a Session"（2026-09-30 在 agent.py 上实踩，
    # 这里同一模式照抄）
    session_id = session.id
    is_first_turn = True  # 下面按历史条数修正

    user_message = ChatMessage(
        session_id=session_id,
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
        .where(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at.desc())
        .limit(10)
    )
    history = list(reversed(result.scalars().all()))
    is_first_turn = len(history) <= 1
    history_msgs = [{"role": msg.role, "content": msg.content} for msg in history]

    # ---- 十一期「QA 一级缓存」：归一化精确命中 → 免 LLM 免检索，直接回放 ----
    # 放在 user_message 落库之后：会话历史保持完整，追问历史/上下文不受影响。
    # 注意 ChatQaCache 的 import 在模块顶部——create_all 只建"已注册进
    # Base.metadata"的表，函数内 import 会导致启动时表建不出来（实踩）。
    # 十二期 review 补丁：加 7 天 TTL——文章更新后旧答案最多滞留 7 天自愈；
    # 过期行不删除，同题重答后走唯一键冲突的覆盖分支（同步刷 created_at 重置 TTL）。
    q_hash = _question_hash(message_data.content)
    qa_ttl_cutoff = datetime.utcnow() - timedelta(days=_QA_CACHE_TTL_DAYS)
    cached_hit = (
        await db.execute(
            select(ChatQaCache).where(
                ChatQaCache.question_hash == q_hash,
                ChatQaCache.created_at > qa_ttl_cutoff,
            )
        )
    ).scalar_one_or_none()

    if cached_hit:
        async def replay():
            # 前端事件形态与正常流程一致；done 带 cached 标记（前端不特判也可）
            yield _sse("text", {"content": cached_hit.answer})
            yield _sse("done", {"session_id": session_id, "cached": True})

        async def replay_persist():
            cached_hit.hit_count += 1
            cached_hit.last_hit_at = datetime.utcnow()
            db.add(cached_hit)
            assistant_message = ChatMessage(
                session_id=session_id,
                role="assistant",
                content=cached_hit.answer,
            )
            db.add(assistant_message)
            if is_first_turn:
                title = message_data.content[:20] + "..." if len(message_data.content) > 20 else message_data.content
                await db.execute(
                    text("UPDATE chat_sessions SET title = :t WHERE id = :sid"),
                    {"t": title, "sid": session_id},
                )
            await db.commit()

        await replay_persist()
        return StreamingResponse(
            replay(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    async def generate():
        if _ARAG_SEMAPHORE.locked():
            yield _sse("error", {"message": "小魄罗正在招呼太多客人啦，请稍等片刻再试～"})
            return
        async with _ARAG_SEMAPHORE:
            final_text = ""
            tool_call_count = 0  # QA 缓存写入条件之一：用过检索工具的回答才值得缓存
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
                        nonlocal tool_call_count
                        tool_call_count += 1
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
                # 十一期「证据评估门」：用了检索工具但回答里一个来源引用都没有 →
                # 发软警示（零额外 LLM 调用的"诚实信号"）。不打断不拦，只让访客
                # 知道这条答案没引用来源。
                if tool_call_count > 0 and final_text and not _has_citation(final_text):
                    yield _sse("evidence_warning", {"message": "这次小魄罗没有引用到文章来源，答案请自行核实～"})
                yield _sse("done", {"session_id": session_id})
            except Exception as e:
                error_text = str(e)
                if "Invalid token" in error_text or "401" in error_text:
                    yield _sse("error", {"message": "模型网关鉴权失败，暂时无法回答，请站长检查后端 AI 配置。"})
                else:
                    yield _sse("error", {"message": f"A-RAG 服务暂时不可用：{error_text[:200]}"})

            # 持久化本轮回答（与旧接口一致）
            if final_text:
                assistant_message = ChatMessage(
                    session_id=session_id,
                    role="assistant",
                    content=final_text
                )
                db.add(assistant_message)
                if is_first_turn:
                    # 走 UPDATE 而不给 detached 的 session 对象赋值
                    title = message_data.content[:20] + "..." if len(message_data.content) > 20 else message_data.content
                    await db.execute(
                        text("UPDATE chat_sessions SET title = :t WHERE id = :sid"),
                        {"t": title, "sid": session_id},
                    )
                await record_ai_call(db)
                await db.commit()

                # 十一期 QA 缓存写入：带证据（URL）且用过工具的回答才缓存——
                # 排掉闲聊与"没查到"的兜底话术。**独立事务**：缓存写失败绝不回滚
                # 上面已提交的会话记录（教训：往同一事务里 add 唯一键冲突对象再
                # rollback，会把 assistant 消息一起滚掉）。
                if tool_call_count > 0 and _has_citation(final_text):
                    try:
                        db.add(ChatQaCache(
                            question_hash=q_hash,
                            question=message_data.content,
                            answer=final_text,
                        ))
                        await db.commit()
                    except Exception:
                        await db.rollback()
                        try:
                            existing = (
                                await db.execute(
                                    select(ChatQaCache).where(ChatQaCache.question_hash == q_hash)
                                )
                            ).scalar_one_or_none()
                            if existing is not None:
                                existing.answer = final_text  # 同题新答 → 覆盖旧缓存
                                # 同步刷 created_at 重置 TTL——十二期 review 补丁：
                                # 不刷的话 TTL 过期的行每次重答都走 LLM 再覆盖，
                                # 永远命不中缓存（旧答案残留 created_at 又立刻过期）。
                                existing.created_at = datetime.utcnow()
                                await db.commit()
                        except Exception:
                            await db.rollback()

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ---- 十二期 review 补丁：QA 缓存管理通道 ----
# 十一期上缓存时漏了管理面——差答案一旦入缓存永久回放，只能手敲 sqlite 清。
# 管理员（含 AI 助手 call_api 兜底）现在可以列/清/单删。前端不做管理 UI：
# 量小，AI 助手对话里说"看看/清空 QA 缓存"即可。

@router.get("/qa-cache", dependencies=[Depends(get_current_admin)])
async def list_qa_cache(
    db: AsyncSession = Depends(get_db),
    stale_only: bool = False,
):
    """列出 QA 缓存条目（按创建时间倒序，前 50 条）。?stale_only=true 只看过期行。"""
    cutoff = datetime.utcnow() - timedelta(days=_QA_CACHE_TTL_DAYS)
    q = select(ChatQaCache).order_by(ChatQaCache.created_at.desc()).limit(50)
    if stale_only:
        q = q.where(ChatQaCache.created_at <= cutoff)
    rows = (await db.execute(q)).scalars().all()
    return {
        "total_shown": len(rows),
        "ttl_days": _QA_CACHE_TTL_DAYS,
        "items": [
            {
                "id": r.id,
                "question": r.question,
                "answer_preview": (r.answer or "")[:200],
                "hit_count": r.hit_count,
                "created_at": r.created_at,
                "stale": r.created_at <= cutoff,
            }
            for r in rows
        ],
    }


@router.delete("/qa-cache", dependencies=[Depends(get_current_admin)])
async def clear_qa_cache(
    stale_only: bool = True,
    db: AsyncSession = Depends(get_db),
):
    """清 QA 缓存。默认只清过期行（stale_only=true）；传 false 全清。"""
    cutoff = datetime.utcnow() - timedelta(days=_QA_CACHE_TTL_DAYS)
    q = select(ChatQaCache)
    if stale_only:
        q = q.where(ChatQaCache.created_at <= cutoff)
    rows = (await db.execute(q)).scalars().all()
    for r in rows:
        await db.delete(r)
    await db.commit()
    return {"deleted": len(rows), "stale_only": stale_only}


@router.delete("/qa-cache/{cache_id}", dependencies=[Depends(get_current_admin)])
async def delete_qa_cache_entry(
    cache_id: int,
    db: AsyncSession = Depends(get_db),
):
    """单删一条 QA 缓存（清那条答得差的）。"""
    row = (await db.execute(select(ChatQaCache).where(ChatQaCache.id == cache_id))).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="缓存条目不存在")
    await db.delete(row)
    await db.commit()
    return {"deleted": 1, "id": cache_id}


@router.get("/sessions", response_model=list[MyChatSessionItem])
async def list_my_sessions(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_user),
):
    """
    [十期「我的提问历史」] 登录用户与小魄罗的历史会话列表。

    只认登录用户——游客会话按 IP 归属，同 IP 不等于同人，列出来既不准也有
    越权风险（对齐 _owns_session 的归属模型）。未登录 401，前端只在登录态
    展示入口。
    """
    if not current_user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="登录后可查看自己的提问历史")

    from sqlalchemy import func as sa_func
    rows = (
        await db.execute(
            select(
                ChatSession.id,
                ChatSession.title,
                sa_func.count(ChatMessage.id).label("msg_count"),
                ChatSession.created_at,
                ChatSession.updated_at,
            )
            .outerjoin(ChatMessage, ChatMessage.session_id == ChatSession.id)
            .where(ChatSession.user_id == current_user.id)
            .group_by(ChatSession.id)
            .order_by(ChatSession.created_at.desc())
            .limit(20)
        )
    ).all()
    return [
        MyChatSessionItem(
            id=r.id, title=r.title, message_count=int(r.msg_count or 0),
            created_at=r.created_at, updated_at=r.updated_at,
        )
        for r in rows
    ]


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
