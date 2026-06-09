"""
订阅者管理技能
覆盖：列表、统计、删除、冻结/解冻（单个和批量）
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
            "name": "list_subscribers",
            "description": "获取所有邮件订阅者列表及总数",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "manage_subscriber",
            "description": "管理单个订阅者：删除(delete)、冻结(freeze)、解冻(unfreeze)",
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": ["delete", "freeze", "unfreeze"],
                        "description": "操作类型",
                    },
                    "subscriber_id": {"type": "integer", "description": "订阅者 ID"},
                },
                "required": ["action", "subscriber_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "freeze_subscribers",
            "description": "批量冻结或解冻所有订阅者",
            "parameters": {
                "type": "object",
                "properties": {
                    "frozen": {
                        "type": "boolean",
                        "description": "true=冻结所有, false=解冻所有",
                    },
                },
                "required": ["frozen"],
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
        return {"ok": False, "error": f"未知订阅者技能: {name}"}
    return await handler(args, token, db)


async def _list_subscribers(
    args: Dict[str, Any], token: str, db: AsyncSession,
) -> Dict[str, Any]:
    subs = await call_api(token, "GET", "/subscribers")
    count = await call_api(token, "GET", "/subscribers/count")
    return {
        "ok": subs.get("ok", False) and count.get("ok", False),
        "total": count.get("data"),
        "subscribers": subs.get("data"),
    }


async def _manage_subscriber(
    args: Dict[str, Any], token: str, db: AsyncSession,
) -> Dict[str, Any]:
    action = args.get("action", "")
    subscriber_id = args.get("subscriber_id")
    if not subscriber_id:
        return {"ok": False, "error": "缺少 subscriber_id"}

    if action == "delete":
        return await call_api(token, "DELETE", f"/subscribers/{subscriber_id}")
    if action == "freeze":
        return await call_api(
            token, "PUT", f"/subscribers/{subscriber_id}/freeze",
            query_params={"frozen": True},
        )
    if action == "unfreeze":
        return await call_api(
            token, "PUT", f"/subscribers/{subscriber_id}/freeze",
            query_params={"frozen": False},
        )

    return {"ok": False, "error": f"未知 action: {action}"}


async def _freeze_subscribers(
    args: Dict[str, Any], token: str, db: AsyncSession,
) -> Dict[str, Any]:
    frozen = args.get("frozen", True)
    return await call_api(
        token, "PUT", "/subscribers/freeze-all",
        query_params={"frozen": frozen},
    )


_HANDLERS = {
    "list_subscribers": _list_subscribers,
    "manage_subscriber": _manage_subscriber,
    "freeze_subscribers": _freeze_subscribers,
}
