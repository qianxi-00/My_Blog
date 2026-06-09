"""
管理员运维技能（全新）
覆盖：管理员列表、创建/更新/删除管理员、密码重置
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
            "name": "list_admins",
            "description": "获取所有管理员列表（需超管权限）",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "manage_admin",
            "description": "管理员账号操作：创建(create)、更新(update)、删除(delete)、重置密码(reset_password)",
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": ["create", "update", "delete", "reset_password"],
                        "description": "操作类型",
                    },
                    "admin_id": {"type": "integer", "description": "管理员 ID（update/delete/reset_password 必填）"},
                    "username": {"type": "string", "description": "用户名（create 必填）"},
                    "password": {"type": "string", "description": "密码（create/reset_password 必填）"},
                    "email": {"type": "string", "description": "邮箱（可选）"},
                    "display_name": {"type": "string", "description": "显示名称（可选）"},
                    "role": {
                        "type": "string",
                        "enum": ["admin", "super_admin"],
                        "description": "角色（可选）",
                    },
                    "is_active": {"type": "boolean", "description": "是否启用（update 时可选）"},
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
        return {"ok": False, "error": f"未知管理员技能: {name}"}
    return await handler(args, token, db)


async def _list_admins(
    args: Dict[str, Any], token: str, db: AsyncSession,
) -> Dict[str, Any]:
    return await call_api(token, "GET", "/admins/")


async def _manage_admin(
    args: Dict[str, Any], token: str, db: AsyncSession,
) -> Dict[str, Any]:
    action = args.get("action", "")
    admin_id = args.get("admin_id")

    if action == "create":
        body: Dict[str, Any] = {}
        for key in ("username", "password", "email", "display_name", "role"):
            if key in args and args[key] is not None:
                body[key] = args[key]
        return await call_api(token, "POST", "/admins/", body=body)

    if action == "update":
        if not admin_id:
            return {"ok": False, "error": "update 需要 admin_id"}
        body = {}
        for key in ("email", "display_name", "role", "is_active"):
            if key in args and args[key] is not None:
                body[key] = args[key]
        return await call_api(token, "PUT", f"/admins/{admin_id}", body=body)

    if action == "delete":
        if not admin_id:
            return {"ok": False, "error": "delete 需要 admin_id"}
        return await call_api(token, "DELETE", f"/admins/{admin_id}")

    if action == "reset_password":
        if not admin_id:
            return {"ok": False, "error": "reset_password 需要 admin_id"}
        password = args.get("password")
        if not password:
            return {"ok": False, "error": "reset_password 需要 password"}
        return await call_api(
            token, "PUT", f"/admins/{admin_id}/password",
            body={"new_password": password},
        )

    return {"ok": False, "error": f"未知 action: {action}"}


_HANDLERS = {
    "list_admins": _list_admins,
    "manage_admin": _manage_admin,
}
