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
            "description": "搜索或列出文章，支持按关键词、分类、标签、状态筛选和排序",
            "parameters": {
                "type": "object",
                "properties": {
                    "keyword": {"type": "string", "description": "标题/正文关键词（可选，留空则返回全部）"},
                    "category": {"type": "string", "description": "分类筛选（可选）"},
                    "tag": {"type": "string", "description": "标签筛选（可选）"},
                    "status": {
                        "type": "string",
                        "enum": ["published", "draft", "pending", "rejected"],
                        "description": "文章状态筛选（可选）",
                    },
                    "sort_by": {
                        "type": "string",
                        "enum": ["time", "views", "likes"],
                        "description": "排序字段，默认按时间",
                    },
                    "sort_order": {"type": "string", "enum": ["asc", "desc"], "description": "排序方向"},
                    "page": {"type": "integer", "description": "页码，默认 1", "default": 1},
                    "page_size": {"type": "integer", "description": "每页条数，默认 10", "default": 10},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_pending_articles",
            "description": "获取待审核的文章投稿列表（用户投稿的文章要先审才能发布）",
            "parameters": {
                "type": "object",
                "properties": {
                    "page": {"type": "integer", "description": "页码，默认 1", "default": 1},
                    "page_size": {"type": "integer", "description": "每页条数，默认 10", "default": 10},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "review_article",
            "description": "审核用户投稿的文章：通过(approve) 或驳回(reject，驳回必须给原因)",
            "parameters": {
                "type": "object",
                "properties": {
                    "article_id": {"type": "integer", "description": "文章 ID"},
                    "action": {
                        "type": "string",
                        "enum": ["approve", "reject"],
                        "description": "审核动作",
                    },
                    "review_note": {"type": "string", "description": "审核备注，驳回时必填（会告知作者）"},
                },
                "required": ["article_id", "action"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "generate_article_summary",
            "description": "用大模型为一段 Markdown 正文生成摘要（约 70 字，无 Markdown 语法）",
            "parameters": {
                "type": "object",
                "properties": {
                    "content_md": {"type": "string", "description": "Markdown 正文"},
                },
                "required": ["content_md"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "fix_article_read_time",
            "description": "全站重算所有文章的阅读时长（导入/批量改动后估算失准时用；不需要参数）",
            "parameters": {"type": "object", "properties": {}},
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
            "description": (
                "对文章执行管理操作：创建(create)、更新(update)、发布(publish，支持定时)、"
                "下架(unpublish，退回草稿)、置顶(pin)、取消置顶(unpin)、删除(delete)"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": ["create", "update", "publish", "unpublish", "pin", "unpin", "delete"],
                        "description": "操作类型",
                    },
                    "article_id": {"type": "integer", "description": "文章 ID（update/publish/unpublish/pin/unpin/delete 必填）"},
                    "title": {"type": "string", "description": "文章标题（create 必填，update 可选）"},
                    "content_md": {
                        "type": "string",
                        "description": "Markdown 正文。**字段名就是 content_md**，不是 content"
                        "（create 必填，update 可选；只改标题/标签时不用传）",
                    },
                    "summary": {"type": "string", "description": "文章摘要（可选）"},
                    "cover_image": {"type": "string", "description": "封面图 URL（可选）"},
                    "category": {"type": "string", "description": "分类"},
                    "tags": {"type": "array", "items": {"type": "string"}, "description": "标签列表"},
                    "status": {
                        "type": "string",
                        "enum": ["draft", "published"],
                        "description": "目标状态",
                    },
                    "is_pinned": {"type": "boolean", "description": "是否置顶（也可用 pin/unpin 动作）"},
                    "scheduled_at": {
                        "type": "string",
                        "description": "定时发布时间 ISO 格式，配合 publish 使用",
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
    # 参数名必须跟 GET /articles 的实际签名对齐：后端叫 `search`，
    # 这里原来传 `keyword`，FastAPI 会当成未知 query 静默忽略 —— 表现为
    # "带关键词搜索"和"不带关键词"返回全量，AI 一直以为自己在搜索。
    params: Dict[str, Any] = {}
    for src, dst in (
        ("keyword", "search"),      # 对外仍叫 keyword（模型好理解），落到后端叫 search
        ("category", "category"),
        ("tag", "tag"),
        ("status", "status"),
        ("sort_by", "sort_by"),
        ("sort_order", "sort_order"),
        ("page", "page"),
        ("page_size", "page_size"),
    ):
        if args.get(src) is not None:
            params[dst] = args[src]
    return await call_api(token, "GET", "/articles/", query_params=params)


async def _list_pending_reviews(
    args: Dict[str, Any], token: str, db: AsyncSession,
) -> Dict[str, Any]:
    return await call_api(
        token, "GET", "/articles/review/pending",
        query_params={k: args[k] for k in ("page", "page_size") if args.get(k) is not None},
    )


async def _review_article(
    args: Dict[str, Any], token: str, db: AsyncSession,
) -> Dict[str, Any]:
    article_id = args.get("article_id")
    action = args.get("action")
    if not article_id:
        return {"ok": False, "error": "review 需要 article_id"}
    if action not in ("approve", "reject"):
        return {"ok": False, "error": "action 只能是 approve 或 reject"}
    body: Dict[str, Any] = {"action": action}
    note = args.get("review_note")
    if action == "reject" and not note:
        return {"ok": False, "error": "驳回必须给出 review_note（驳回原因）"}
    if note:
        body["review_note"] = note
    return await call_api(token, "PUT", f"/articles/{article_id}/review", body=body)


async def _generate_summary(
    args: Dict[str, Any], token: str, db: AsyncSession,
) -> Dict[str, Any]:
    content_md = args.get("content_md")
    if not content_md:
        return {"ok": False, "error": "generate_summary 需要 content_md"}
    return await call_api(
        token, "POST", "/articles/generate-summary", body={"content_md": content_md}
    )


async def _fix_read_time(
    args: Dict[str, Any], token: str, db: AsyncSession,
) -> Dict[str, Any]:
    return await call_api(token, "POST", "/articles/fix-read-time")


async def _get_article_detail(
    args: Dict[str, Any], token: str, db: AsyncSession,
) -> Dict[str, Any]:
    article_id = args.get("article_id")
    if not article_id:
        return {"ok": False, "error": "缺少 article_id"}
    return await call_api(token, "GET", f"/articles/{article_id}")


# 建文/改文的 body 白名单。
# ⚠️ 正文字段是 content_md 不是 content：原来这里写的是 content，ArticleCreate
# 根本不认（必填 content_md）→ 建文必 422；ArticleUpdate 认得但 Pydantic 会把
# 未知字段静默丢掉 → 改文时"改了正文"其实没改。2026-09-30 实测才发现。
_BODY_FIELDS = (
    "title", "content_md", "summary", "cover_image", "category", "tags",
    "status", "is_pinned", "scheduled_at", "slug",
)


async def _manage_article(
    args: Dict[str, Any], token: str, db: AsyncSession,
) -> Dict[str, Any]:
    action = args.get("action", "")
    article_id = args.get("article_id")

    if action == "create":
        body = {k: args[k] for k in _BODY_FIELDS if args.get(k) is not None}
        if not body.get("title"):
            return {"ok": False, "error": "create 需要 title"}
        if not body.get("content_md"):
            return {"ok": False, "error": "create 需要 content_md（Markdown 正文）"}
        return await call_api(token, "POST", "/articles/", body=body)

    if action == "update":
        if not article_id:
            return {"ok": False, "error": "update 需要 article_id"}
        body = {k: args[k] for k in _BODY_FIELDS if args.get(k) is not None}
        if not body:
            return {"ok": False, "error": "update 至少要传一个要改的字段"}
        return await call_api(token, "PUT", f"/articles/{article_id}", body=body)

    if action == "publish":
        if not article_id:
            return {"ok": False, "error": "publish 需要 article_id"}
        body = {"scheduled_at": args["scheduled_at"]} if args.get("scheduled_at") else None
        return await call_api(token, "POST", f"/articles/{article_id}/publish", body=body)

    # 置顶/取消置顶：后端没有专用路由，但 PUT /articles/{id} 的 schema 认 is_pinned
    # （update_article 用 exclude_unset + setattr，能正确落库），走 update 即可。
    if action in ("pin", "unpin"):
        if not article_id:
            return {"ok": False, "error": f"{action} 需要 article_id"}
        return await call_api(
            token, "PUT", f"/articles/{article_id}", body={"is_pinned": action == "pin"}
        )

    # 下架：没有 unpublish 路由，靠改 status=draft 实现
    # （published_at 会残留，属已知的历史遗留字段，不影响前台展示）
    if action == "unpublish":
        if not article_id:
            return {"ok": False, "error": "unpublish 需要 article_id"}
        return await call_api(
            token, "PUT", f"/articles/{article_id}", body={"status": "draft"}
        )

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
    "list_pending_articles": _list_pending_reviews,
    "review_article": _review_article,
    "generate_article_summary": _generate_summary,
    "fix_article_read_time": _fix_read_time,
    "get_article_detail": _get_article_detail,
    "manage_article": _manage_article,
    "get_categories": _get_categories,
    "get_tags": _get_tags,
    "get_archives": _get_archives,
}
