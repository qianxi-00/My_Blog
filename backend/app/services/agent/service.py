"""
AgentService 主类（精简版）
仅负责模型通信（OpenAI SDK）和 SSE 流事件处理，
具体的工具执行委托给 registry.py 调度。
"""

import json
from typing import Any, AsyncGenerator, Dict, List, Optional

from openai import AsyncOpenAI
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.agent import AgentMessage, AgentSession
from app.models.stats import DailyStat
from .registry import build_all_tools, dispatch

from app.core.prompt import SYSTEM_PROMPT_AGENT

class AgentService:
    """后台 Agent 服务"""

    MAX_TOOL_ROUNDS = 10

    def __init__(self):
        self.client = AsyncOpenAI(
            api_key=settings.AGENT_API_KEY,
            base_url=settings.AGENT_API_BASE,
            timeout=45.0,
            max_retries=1,
        )
        self.model = settings.AGENT_MODEL

    async def _save_message(
        self,
        db: AsyncSession,
        session_id: str,
        role: str,
        content: Optional[str],
        tool_calls: Optional[Any] = None,
        tool_call_id: Optional[str] = None,
        tool_name: Optional[str] = None,
    ) -> AgentMessage:
        message = AgentMessage(
            session_id=session_id,
            role=role,
            content=content,
            tool_calls=tool_calls,
            tool_call_id=tool_call_id,
            tool_name=tool_name,
        )
        db.add(message)
        await db.flush()
        return message

    async def chat_stream(
        self,
        db: AsyncSession,
        session: AgentSession,
        user_content: str,
        token: str,
        history_messages: List[AgentMessage],
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """Agent 聊天（SSE 事件流），支持流式 thinking"""

        await self._save_message(db, session.id, "user", user_content)

        llm_messages: List[Dict[str, Any]] = [{"role": "system", "content": SYSTEM_PROMPT_AGENT}]

        for item in history_messages[-30:]:
            if item.role == "tool":
                llm_messages.append(
                    {
                        "role": "tool",
                        "content": item.content or "",
                        "tool_call_id": item.tool_call_id,
                    }
                )
            elif item.tool_calls:
                llm_messages.append(
                    {
                        "role": "assistant",
                        "content": item.content,
                        "tool_calls": item.tool_calls,
                    }
                )
            else:
                llm_messages.append(
                    {
                        "role": item.role,
                        "content": item.content or "",
                    }
                )

        llm_messages.append({"role": "user", "content": user_content})

        round_count = 0
        llm_call_count = 0  # 记录本次对话的 LLM 调用次数
        while round_count < self.MAX_TOOL_ROUNDS:
            round_count += 1
            llm_call_count += 1

            # ----- 流式调用 LLM -----
            stream = await self.client.chat.completions.create(
                model=self.model,
                messages=llm_messages,
                tools=build_all_tools(),
                tool_choice="auto",
                max_tokens=settings.AGENT_MAX_TOKENS,
                temperature=settings.AGENT_TEMPERATURE,
                stream=True,
            )

            content_buffer = ""
            tool_call_map: Dict[int, Dict[str, str]] = {}
            tool_calls_detected = False
            thinking_flushed = False

            async for chunk in stream:
                if not chunk.choices:
                    continue
                delta = chunk.choices[0].delta

                # --- 内容 token ---
                if delta.content:
                    content_buffer += delta.content
                    if tool_calls_detected:
                        # 已确认为思考轮——实时流式输出
                        yield {
                            "type": "thinking",
                            "data": {"content": delta.content},
                        }

                # --- tool_call 增量 ---
                if delta.tool_calls:
                    if not tool_calls_detected:
                        tool_calls_detected = True
                        # 把之前缓冲的 content 一次性作为 thinking 发出
                        if content_buffer and not thinking_flushed:
                            yield {
                                "type": "thinking",
                                "data": {"content": content_buffer},
                            }
                            thinking_flushed = True

                    for tc_delta in delta.tool_calls:
                        idx = tc_delta.index
                        if idx not in tool_call_map:
                            tool_call_map[idx] = {
                                "id": "",
                                "name": "",
                                "arguments": "",
                            }
                        if tc_delta.id:
                            tool_call_map[idx]["id"] = tc_delta.id
                        if tc_delta.function:
                            if tc_delta.function.name:
                                tool_call_map[idx]["name"] += tc_delta.function.name
                            if tc_delta.function.arguments:
                                tool_call_map[idx]["arguments"] += tc_delta.function.arguments

            # ----- 本轮流结束 -----

            if tool_calls_detected:
                # ===== 工具调用轮 =====
                serialized_calls: List[Dict[str, Any]] = []
                for idx in sorted(tool_call_map.keys()):
                    tc = tool_call_map[idx]
                    serialized_calls.append(
                        {
                            "id": tc["id"],
                            "type": "function",
                            "function": {
                                "name": tc["name"],
                                "arguments": tc["arguments"],
                            },
                        }
                    )

                await self._save_message(
                    db=db,
                    session_id=session.id,
                    role="assistant",
                    content=content_buffer or None,
                    tool_calls=serialized_calls,
                )

                llm_messages.append(
                    {
                        "role": "assistant",
                        "content": content_buffer or None,
                        "tool_calls": serialized_calls,
                    }
                )

                for idx in sorted(tool_call_map.keys()):
                    tc_info = tool_call_map[idx]
                    tool_name = tc_info["name"]
                    arguments = tc_info["arguments"]

                    try:
                        parsed_args = json.loads(arguments)
                    except Exception:
                        parsed_args = {}

                    # 派发给 registry 处理
                    result, kind = await dispatch(
                        name=tool_name,
                        args=parsed_args,
                        token=token,
                        db=db,
                    )

                    yield {
                        "type": "tool_start",
                        "data": {
                            "tool_call_id": tc_info["id"],
                            "name": tool_name,
                            "arguments": arguments,
                            "kind": kind,
                        },
                    }

                    result_json = json.dumps(result, ensure_ascii=False)

                    await self._save_message(
                        db=db,
                        session_id=session.id,
                        role="tool",
                        content=result_json,
                        tool_call_id=tc_info["id"],
                        tool_name=tool_name,
                    )

                    llm_messages.append(
                        {
                            "role": "tool",
                            "tool_call_id": tc_info["id"],
                            "content": result_json,
                        }
                    )

                    yield {
                        "type": "tool_result",
                        "data": {
                            "tool_call_id": tc_info["id"],
                            "result": result,
                            "kind": kind,
                        },
                    }

                continue

            # ===== 最终回答（无工具调用）=====
            final_text = content_buffer
            await self._save_message(
                db=db,
                session_id=session.id,
                role="assistant",
                content=final_text,
            )

            if session.title in (None, "", "新对话"):
                session.title = user_content[:30] + ("..." if len(user_content) > 30 else "")

            chunk_size = 120
            for i in range(0, len(final_text), chunk_size):
                yield {
                    "type": "text",
                    "data": {"content": final_text[i : i + chunk_size]},
                }

            # 记录 AI 调用次数
            await self._record_ai_calls(db, llm_call_count)
            await db.commit()
            yield {
                "type": "done",
                "data": {"session_id": session.id},
            }
            return

        await self._record_ai_calls(db, llm_call_count)
        await db.commit()
        yield {
            "type": "error",
            "data": {"message": "工具调用轮次超限，请重试或缩小问题范围。"},
        }

    @staticmethod
    async def _record_ai_calls(db: AsyncSession, count: int) -> None:
        """将 Agent LLM 调用次数写入 daily_stats"""
        from datetime import date as _date

        today_str = str(_date.today())
        result = await db.execute(
            text("SELECT id, ai_api_calls FROM daily_stats WHERE date = :d"),
            {"d": today_str},
        )
        row = result.first()
        if row:
            await db.execute(
                text("UPDATE daily_stats SET ai_api_calls = ai_api_calls + :c WHERE id = :id"),
                {"c": count, "id": row.id},
            )
        else:
            ds = DailyStat(date=today_str, ai_api_calls=count)
            db.add(ds)
        await db.flush()

