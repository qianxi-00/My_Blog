"""
LLM 路由：对齐 OpenClaw agents.defaults.model 的 primary + fallbacks。

OpenClaw 默认链：
  primary: mynewapi/grok-4.5
  fallbacks:
    mynewapi/gpt-5.6-terra
    cpa/grok-4.5
    mynewapi/gpt-5.5
    mynewapi/gpt-5.6-luna
    mynewapi/deepseek-ai/deepseek-v4-flash
    mynewapi/stepfun-ai/step-3.7-flash
    mynewapi/minimaxai/minimax-m3
    mynewapi/moonshotai/kimi-k2.6
    mynewapi/deepseek-ai/deepseek-v4-pro
    mynewapi/z-ai/glm-5.2
    mynewapi/minimaxai/minimax-m2.7
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Dict, List, Optional, Sequence, TypeVar

from openai import AsyncOpenAI

from ..core.config import settings

logger = logging.getLogger(__name__)

T = TypeVar("T")

# 与 OpenClaw agents.defaults.model 保持一致（provider/model）
DEFAULT_MODEL_CHAIN: List[str] = [
    "mynewapi/grok-4.5",
    "mynewapi/gpt-5.6-terra",
    "cpa/grok-4.5",
    "mynewapi/gpt-5.5",
    "mynewapi/gpt-5.6-luna",
    "mynewapi/deepseek-ai/deepseek-v4-flash",
    "mynewapi/stepfun-ai/step-3.7-flash",
    "mynewapi/minimaxai/minimax-m3",
    "mynewapi/moonshotai/kimi-k2.6",
    "mynewapi/deepseek-ai/deepseek-v4-pro",
    "mynewapi/z-ai/glm-5.2",
    "mynewapi/minimaxai/minimax-m2.7",
]


@dataclass(frozen=True)
class ModelEndpoint:
    """一次可调用的 (provider, base_url, api_key, model_id)。"""

    provider: str
    base_url: str
    api_key: str
    model_id: str
    ref: str  # 原始 provider/model 引用

    def client(self, *, timeout: Optional[float] = None, max_retries: int = 1) -> AsyncOpenAI:
        kwargs: Dict[str, Any] = {
            "api_key": self.api_key,
            "base_url": self.base_url,
            "max_retries": max_retries,
        }
        if timeout is not None:
            kwargs["timeout"] = timeout
        return AsyncOpenAI(**kwargs)


def _provider_credentials() -> Dict[str, Dict[str, str]]:
    """provider -> {base_url, api_key}。"""
    mynewapi_base = (settings.OPENAI_API_BASE or "https://qianxi7988.me/v1").rstrip("/")
    mynewapi_key = settings.OPENAI_API_KEY or ""
    cpa_base = (getattr(settings, "CPA_API_BASE", None) or "http://43.160.202.101:8317/v1").rstrip("/")
    cpa_key = getattr(settings, "CPA_API_KEY", None) or ""

    creds = {
        "mynewapi": {"base_url": mynewapi_base, "api_key": mynewapi_key},
        "cpa": {"base_url": cpa_base, "api_key": cpa_key},
        # 兼容无前缀模型：默认走 mynewapi / OPENAI_*
        "default": {"base_url": mynewapi_base, "api_key": mynewapi_key},
    }
    return creds


def _parse_model_ref(ref: str) -> tuple[str, str]:
    """
    解析 provider/model。
    模型 id 本身可能含 '/'，例如 deepseek-ai/deepseek-v4-flash，
    因此只在第一个 '/' 处拆分，且已知 provider 白名单。
    """
    raw = (ref or "").strip()
    if not raw:
        raise ValueError("empty model ref")

    known = {"mynewapi", "cpa", "openrouter", "deepseek", "xem"}
    if "/" in raw:
        provider, model_id = raw.split("/", 1)
        provider = provider.strip()
        model_id = model_id.strip()
        if provider in known and model_id:
            return provider, model_id
    # 无已知 provider 前缀：整段当 model_id，走 default/mynewapi
    return "default", raw


def _chain_from_settings() -> List[str]:
    """
    优先读 LLM_MODEL_CHAIN；
    否则 OPENAI_MODEL + OPENAI_MODEL_FALLBACKS / AGENT 同构字段；
    再否则用与 OpenClaw 一致的默认链。
    """
    explicit = (getattr(settings, "LLM_MODEL_CHAIN", None) or "").strip()
    if explicit:
        return [x.strip() for x in explicit.split(",") if x.strip()]

    primary = (settings.OPENAI_MODEL or "grok-4.5").strip()
    # 若 primary 未带 provider，补 mynewapi
    if "/" not in primary or primary.split("/", 1)[0] not in {"mynewapi", "cpa", "openrouter", "deepseek", "xem"}:
        primary = f"mynewapi/{primary}"

    fb_raw = (getattr(settings, "OPENAI_MODEL_FALLBACKS", None) or "").strip()
    fallbacks: List[str] = []
    if fb_raw:
        for item in fb_raw.split(","):
            item = item.strip()
            if not item:
                continue
            if "/" not in item or item.split("/", 1)[0] not in {"mynewapi", "cpa", "openrouter", "deepseek", "xem"}:
                item = f"mynewapi/{item}"
            fallbacks.append(item)
    else:
        # 无显式 fallback 配置时，使用 OpenClaw 默认链（去掉与 primary 重复项）
        fallbacks = [x for x in DEFAULT_MODEL_CHAIN if x != primary]

    chain = [primary] + [x for x in fallbacks if x != primary]
    # 去重保序
    seen = set()
    out: List[str] = []
    for x in chain:
        if x not in seen:
            seen.add(x)
            out.append(x)
    return out or list(DEFAULT_MODEL_CHAIN)


def resolve_model_endpoints(model_override: Optional[str] = None) -> List[ModelEndpoint]:
    """
    解析可调用的 endpoint 列表。
    model_override:
      - None: 使用默认链
      - 单个 model / provider/model: 仅该模型（仍解析 provider）
      - 逗号分隔: 自定义链
    """
    creds = _provider_credentials()

    if model_override and model_override.strip():
        refs = [x.strip() for x in model_override.split(",") if x.strip()]
    else:
        refs = _chain_from_settings()

    endpoints: List[ModelEndpoint] = []
    for ref in refs:
        try:
            provider, model_id = _parse_model_ref(ref)
        except ValueError:
            continue
        info = creds.get(provider) or creds["default"]
        api_key = info.get("api_key") or ""
        base_url = info.get("base_url") or ""
        if not api_key or not base_url or not model_id:
            logger.warning("skip model ref=%s (missing credentials or model_id)", ref)
            continue
        endpoints.append(
            ModelEndpoint(
                provider=provider if provider != "default" else "mynewapi",
                base_url=base_url,
                api_key=api_key,
                model_id=model_id,
                ref=ref if "/" in ref else f"mynewapi/{ref}",
            )
        )
    return endpoints


async def call_with_fallback(
    operation: str,
    fn: Callable[[ModelEndpoint, AsyncOpenAI], Awaitable[T]],
    *,
    model_override: Optional[str] = None,
    timeout: Optional[float] = None,
    max_retries: int = 1,
) -> T:
    """
    按链依次调用；任一成功即返回；全部失败抛出最后一个异常。
    fn(endpoint, client) -> result
    """
    endpoints = resolve_model_endpoints(model_override)
    if not endpoints:
        raise RuntimeError("没有可用的 LLM endpoint（检查 API Key / 模型链配置）")

    errors: List[str] = []
    last_exc: Optional[BaseException] = None
    for ep in endpoints:
        client = ep.client(timeout=timeout, max_retries=max_retries)
        try:
            logger.info("LLM %s try %s model=%s base=%s", operation, ep.ref, ep.model_id, ep.base_url)
            result = await fn(ep, client)
            logger.info("LLM %s success %s", operation, ep.ref)
            return result
        except Exception as exc:  # noqa: BLE001 - 需要跨模型继续 fallback
            last_exc = exc
            msg = f"{ep.ref}: {type(exc).__name__}: {exc}"
            errors.append(msg)
            logger.warning("LLM %s failed %s", operation, msg)
            continue

    detail = " | ".join(errors[-5:])
    raise RuntimeError(f"All models failed for {operation}: {detail}") from last_exc


def describe_chain(model_override: Optional[str] = None) -> List[Dict[str, str]]:
    """调试/验收用：返回当前链摘要（不含 key）。"""
    return [
        {
            "ref": ep.ref,
            "provider": ep.provider,
            "model_id": ep.model_id,
            "base_url": ep.base_url,
        }
        for ep in resolve_model_endpoints(model_override)
    ]
