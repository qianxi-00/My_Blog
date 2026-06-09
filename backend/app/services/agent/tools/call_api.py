"""
通用 API 调用工具
当 Skill 无法覆盖时，用于调用博客后端任意 API
"""

from __future__ import annotations

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

def normalize_path(path: str) -> str:
    """将相对路径或简写路径规范化为完整的内部 URL"""
    path = path.strip()
    if path.startswith("http://") or path.startswith("https://"):
        return path
    if not path.startswith("/"):
        path = f"/{path}"
    if path.startswith("/api/"):
        return f"http://127.0.0.1:{settings.APP_PORT}{path}"
    return f"http://127.0.0.1:{settings.APP_PORT}/api/v1{path}"


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
    url = normalize_path(path)
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
