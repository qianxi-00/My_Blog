"""
通用 API 调用工具
当 Skill 无法覆盖时，用于调用博客后端任意 API
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

import httpx

from app.core.config import settings


# ------------------------------------------------------------------ #
#  Tool Schema（OpenAI function-calling 定义）
# ------------------------------------------------------------------ #

TOOL_SCHEMAS: List[Dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "call_api",
            "description": "【通用兜底】调用博客后端任意 API，当 Skill 无法覆盖时使用",
            "parameters": {
                "type": "object",
                "properties": {
                    "method": {
                        "type": "string",
                        "enum": ["GET", "POST", "PUT", "DELETE"],
                        "description": "HTTP 方法",
                    },
                    "path": {
                        "type": "string",
                        "description": "API 路径，支持 /api/v1/... 或 /...",
                    },
                    "body": {
                        "type": "object",
                        "description": "请求 JSON body（可选）",
                    },
                    "query_params": {
                        "type": "object",
                        "description": "查询参数（可选）",
                    },
                },
                "required": ["method", "path"],
            },
        },
    },
]


# ------------------------------------------------------------------ #
#  路径规范化
# ------------------------------------------------------------------ #

def internal_base() -> str:
    """Agent 在**容器内**调本机 API 的基地址。

    踩过的坑（2026-09-30）：这里原来用 `settings.APP_PORT`（默认 8000），
    但容器里 uvicorn 实际监听的是 `--port 7860`（8000 是宿主机映射进来的端口），
    于是 call_api 的每一次请求都是 Connection refused —— 后台 AI 助手的所有 skill
    全部静默失败，只表现为工具返回 500。宿主机上 curl 8000 通、容器内 7860 通，
    两条路都"看起来正常"，所以之前一直没发现。

    SERVER_PORT 可以在 runtime.env / docker run -e 里覆盖，默认与 Dockerfile、
    生产与演练的启动参数一致（7860）。
    """
    return f"http://127.0.0.1:{settings.SERVER_PORT}"


def normalize_path(path: str) -> str:
    """将相对路径或简写路径规范化为完整的内部 URL（只允许站内相对路径）

    尾斜杠也要处理：skill 里大量写成 "/articles/"、"/comments/"，而路由注册的是
    "/articles"（无尾斜杠），带尾斜杠会直接 404（Starlette 不会为 router prefix
    下的路径自动重定向），2026-09-30 实测过。
    """
    path = path.strip()
    if path.startswith(("http://", "https://", "//")):
        raise ValueError("call_api 只允许站内相对路径（如 /api/v1/articles），不接受绝对 URL")
    if not path.startswith("/"):
        path = f"/{path}"
    # 去掉尾斜杠（根路径除外），并折叠重复斜杠
    path = re.sub(r"/{2,}", "/", path)
    if len(path) > 1 and path.endswith("/"):
        path = path.rstrip("/")
    if path.startswith("/api/"):
        return f"{internal_base()}{path}"
    return f"{internal_base()}/api/v1{path}"


# ------------------------------------------------------------------ #
#  执行器
# ------------------------------------------------------------------ #

async def execute(
    args: Dict[str, Any],
    token: str,
    **_kwargs: Any,
) -> Dict[str, Any]:
    """执行通用 API 调用"""
    method = args.get("method", "GET")
    path = args.get("path", "/")
    body = args.get("body")
    query_params = args.get("query_params")

    return await call_api(token, method, path, body, query_params)


async def call_api(
    token: str,
    method: str,
    path: str,
    body: Optional[Dict[str, Any]] = None,
    query_params: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    实际的 HTTP 调用逻辑
    NOTE: 此函数同时被 Skill 层内部复用（Skill 通过调用此函数实现对 API 的封装）
    """
    try:
        url = normalize_path(path)
    except ValueError as exc:
        return {
            "ok": False,
            "status_code": 400,
            "url": path,
            "method": method.upper(),
            "error": str(exc),
        }

    headers: Dict[str, str] = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.request(
                method=method.upper(),
                url=url,
                headers=headers,
                params=query_params,
                json=body,
            )

        payload: Any
        try:
            payload = response.json()
        except Exception:
            payload = response.text

        return {
            "ok": response.is_success,
            "status_code": response.status_code,
            "url": url,
            "method": method.upper(),
            "data": payload,
        }
    except Exception as exc:
        return {
            "ok": False,
            "status_code": 500,
            "url": url,
            "method": method.upper(),
            "error": str(exc),
        }
