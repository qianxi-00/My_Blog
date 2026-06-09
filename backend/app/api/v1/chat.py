"""
AI 聊天 API
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from ...core.database import get_db
from ...models.chat import ChatSession, ChatMessage
from ...schemas.chat import (
    ChatMessageCreate, ChatResponse, ChatSessionResponse,
    ChatSessionWithMessages, ChatMessageResponse,
    PromptLabRequest, PromptLabResponse
)
from ...services.openai_service import OpenAIService
from ...services.poro_rag_agent import PoroRagAgent
from .stats import record_ai_call
from ...core.prompt import SYSTEM_PROMPT_CHAT

router = APIRouter()


@router.post("/session", response_model=ChatSessionResponse)
async def create_session(
    db: AsyncSession = Depends(get_db)
):
    """
    创建聊天会话
    """
    session = ChatSession(title="新对话")
    db.add(session)
    await db.commit()
    await db.refresh(session)
    
    return ChatSessionResponse.model_validate(session)


@router.post("/message", response_model=ChatResponse)
async def send_message(
    message_data: ChatMessageCreate,
    db: AsyncSession = Depends(get_db)
):
    """
    发送消息并获取 AI 回复
    """
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
    else:
        # 创建新会话
        session = ChatSession(title="新对话")
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

@router.post("/message/stream")
async def send_message_stream(
    message_data: ChatMessageCreate,
    db: AsyncSession = Depends(get_db)
):
    """
    流式发送消息
    """
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
            session = ChatSession(title="新对话")
            db.add(session)
            await db.flush()
    else:
        session = ChatSession(title="新对话")
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
async def get_session_history(
    session_id: str,
    db: AsyncSession = Depends(get_db)
):
    """
    获取会话历史
    """
    result = await db.execute(
        select(ChatSession)
        .options(selectinload(ChatSession.messages))
        .where(ChatSession.id == session_id)
    )
    session = result.scalar_one_or_none()
    
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="会话不存在"
        )
    
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
    db: AsyncSession = Depends(get_db)
):
    """
    删除会话
    """
    result = await db.execute(
        select(ChatSession).where(ChatSession.id == session_id)
    )
    session = result.scalar_one_or_none()
    
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="会话不存在"
        )
    
    await db.delete(session)
    await db.commit()
    
    return {"message": "删除成功"}


@router.post("/prompt-lab", response_model=PromptLabResponse)
async def prompt_lab(
    request: PromptLabRequest,
    db: AsyncSession = Depends(get_db)
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
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"AI 服务错误：{str(e)}"
        )
