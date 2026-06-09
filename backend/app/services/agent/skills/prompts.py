"""
提示词管理技能（全新）
覆盖：列表、待审核列表、CRUD、审核/拒绝
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
            "name": "list_prompts",
            "description": "获取提示词列表，支持按分类筛选和分页",
            "parameters": {
                "type": "object",
                "properties": {
                    "category": {"type": "string", "description": "分类筛选（可选）：Dev/Writing/Business/Academic/Other"},
                    "status": {
                        "type": "string",
                        "enum": ["approved", "pending"],
                        "description": "状态筛选：approved=已审核(默认), pending=待审核",
                        "default": "approved",
                    },
                    "page": {"type": "integer", "description": "页码，默认 1", "default": 1},
                    "page_size": {"type": "integer", "description": "每页条数，默认 10", "default": 10},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "manage_prompt",
            "description": "对提示词执行管理操作：创建(create)、更新(update)、删除(delete)、审核通过(approve)、拒绝(reject)",
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": ["create", "update", "delete", "approve", "reject"],
                        "description": "操作类型",
                    },
                    "prompt_id": {"type": "integer", "description": "提示词 ID（update/delete/approve/reject 必填）"},
                    "title": {"type": "string", "description": "标题（create 必填）"},
                    "content": {"type": "string", "description": "提示词内容（create 必填）"},
                    "description": {"type": "string", "description": "描述（可选）"},
                    "category": {
                        "type": "string",
                        "enum": ["Dev", "Writing", "Business", "Academic", "Other"],
                        "description": "分类（可选）",
                    },
                },
                "required": ["action"],
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
        return {"ok": False, "error": f"未知提示词技能: {name}"}
    return await handler(args, token, db)


async def _list_prompts(
    args: Dict[str, Any], token: str, db: AsyncSession,
) -> Dict[str, Any]:
    status = args.get("status", "approved")
    if status == "pending":
        # 待审核列表走专用接口
        params: Dict[str, Any] = {}
        if "page" in args:
            params["page"] = args["page"]
        if "page_size" in args:
            params["page_size"] = args["page_size"]
        return await call_api(token, "GET", "/prompts/pending", query_params=params)

    # 已审核列表
    params = {}
    for key in ("category", "page", "page_size"):
        if key in args and args[key] is not None:
            params[key] = args[key]
    return await call_api(token, "GET", "/prompts/", query_params=params)


async def _manage_prompt(
    args: Dict[str, Any], token: str, db: AsyncSession,
) -> Dict[str, Any]:
    action = args.get("action", "")
    prompt_id = args.get("prompt_id")

    if action == "create":
        body: Dict[str, Any] = {}
        for key in ("title", "content", "description", "category"):
            if key in args and args[key] is not None:
                body[key] = args[key]
        return await call_api(token, "POST", "/prompts/", body=body)

    if action == "update":
        if not prompt_id:
            return {"ok": False, "error": "update 需要 prompt_id"}
        body = {}
        for key in ("title", "content", "description", "category"):
            if key in args and args[key] is not None:
                body[key] = args[key]
        return await call_api(token, "PUT", f"/prompts/{prompt_id}", body=body)

    if action == "delete":
        if not prompt_id:
            return {"ok": False, "error": "delete 需要 prompt_id"}
        return await call_api(token, "DELETE", f"/prompts/{prompt_id}")

    if action == "approve":
        if not prompt_id:
            return {"ok": False, "error": "approve 需要 prompt_id"}
        return await call_api(token, "PUT", f"/prompts/{prompt_id}/approve")

    if action == "reject":
        if not prompt_id:
            return {"ok": False, "error": "reject 需要 prompt_id"}
        return await call_api(token, "PUT", f"/prompts/{prompt_id}/reject")

    return {"ok": False, "error": f"未知 action: {action}"}


_HANDLERS = {
    "list_prompts": _list_prompts,
    "manage_prompt": _manage_prompt,
}
