"""
论坛管理技能
覆盖：版块列表、主题列表/详情、回帖列表、管理操作（置顶/锁帖/改名/删帖）

边界说明：只提供**管理**能力。建主题、发回帖是访客自助行为
（POST /forum/threads 与 /posts 需要昵称/邮箱且带蜜罐反机器人），
不作为 AI 的工具暴露——AI 不该替访客发帖。
"""

from __future__ import annotations

from typing import Any, Dict, List

from sqlalchemy.ext.asyncio import AsyncSession

from ..tools.call_api import call_api


SKILL_SCHEMAS: List[Dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "get_forum_categories",
            "description": "获取论坛版块列表（含各版块主题数）。发主题前要先拿到 category_id",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_forum_threads",
            "description": "获取论坛主题列表，支持按版块筛选和标题关键词搜索",
            "parameters": {
                "type": "object",
                "properties": {
                    "keyword": {"type": "string", "description": "标题关键词（可选）"},
                    "category_id": {"type": "integer", "description": "版块 ID（可选）"},
                    "page": {"type": "integer", "description": "页码，默认 1", "default": 1},
                    "page_size": {"type": "integer", "description": "每页条数，默认 10", "default": 10},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_forum_thread",
            "description": "获取单个论坛主题的详情（含置顶/锁帖状态、回复数、首帖内容）",
            "parameters": {
                "type": "object",
                "properties": {
                    "thread_id": {"type": "integer", "description": "主题 ID"},
                },
                "required": ["thread_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_forum_posts",
            "description": "获取某个主题下的所有回帖（分页），用于查看讨论内容、找违规楼层",
            "parameters": {
                "type": "object",
                "properties": {
                    "thread_id": {"type": "integer", "description": "主题 ID"},
                    "page": {"type": "integer", "description": "页码，默认 1", "default": 1},
                    "page_size": {"type": "integer", "description": "每页条数，默认 20", "default": 20},
                },
                "required": ["thread_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "manage_forum_thread",
            "description": (
                "管理论坛主题：改名(update_title)、移动版块(move)、置顶(pin)、取消置顶(unpin)、"
                "锁帖(lock)、解锁(unlock)、删除(delete)"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": ["update_title", "move", "pin", "unpin", "lock", "unlock", "delete"],
                        "description": "操作类型",
                    },
                    "thread_id": {"type": "integer", "description": "主题 ID"},
                    "title": {"type": "string", "description": "新标题（update_title 必填）"},
                    "category_id": {"type": "integer", "description": "目标版块 ID（move 必填）"},
                },
                "required": ["action", "thread_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "manage_forum_post",
            "description": "管理论坛回帖：编辑内容(update)、删除(delete)。删之前建议先 list_forum_posts 确认内容",
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": ["update", "delete"],
                        "description": "操作类型",
                    },
                    "post_id": {"type": "integer", "description": "回帖 ID"},
                    "content": {"type": "string", "description": "新的回帖内容（update 必填，Markdown）"},
                },
                "required": ["action", "post_id"],
            },
        },
    },
]


# ------------------------------------------------------------------ #
#  处理函数
# ------------------------------------------------------------------ #

async def _get_categories(
    args: Dict[str, Any], token: str, db: AsyncSession,
) -> Dict[str, Any]:
    return await call_api(token, "GET", "/forum/categories")


async def _list_threads(
    args: Dict[str, Any], token: str, db: AsyncSession,
) -> Dict[str, Any]:
    params: Dict[str, Any] = {}
    for src, dst in (("keyword", "q"), ("category_id", "category_id"),
                     ("page", "page"), ("page_size", "page_size")):
        if args.get(src) is not None:
            params[dst] = args[src]
    return await call_api(token, "GET", "/forum/threads", query_params=params)


async def _get_thread(
    args: Dict[str, Any], token: str, db: AsyncSession,
) -> Dict[str, Any]:
    thread_id = args.get("thread_id")
    if not thread_id:
        return {"ok": False, "error": "thread_id 必填"}
    return await call_api(token, "GET", f"/forum/threads/{thread_id}")


async def _list_posts(
    args: Dict[str, Any], token: str, db: AsyncSession,
) -> Dict[str, Any]:
    thread_id = args.get("thread_id")
    if not thread_id:
        return {"ok": False, "error": "thread_id 必填"}
    params = {k: args[k] for k in ("page", "page_size") if args.get(k) is not None}
    return await call_api(token, "GET", f"/forum/threads/{thread_id}/posts", query_params=params)


async def _manage_thread(
    args: Dict[str, Any], token: str, db: AsyncSession,
) -> Dict[str, Any]:
    action = args.get("action")
    thread_id = args.get("thread_id")
    if not thread_id:
        return {"ok": False, "error": "thread_id 必填"}

    # 置顶/锁帖/改标题/移动版块都走同一个 PUT（ForumThreadAdminUpdateRequest）
    body: Dict[str, Any] = {}
    if action == "update_title":
        if not args.get("title"):
            return {"ok": False, "error": "update_title 需要 title"}
        body["title"] = args["title"]
    elif action == "move":
        if not args.get("category_id"):
            return {"ok": False, "error": "move 需要 category_id"}
        body["category_id"] = args["category_id"]
    elif action in ("pin", "unpin"):
        body["is_pinned"] = action == "pin"
    elif action in ("lock", "unlock"):
        body["is_locked"] = action == "lock"
    elif action == "delete":
        return await call_api(token, "DELETE", f"/forum/threads/{thread_id}")
    else:
        return {"ok": False, "error": f"未知 action: {action}"}

    return await call_api(token, "PUT", f"/forum/threads/{thread_id}", body=body)


async def _manage_post(
    args: Dict[str, Any], token: str, db: AsyncSession,
) -> Dict[str, Any]:
    action = args.get("action")
    post_id = args.get("post_id")
    if not post_id:
        return {"ok": False, "error": "post_id 必填"}

    if action == "update":
        content = args.get("content")
        if not content:
            return {"ok": False, "error": "update 需要 content"}
        return await call_api(
            token, "PUT", f"/forum/posts/{post_id}", body={"content": content}
        )
    if action == "delete":
        return await call_api(token, "DELETE", f"/forum/posts/{post_id}")
    return {"ok": False, "error": f"未知 action: {action}"}


_HANDLERS = {
    "get_forum_categories": _get_categories,
    "list_forum_threads": _list_threads,
    "get_forum_thread": _get_thread,
    "list_forum_posts": _list_posts,
    "manage_forum_thread": _manage_thread,
    "manage_forum_post": _manage_post,
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
        return {"ok": False, "error": f"未实现的论坛技能: {name}"}
    return await handler(args, token, db)
