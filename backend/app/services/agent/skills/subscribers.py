"""
订阅者管理技能
覆盖：列表、统计、删除、冻结/解冻（单个和批量）
"""

from __future__ import annotations

from datetime import datetime, timedelta
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
            "name": "get_subscriber_stats",
            "description": "只取订阅者总数（不拉列表）。「现在多少订阅者」这种问题用这个，比 list_subscribers 轻",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "find_inactive_subscribers",
            "description": (
                "找出「长期没互动」的订阅者：注册至今从未确认过邮箱，或已被冻结。"
                "⚠️ 后端 /subscribers 不支持分页与筛选，所以这个技能是**先拉全量再在本地按条件过滤**，"
                "只返回 ID、邮箱、注册时间等必要字段。结果仅供判断，清理前请先向用户确认"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "older_than_days": {
                        "type": "integer",
                        "description": "注册时间早于多少天，缺省 90",
                        "default": 90,
                    },
                    "only_frozen": {
                        "type": "boolean",
                        "description": "只看已冻结的，缺省 false",
                        "default": False,
                    },
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "freeze_subscribers",
            "description": (
                "批量冻结或解冻**所有**订阅者。⚠️ 这是全表操作，没有筛选条件——"
                "只想冻结一部分的话，请用 find_inactive_subscribers 找出 ID，"
                "再用 manage_subscriber 逐个处理"
            ),
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


async def _get_subscriber_stats(
    args: Dict[str, Any], token: str, db: AsyncSession,
) -> Dict[str, Any]:
    return await call_api(token, "GET", "/subscribers/count")


async def _find_inactive(
    args: Dict[str, Any], token: str, db: AsyncSession,
) -> Dict[str, Any]:
    """后端 /subscribers 无筛选，只能拉全量在本地过滤。

    注意：技能只是**帮用户看清楚**，不做任何删除/冻结；清理要靠 manage_subscriber 逐个来，
    并先向用户确认。
    """
    resp = await call_api(token, "GET", "/subscribers")
    if not resp.get("ok", False):
        return resp
    items = resp.get("data") or []

    days = int(args.get("older_than_days") or 90)
    only_frozen = bool(args.get("only_frozen"))
    cutoff = datetime.now() - timedelta(days=days)

    hits = []
    for item in items:
        if only_frozen and not item.get("is_frozen"):
            continue
        raw = item.get("subscribed_at")
        if not raw:
            continue
        try:
            joined = datetime.fromisoformat(str(raw).replace("Z", "+00:00")).replace(tzinfo=None)
        except ValueError:
            continue
        # 「不活跃」= 注册已久，且（已冻结 或 从未退订过）
        if joined < cutoff and (item.get("is_frozen") or not item.get("unsubscribed_at")):
            hits.append({
                "id": item.get("id"),
                "email": item.get("email"),
                "subscribed_at": str(raw)[:10],
                "is_frozen": item.get("is_frozen"),
                "unsubscribed_at": str(item.get("unsubscribed_at"))[:10] if item.get("unsubscribed_at") else None,
            })

    return {
        "ok": True,
        "条件": f"注册超过 {days} 天" + ("且已冻结" if only_frozen else ""),
        "命中数": len(hits),
        "subscribers": hits,
        "提示": "这是只读结果。清理请用 manage_subscriber 逐个处理，删除前先向用户确认。",
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
    "get_subscriber_stats": _get_subscriber_stats,
    "find_inactive_subscribers": _find_inactive,
    "manage_subscriber": _manage_subscriber,
    "freeze_subscribers": _freeze_subscribers,
}
