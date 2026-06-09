"""
文章管理技能
覆盖：搜索、详情、CRUD、发布、分类/标签/归档查询
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
            "name": "search_articles",
            "description": "搜索或列出文章，支持按关键词、分类、状态筛选",
            "parameters": {
                "type": "object",
                "properties": {
                    "keyword": {"type": "string", "description": "搜索关键词（可选）"},
                    "category": {"type": "string", "description": "分类筛选（可选）"},
                    "status": {
                        "type": "string",
                        "enum": ["published", "draft"],
                        "description": "文章状态筛选（可选）",
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
            "name": "get_article_detail",
            "description": "获取指定文章的完整详情（标题、内容、状态、标签等）",
            "parameters": {
                "type": "object",
                "properties": {
                    "article_id": {"type": "integer", "description": "文章 ID"},
                },
                "required": ["article_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "manage_article",
            "description": "对文章执行管理操作：创建(create)、更新(update)、发布/取消发布(publish)、删除(delete)",
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": ["create", "update", "publish", "delete"],
                        "description": "操作类型",
                    },
                    "article_id": {"type": "integer", "description": "文章 ID（update/publish/delete 必填）"},
                    "title": {"type": "string", "description": "文章标题（create 必填，update 可选）"},
                    "content": {"type": "string", "description": "Markdown 正文（create 必填，update 可选）"},
                    "category": {"type": "string", "description": "分类"},
                    "tags": {"type": "array", "items": {"type": "string"}, "description": "标签列表"},
                    "status": {
                        "type": "string",
                        "enum": ["draft", "published"],
                        "description": "目标状态",
                    },
                },
                "required": ["action"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_categories",
            "description": "获取所有文章分类及各分类的文章数量",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_tags",
            "description": "获取所有文章标签",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_archives",
            "description": "获取文章归档数据（按年月分组）",
            "parameters": {"type": "object", "properties": {}},
        },
    },
]

# 注册技能名称集合，供 registry 使用
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
    """根据 skill 名称分派到对应处理函数"""
    handler = _HANDLERS.get(name)
    if handler is None:
        return {"ok": False, "error": f"未知文章技能: {name}"}
    return await handler(args, token, db)


# ---- 具体实现 ---------------------------------------------------- #

async def _search_articles(
    args: Dict[str, Any], token: str, db: AsyncSession,
) -> Dict[str, Any]:
    params: Dict[str, Any] = {}
    for key in ("keyword", "category", "status", "page", "page_size"):
        if key in args and args[key] is not None:
            params[key] = args[key]
    return await call_api(token, "GET", "/articles/", query_params=params)


async def _get_article_detail(
    args: Dict[str, Any], token: str, db: AsyncSession,
) -> Dict[str, Any]:
    article_id = args.get("article_id")
    if not article_id:
        return {"ok": False, "error": "缺少 article_id"}
    return await call_api(token, "GET", f"/articles/{article_id}")


async def _manage_article(
    args: Dict[str, Any], token: str, db: AsyncSession,
) -> Dict[str, Any]:
    action = args.get("action", "")
    article_id = args.get("article_id")

    if action == "create":
        body = {k: args[k] for k in ("title", "content", "category", "tags", "status") if k in args and args[k] is not None}
        return await call_api(token, "POST", "/articles/", body=body)

    if action == "update":
        if not article_id:
            return {"ok": False, "error": "update 需要 article_id"}
        body = {k: args[k] for k in ("title", "content", "category", "tags", "status") if k in args and args[k] is not None}
        return await call_api(token, "PUT", f"/articles/{article_id}", body=body)

    if action == "publish":
        if not article_id:
            return {"ok": False, "error": "publish 需要 article_id"}
        return await call_api(token, "POST", f"/articles/{article_id}/publish")

    if action == "delete":
        if not article_id:
            return {"ok": False, "error": "delete 需要 article_id"}
        return await call_api(token, "DELETE", f"/articles/{article_id}")

    return {"ok": False, "error": f"未知 action: {action}"}


async def _get_categories(
    args: Dict[str, Any], token: str, db: AsyncSession,
) -> Dict[str, Any]:
    return await call_api(token, "GET", "/articles/categories")


async def _get_tags(
    args: Dict[str, Any], token: str, db: AsyncSession,
) -> Dict[str, Any]:
    return await call_api(token, "GET", "/articles/tags")


async def _get_archives(
    args: Dict[str, Any], token: str, db: AsyncSession,
) -> Dict[str, Any]:
    return await call_api(token, "GET", "/articles/archives")


# ---- 处理函数映射表 ------------------------------------------------ #

_HANDLERS = {
    "search_articles": _search_articles,
    "get_article_detail": _get_article_detail,
    "manage_article": _manage_article,
    "get_categories": _get_categories,
    "get_tags": _get_tags,
    "get_archives": _get_archives,
}
