"""
OpenAI 服务
支持 OpenClaw 同款 primary + fallback 模型链（mynewapi / cpa）。
"""

from typing import List, Dict, Any, Tuple, Optional, AsyncIterator

from openai import AsyncOpenAI

from ..core.config import settings
from .llm_router import call_with_fallback, describe_chain, resolve_model_endpoints


class OpenAIService:
    """OpenAI API 服务封装（带模型 fallback）"""

    def __init__(self):
        # 保留默认字段供外部兼容读取；实际请求走模型链
        self.model = settings.OPENAI_MODEL
        endpoints = resolve_model_endpoints()
        if endpoints:
            self.client = endpoints[0].client()
        else:
            self.client = AsyncOpenAI(
                api_key=settings.OPENAI_API_KEY,
                base_url=settings.OPENAI_API_BASE,
            )

    @staticmethod
    def model_chain() -> List[Dict[str, str]]:
        return describe_chain()

    @staticmethod
    def _extract_message_text(message: Any) -> Optional[str]:
        """尽量从 SDK message 对象中提取正文。"""
        if message is None:
            return None

        content = getattr(message, "content", None)
        if isinstance(content, str):
            text = content.strip()
            return text or None

        if isinstance(content, list):
            chunks = []
            for item in content:
                if isinstance(item, str):
                    if item.strip():
                        chunks.append(item)
                    continue

                text = None
                if isinstance(item, dict):
                    text = item.get("text") or item.get("content")
                    if text is None:
                        inner = item.get("text", {})
                        if isinstance(inner, dict):
                            text = inner.get("value")
                else:
                    text = getattr(item, "text", None) or getattr(item, "content", None)
                    if text is None:
                        inner = getattr(item, "text", None)
                        if hasattr(inner, "value"):
                            text = inner.value

                if isinstance(text, str) and text.strip():
                    chunks.append(text)

            merged = "".join(chunks).strip()
            return merged or None

        return None

    async def chat(
        self,
        messages: List[Dict[str, str]],
        system_prompt: Optional[str] = None,
        max_tokens: int = 1000,
        temperature: float = 0.7,
        model: Optional[str] = None,
    ) -> str:
        """
        聊天对话（自动 fallback）。
        model 可传单个模型或逗号分隔链；默认使用 OpenClaw 同款链。
        """
        full_messages: List[Dict[str, str]] = []
        if system_prompt:
            full_messages.append({"role": "system", "content": system_prompt})
        full_messages.extend(messages)

        async def _once(ep, client: AsyncOpenAI) -> str:
            response = await client.chat.completions.create(
                model=ep.model_id,
                messages=full_messages,
                max_tokens=max_tokens,
                temperature=temperature,
            )
            text = None
            if getattr(response, "choices", None):
                text = self._extract_message_text(response.choices[0].message)
            if text is not None:
                return text

            # 非流式 content 为空时，再尝试流式
            chunks: List[str] = []
            stream = await client.chat.completions.create(
                model=ep.model_id,
                messages=full_messages,
                max_tokens=max_tokens,
                temperature=temperature,
                stream=True,
            )
            async for chunk in stream:
                if chunk.choices and chunk.choices[0].delta.content:
                    chunks.append(chunk.choices[0].delta.content)
            return "".join(chunks) or ""

        effective_model = None if model in {settings.OPENAI_MODEL, settings.ZHAIYAO_MODEL} else model
        return await call_with_fallback("chat", _once, model_override=effective_model)

    async def chat_stream(
        self,
        messages: List[Dict[str, str]],
        system_prompt: Optional[str] = None,
        max_tokens: int = 1000,
        temperature: float = 0.7,
        model: Optional[str] = None,
    ) -> AsyncIterator[str]:
        """
        流式聊天。
        注意：流式场景下若中途失败，会切换到下一模型重新开流（已输出片段可能混有错误提示）。
        """
        full_messages: List[Dict[str, str]] = []
        if system_prompt:
            full_messages.append({"role": "system", "content": system_prompt})
        full_messages.extend(messages)

        effective_model = None if model in {settings.OPENAI_MODEL, settings.ZHAIYAO_MODEL} else model
        endpoints = resolve_model_endpoints(effective_model)
        if not endpoints:
            yield "\n[系统错误]: 没有可用的 LLM endpoint"
            return

        last_error: Optional[Exception] = None
        for ep in endpoints:
            client = ep.client()
            try:
                response = await client.chat.completions.create(
                    model=ep.model_id,
                    messages=full_messages,
                    max_tokens=max_tokens,
                    temperature=temperature,
                    stream=True,
                )
                async for chunk in response:
                    if chunk.choices and chunk.choices[0].delta.content:
                        yield chunk.choices[0].delta.content
                return
            except Exception as e:  # noqa: BLE001
                last_error = e
                continue

        yield f"\n[系统错误]: All models failed: {last_error}"

    async def chat_with_tools(
        self,
        messages: List[Dict[str, Any]],
        tools: List[Dict[str, Any]],
        tool_choice: str = "auto",
        max_tokens: int = 1400,
        temperature: float = 0.35,
        model: Optional[str] = None,
    ) -> Any:
        """调用支持 tool calling 的 Chat Completions，返回 SDK message 对象。"""

        async def _once(ep, client: AsyncOpenAI) -> Any:
            response = await client.chat.completions.create(
                model=ep.model_id,
                messages=messages,
                tools=tools,
                tool_choice=tool_choice,
                max_tokens=max_tokens,
                temperature=temperature,
            )
            if not getattr(response, "choices", None):
                raise RuntimeError("AI 服务没有返回 choices")
            return response.choices[0].message

        effective_model = None if model in {settings.OPENAI_MODEL, settings.ZHAIYAO_MODEL} else model
        return await call_with_fallback("chat_with_tools", _once, model_override=effective_model)

    def message_to_dict(self, message: Any) -> Dict[str, Any]:
        """把 OpenAI SDK message 统一转成可再次发送的 dict，保留 tool_calls。"""
        if hasattr(message, "model_dump"):
            data = message.model_dump(exclude_none=True)
        elif isinstance(message, dict):
            data = {k: v for k, v in message.items() if v is not None}
        else:
            data = {
                "role": getattr(message, "role", "assistant"),
                "content": getattr(message, "content", None),
            }
            tool_calls = getattr(message, "tool_calls", None)
            if tool_calls:
                data["tool_calls"] = [
                    call.model_dump(exclude_none=True) if hasattr(call, "model_dump") else call
                    for call in tool_calls
                ]
        data.setdefault("role", "assistant")
        if "content" not in data:
            data["content"] = None
        return data

    async def complete(
        self,
        prompt: str,
        max_tokens: int = 1000,
        temperature: float = 0.7,
    ) -> Tuple[str, Dict[str, Any]]:
        """
        单次补全（用于 Prompt 实验室）
        """

        async def _once(ep, client: AsyncOpenAI) -> Tuple[str, Dict[str, Any]]:
            response = await client.chat.completions.create(
                model=ep.model_id,
                messages=[{"role": "user", "content": prompt}],
                max_tokens=max_tokens,
                temperature=temperature,
            )

            result = None
            if getattr(response, "choices", None):
                result = self._extract_message_text(response.choices[0].message)

            if result is None:
                chunks: List[str] = []
                stream = await client.chat.completions.create(
                    model=ep.model_id,
                    messages=[{"role": "user", "content": prompt}],
                    max_tokens=max_tokens,
                    temperature=temperature,
                    stream=True,
                )
                async for chunk in stream:
                    if chunk.choices and chunk.choices[0].delta.content:
                        chunks.append(chunk.choices[0].delta.content)
                result = "".join(chunks) or ""

            usage = {
                "prompt_tokens": getattr(getattr(response, "usage", None), "prompt_tokens", 0) or 0,
                "completion_tokens": getattr(getattr(response, "usage", None), "completion_tokens", 0) or 0,
                "total_tokens": getattr(getattr(response, "usage", None), "total_tokens", 0) or 0,
                "model_ref": ep.ref,
            }
            return result, usage

        return await call_with_fallback("complete", _once)
