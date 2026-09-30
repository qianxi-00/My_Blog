"""
用户管理技能
覆盖：用户统计、列表/搜索、详情、封禁/解封、重置密码、改角色

为什么单独立：用户系统二/三期做了一整套完整的后台管理（列表筛选、封禁、
重置密码、改角色、删用户），但 skills/admins.py 只覆盖了**管理员账号** CRUD，
注册用户这块 AI 只能靠 call_api 盲猜 /admins/users/* 路径。
"""

from __future__ import annotations

from typing import Any, Dict, List

from sqlalchemy.ext.asyncio import AsyncSession

from ..tools.call_api import call_api


SKILL_SCHEMAS: List[Dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "get_user_stats",
            "description": "获取用户总览卡片：用户总数、普通用户/管理员数、被封禁数、今日新增、待审文章数",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_users",
            "description": (
                "列出/搜索注册用户，支持按用户名、昵称、邮箱搜索，按角色/状态筛选，"
                "按注册时间/最后登录/文章数排序。返回带每人的文章数与评论数"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "keyword": {"type": "string", "description": "用户名/昵称/邮箱关键词（可选）"},
                    "status": {
                        "type": "string",
                        "enum": ["active", "banned"],
                        "description": "账号状态筛选（可选）",
                    },
                    "role": {
                        "type": "string",
                        "enum": ["user", "admin", "super_admin"],
                        "description": "角色筛选（可选）",
                    },
                    "sort": {
                        "type": "string",
                        "enum": ["created_at", "last_login_at", "article_count"],
                        "description": "排序字段，默认 created_at",
                    },
                    "order": {"type": "string", "enum": ["asc", "desc"], "description": "排序方向"},
                    "page": {"type": "integer", "description": "页码，默认 1", "default": 1},
                    "page_size": {"type": "integer", "description": "每页条数，默认 10", "default": 10},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_user_detail",
            "description": "获取单个用户的完整档案：资料、邮箱认证状态、最后登录、文章/评论统计、最近文章与最近评论",
            "parameters": {
                "type": "object",
                "properties": {
                    "user_id": {"type": "integer", "description": "用户 ID"},
                },
                "required": ["user_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "manage_user",
            "description": (
                "管理注册用户：封禁(ban)、解封(unban)、重置密码(reset_password)、"
                "改角色(set_role)、换邮箱(set_email)、删除(delete)。"
                "⚠️ set_role / set_email 只有超级管理员能用；"
                "delete 不可逆，且该用户有文章时后端会返回 409 并告知文章数量，"
                "必须先把数量告诉用户并获得确认"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": ["ban", "unban", "reset_password", "set_role", "set_email", "delete"],
                        "description": "操作类型",
                    },
                    "user_id": {"type": "integer", "description": "用户 ID"},
                    "role": {
                        "type": "string",
                        "enum": ["user", "admin"],
                        "description": "目标角色（set_role 必填；不能设为 super_admin）",
                    },
                    "email": {
                        "type": "string",
                        "description": "新邮箱（set_email 必填；传空字符串解除绑定）",
                    },
                },
                "required": ["action", "user_id"],
            },
        },
    },
]


# ------------------------------------------------------------------ #
#  处理函数
# ------------------------------------------------------------------ #

async def _get_stats(
    args: Dict[str, Any], token: str, db: AsyncSession,
) -> Dict[str, Any]:
    return await call_api(token, "GET", "/admins/users/stats")


async def _list_users(
    args: Dict[str, Any], token: str, db: AsyncSession,
) -> Dict[str, Any]:
    params: Dict[str, Any] = {}
    for key in ("keyword", "status", "role", "sort", "order", "page", "page_size"):
        if args.get(key) is not None:
            params["search" if key == "keyword" else key] = args[key]
    return await call_api(token, "GET", "/admins/users", query_params=params)


async def _get_detail(
    args: Dict[str, Any], token: str, db: AsyncSession,
) -> Dict[str, Any]:
    user_id = args.get("user_id")
    if not user_id:
        return {"ok": False, "error": "user_id 必填"}
    return await call_api(token, "GET", f"/admins/users/{user_id}")


async def _manage_user(
    args: Dict[str, Any], token: str, db: AsyncSession,
) -> Dict[str, Any]:
    action = args.get("action")
    user_id = args.get("user_id")
    if not user_id:
        return {"ok": False, "error": "user_id 必填"}

    if action in ("ban", "unban"):
        return await call_api(token, "PUT", f"/admins/users/{user_id}/{action}")

    if action == "reset_password":
        # 临时密码只在这一次响应里返回，必须原样转告用户，不要吞掉
        return await call_api(token, "PUT", f"/admins/users/{user_id}/password")

    if action == "set_role":
        role = args.get("role")
        if not role:
            return {"ok": False, "error": "set_role 需要 role（可选 user 或 admin）"}
        return await call_api(token, "PUT", f"/admins/users/{user_id}/role", body={"role": role})

    if action == "set_email":
        email = args.get("email")
        if email is None:
            return {"ok": False, "error": "set_email 需要 email（解除绑定请传空字符串）"}
        return await call_api(
            token, "PUT", f"/admins/users/{user_id}/email", body={"email": email}
        )

    if action == "delete":
        return await call_api(token, "DELETE", f"/admins/users/{user_id}")

    return {"ok": False, "error": f"未知 action: {action}"}


_HANDLERS = {
    "get_user_stats": _get_stats,
    "list_users": _list_users,
    "get_user_detail": _get_detail,
    "manage_user": _manage_user,
}

SKILL_NAMES = frozenset(_HANDLERS.keys())


async def execute(
    name: str,
    args: Dict[str, Any],
    token: str,
    db: AsyncSession,
) -> Dict[str, Any]:
    handler = _HANDLERS.get(name)
    if handler is None:
        return {"ok": False, "error": f"未实现的用户技能: {name}"}
    return await handler(args, token, db)
