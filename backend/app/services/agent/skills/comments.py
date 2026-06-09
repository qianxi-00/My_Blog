"""
评论管理技能
覆盖：待审核列表、审核/拒绝/删除、管理员回复、举报评论管理
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
            "name": "list_pending_comments",
            "description": "获取所有待审核的评论列表",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "manage_comment",
            "description": "对评论执行管理操作：审核通过(approve)、拒绝(reject)、删除(delete)",
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": ["approve", "reject", "delete"],
                        "description": "操作类型",
                    },
                    "comment_id": {"type": "integer", "description": "评论 ID"},
                },
                "required": ["action", "comment_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_reported_comments",
            "description": "获取所有被举报的评论列表",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "reply_comment",
            "description": "以管理员身份回复一条评论",
            "parameters": {
                "type": "object",
                "properties": {
                    "comment_id": {"type": "integer", "description": "要回复的评论 ID"},
                    "content": {"type": "string", "description": "回复内容"},
                },
                "required": ["comment_id", "content"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "manage_report",
            "description": "处理评论举报：驳回举报(dismiss)或确认举报并删除评论(confirm)",
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": ["dismiss", "confirm"],
                        "description": "dismiss=驳回举报(保留评论), confirm=确认举报(删除评论)",
                    },
                    "comment_id": {"type": "integer", "description": "被举报的评论 ID"},
                },
                "required": ["action", "comment_id"],
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
        return {"ok": False, "error": f"未知评论技能: {name}"}
    return await handler(args, token, db)


async def _list_pending_comments(
    args: Dict[str, Any], token: str, db: AsyncSession,
) -> Dict[str, Any]:
    return await call_api(token, "GET", "/comments/pending")


async def _manage_comment(
    args: Dict[str, Any], token: str, db: AsyncSession,
) -> Dict[str, Any]:
    action = args.get("action", "")
    comment_id = args.get("comment_id")
    if not comment_id:
        return {"ok": False, "error": "缺少 comment_id"}

    if action == "approve":
        return await call_api(token, "PUT", f"/comments/{comment_id}/approve")
    if action == "reject":
        return await call_api(token, "PUT", f"/comments/{comment_id}/reject")
    if action == "delete":
        return await call_api(token, "DELETE", f"/comments/{comment_id}")

    return {"ok": False, "error": f"未知 action: {action}"}


async def _list_reported_comments(
    args: Dict[str, Any], token: str, db: AsyncSession,
) -> Dict[str, Any]:
    return await call_api(token, "GET", "/comments/reported")


async def _reply_comment(
    args: Dict[str, Any], token: str, db: AsyncSession,
) -> Dict[str, Any]:
    comment_id = args.get("comment_id")
    content = args.get("content")
    if not comment_id:
        return {"ok": False, "error": "缺少 comment_id"}
    if not content:
        return {"ok": False, "error": "缺少 content"}
    return await call_api(
        token, "POST", f"/comments/{comment_id}/reply",
        body={"content": content},
    )


async def _manage_report(
    args: Dict[str, Any], token: str, db: AsyncSession,
) -> Dict[str, Any]:
    action = args.get("action", "")
    comment_id = args.get("comment_id")
    if not comment_id:
        return {"ok": False, "error": "缺少 comment_id"}

    if action == "dismiss":
        return await call_api(token, "PUT", f"/comments/{comment_id}/dismiss-report")
    if action == "confirm":
        return await call_api(token, "PUT", f"/comments/{comment_id}/confirm-report")

    return {"ok": False, "error": f"未知 action: {action}"}


_HANDLERS = {
    "list_pending_comments": _list_pending_comments,
    "manage_comment": _manage_comment,
    "list_reported_comments": _list_reported_comments,
    "reply_comment": _reply_comment,
    "manage_report": _manage_report,
}
