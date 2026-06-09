"""
站点配置管理技能（全新）
覆盖：获取所有配置、获取公开配置、更新单个配置、批量更新配置
"""

from __future__ import annotations

from typing import Any, Dict, List

from sqlalchemy.ext.asyncio import AsyncSession

from ..tools.call_api import call_api


# ------------------------------------------------------------------ #
#  Skill Schema
# ------------------------------------------------------------------ #

SKILL_SCHEMAS: List[Dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "get_settings",
            "description": "获取站点配置。scope=all 获取全部配置（需超管权限），scope=public 获取公开配置",
            "parameters": {
                "type": "object",
                "properties": {
                    "scope": {
                        "type": "string",
                        "enum": ["all", "public"],
                        "description": "范围：all=全部配置, public=公开配置",
                        "default": "all",
                    },
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "update_settings",
            "description": "更新站点配置。支持单个更新或批量更新（需超管权限）",
            "parameters": {
                "type": "object",
                "properties": {
                    "key": {"type": "string", "description": "配置项 key（单个更新时使用）"},
                    "value": {"type": "string", "description": "配置项 value（单个更新时使用）"},
                    "batch": {
                        "type": "object",
                        "description": "批量更新的 key-value 对象（与 key/value 二选一）",
                    },
                },
            },
        },
    },
]

SKILL_NAMES = frozenset(s["function"]["name"] for s in SKILL_SCHEMAS)


# ------------------------------------------------------------------ #
#  执行器
# ------------------------------------------------------------------ #

async def execute(
    name: str,
    args: Dict[str, Any],
    token: str,
    db: AsyncSession,
) -> Dict[str, Any]:
    handler = _HANDLERS.get(name)
    if handler is None:
        return {"ok": False, "error": f"未知配置技能: {name}"}
    return await handler(args, token, db)


async def _get_settings(
    args: Dict[str, Any], token: str, db: AsyncSession,
) -> Dict[str, Any]:
    scope = args.get("scope", "all")
    if scope == "public":
        return await call_api(token, "GET", "/settings/public")
    return await call_api(token, "GET", "/settings/")


async def _update_settings(
    args: Dict[str, Any], token: str, db: AsyncSession,
) -> Dict[str, Any]:
    batch = args.get("batch")
    if batch:
        # 批量更新
        return await call_api(token, "PUT", "/settings/batch", body=batch)

    # 单个更新
    key = args.get("key")
    value = args.get("value")
    if not key:
        return {"ok": False, "error": "缺少 key 参数（或使用 batch 进行批量更新）"}
    return await call_api(token, "PUT", f"/settings/{key}", body={"value": value or ""})


_HANDLERS = {
    "get_settings": _get_settings,
    "update_settings": _update_settings,
}
