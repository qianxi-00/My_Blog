"""
OpenAI 服务
"""

from typing import List, Dict, Any, Tuple, Optional

from openai import AsyncOpenAI

from ..core.config import settings


class OpenAIService:
    """OpenAI API 服务封装"""
    
    def __init__(self):
        self.client = AsyncOpenAI(
            api_key=settings.OPENAI_API_KEY,
            base_url=settings.OPENAI_API_BASE
        )
        self.model = settings.OPENAI_MODEL

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
        model: Optional[str] = None
    ) -> str:
        """
        聊天对话
        
        Args:
            messages: 消息历史 [{"role": "user", "content": "..."}]
            system_prompt: 系统提示词
            max_tokens: 最大 token 数
            temperature: 温度参数
            model: 使用的模型名称，如果不传则使用默认值
        
        Returns:
            AI 回复内容
        """
        # 构建消息列表
        full_messages = []
        
        if system_prompt:
            full_messages.append({
                "role": "system",
                "content": system_prompt
            })
        
        full_messages.extend(messages)
        
        # 使用传入的模型或默认模型
        target_model = model or self.model
        
        # 先尝试非流式调用
        response = await self.client.chat.completions.create(
            model=target_model,
            messages=full_messages,
            max_tokens=max_tokens,
            temperature=temperature
        )

        text = None
        if getattr(response, "choices", None):
            text = self._extract_message_text(response.choices[0].message)

        if text is not None:
            return text

        # 兼容某些 OpenAI 兼容网关：非流式 content 为空，但流式可正常返回正文
        chunks = []
        async for chunk in self.chat_stream(
            messages=messages,
            system_prompt=system_prompt,
            max_tokens=max_tokens,
            temperature=temperature,
            model=target_model,
        ):
            if chunk:
                chunks.append(chunk)

        return "".join(chunks) or ""
    
    async def chat_stream(
        self,
        messages: List[Dict[str, str]],
        system_prompt: Optional[str] = None,
        max_tokens: int = 1000,
        temperature: float = 0.7,
        model: Optional[str] = None
    ):
        """
        流式聊天对话
        
        Yields:
             生成的内容片段
        """
        # 构建消息列表
        full_messages = []
        
        if system_prompt:
            full_messages.append({
                "role": "system",
                "content": system_prompt
            })
        
        full_messages.extend(messages)
        
        target_model = model or self.model
        
        try:
            # 调用 API
            response = await self.client.chat.completions.create(
                model=target_model,
                messages=full_messages,
                max_tokens=max_tokens,
                temperature=temperature,
                stream=True
            )
            
            async for chunk in response:
                if chunk.choices and chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content
        except Exception as e:
            yield f"\n[系统错误]: {str(e)}"
    

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
        target_model = model or self.model
        response = await self.client.chat.completions.create(
            model=target_model,
            messages=messages,
            tools=tools,
            tool_choice=tool_choice,
            max_tokens=max_tokens,
            temperature=temperature,
        )
        if not getattr(response, "choices", None):
            raise RuntimeError("AI 服务没有返回 choices")
        return response.choices[0].message

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
        temperature: float = 0.7
    ) -> Tuple[str, Dict[str, Any]]:
        """
        单次补全（用于 Prompt 实验室）
        
        Args:
            prompt: 提示词
            max_tokens: 最大 token 数
            temperature: 温度参数
        
        Returns:
            (生成结果, 使用情况)
        """
        response = await self.client.chat.completions.create(
            model=self.model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=max_tokens,
            temperature=temperature
        )
        
        result = None
        if getattr(response, "choices", None):
            result = self._extract_message_text(response.choices[0].message)

        if result is None:
            chunks = []
            async for chunk in self.chat_stream(
                messages=[{"role": "user", "content": prompt}],
                max_tokens=max_tokens,
                temperature=temperature,
                model=self.model,
            ):
                if chunk:
                    chunks.append(chunk)
            result = "".join(chunks) or ""

        usage = {
            "prompt_tokens": response.usage.prompt_tokens,
            "completion_tokens": response.usage.completion_tokens,
            "total_tokens": response.usage.total_tokens
        }
        
        return result, usage
