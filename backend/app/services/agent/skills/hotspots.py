"""
热点 / AI 日报管理技能
覆盖：热点列表与检索、详情、来源查看、创建/编辑、发布/隐藏/删除、抓取任务

为什么单独立一个模块：/api/v1/hotspots 有 14 条路由，但此前一个 skill 都没接，
AI 完全不知道站点的「AI 日报」这一块存在，只能靠 call_api 盲猜路径。
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
            "name": "list_hotspots",
            "description": "获取热点/AI日报列表，支持关键词、标签、来源、分类、日期区间、状态筛选和分页",
            "parameters": {
                "type": "object",
                "properties": {
                    "keyword": {"type": "string", "description": "标题/摘要关键词（可选）"},
                    "tag": {"type": "string", "description": "按标签筛选（可选）"},
                    "category": {"type": "string", "description": "按主分类筛选（可选）"},
                    "source": {"type": "string", "description": "按来源域名或来源类型 rss/api/manual 筛选（可选）"},
                    "date_from": {"type": "string", "description": "起始日期 YYYY-MM-DD（可选）"},
                    "date_to": {"type": "string", "description": "结束日期 YYYY-MM-DD（可选）"},
                    "status": {
                        "type": "string",
                        "enum": ["draft", "published", "hidden"],
                        "description": "按状态筛选（可选）",
                    },
                    "sort": {"type": "string", "description": "排序，默认 latest"},
                    "page": {"type": "integer", "description": "页码，默认 1", "default": 1},
                    "page_size": {"type": "integer", "description": "每页条数，默认 10", "default": 10},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_hotspot_meta",
            "description": "获取热点板块的元信息：总条数、精选数、按状态/日期的分面计数。想知道「一共多少条日报」用这个",
            "parameters": {
                "type": "object",
                "properties": {
                    "keyword": {"type": "string", "description": "关键词（可选）"},
                    "date_from": {"type": "string", "description": "起始日期（可选）"},
                    "date_to": {"type": "string", "description": "结束日期（可选）"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_featured_hotspots",
            "description": "获取当前精选的热点（按热度分排序的前几条）",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_hotspot_detail",
            "description": "获取单条热点/日报的详情（含正文、来源数、热度分）",
            "parameters": {
                "type": "object",
                "properties": {
                    "hotspot_id": {"type": "integer", "description": "热点 ID"},
                },
                "required": ["hotspot_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_hotspot_sources",
            "description": "获取某条热点的来源列表（rss / api / manual），排查内容出处用",
            "parameters": {
                "type": "object",
                "properties": {
                    "hotspot_id": {"type": "integer", "description": "热点 ID"},
                },
                "required": ["hotspot_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "manage_hotspot",
            "description": "对热点/日报执行管理：创建(create)、编辑(update)、发布(publish)、隐藏(hide)、删除(delete)",
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": ["create", "update", "publish", "hide", "delete"],
                        "description": "操作类型",
                    },
                    "hotspot_id": {"type": "integer", "description": "热点 ID（update/publish/hide/delete 必填）"},
                    "title": {"type": "string", "description": "标题（create 必填，update 可选）"},
                    "slug": {"type": "string", "description": "URL 别名（create 必填，建议用英文短横线）"},
                    "date": {"type": "string", "description": "日期 YYYY-MM-DD（create 必填，对应 topic_date）"},
                    "summary": {"type": "string", "description": "摘要（可选）"},
                    "analysis_md": {"type": "string", "description": "正文 Markdown，字段名是 analysis_md 不是 content（可选）"},
                    "category": {"type": "string", "description": "主分类，对应 primary_category（可选）"},
                    "tags": {
                        "type": "array", "items": {"type": "string"},
                        "description": "标签名列表，对应 tag_names（可选）",
                    },
                    "heat_score": {"type": "number", "description": "热度分，越大越靠前（可选）"},
                    "status": {
                        "type": "string",
                        "enum": ["draft", "published", "hidden"],
                        "description": "create 时的初始状态，默认 draft",
                    },
                    "auto_publish": {"type": "boolean", "description": "create 时是否直接发布，默认 false"},
                },
                "required": ["action"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "run_hotspot_fetch",
            "description": "手动触发一次热点抓取任务（AI 日报自动生成）。想立刻产出某天的日报时用；这是异步任务，返回 job_id，用 list_fetch_jobs 查结果",
            "parameters": {
                "type": "object",
                "properties": {
                    "date": {"type": "string", "description": "抓取指定日期 YYYY-MM-DD，默认今天（可选）"},
                    "auto_publish": {
                        "type": "boolean",
                        "description": "抓到后是否直接发布，默认 false（先进草稿）",
                    },
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_fetch_jobs",
            "description": "查看热点抓取任务的历史记录（状态 running/success/partial/failed），排查日报为什么没生成用",
            "parameters": {
                "type": "object",
                "properties": {
                    "page": {"type": "integer", "description": "页码，默认 1", "default": 1},
                    "page_size": {"type": "integer", "description": "每页条数，默认 10", "default": 10},
                },
            },
        },
    },
]


# ------------------------------------------------------------------ #
#  处理函数
# ------------------------------------------------------------------ #

def _query_params(args: Dict[str, Any]) -> Dict[str, Any]:
    """把 skill 参数映射到后端实际 query 名（只传用户真的给了的，避免 None 变成筛选条件）。"""
    params: Dict[str, Any] = {}
    for src, dst in (
        ("keyword", "search"),        # 后端叫 search
        ("tag", "tag"),
        ("category", "primary_category"),
        ("source", "source"),
        ("date_from", "topic_date_from"),
        ("date_to", "topic_date_to"),
        ("status", "status"),
        ("sort", "sort"),
        ("page", "page"),
        ("page_size", "page_size"),
    ):
        value = args.get(src)
        if value not in (None, ""):
            params[dst] = value
    return params


async def _list_hotspots(
    args: Dict[str, Any], token: str, db: AsyncSession,
) -> Dict[str, Any]:
    return await call_api(token, "GET", "/hotspots", query_params=_query_params(args))


async def _get_hotspot_meta(
    args: Dict[str, Any], token: str, db: AsyncSession,
) -> Dict[str, Any]:
    return await call_api(token, "GET", "/hotspots/meta", query_params=_query_params(args))


async def _get_featured(
    args: Dict[str, Any], token: str, db: AsyncSession,
) -> Dict[str, Any]:
    return await call_api(token, "GET", "/hotspots/featured")


async def _get_detail(
    args: Dict[str, Any], token: str, db: AsyncSession,
) -> Dict[str, Any]:
    hotspot_id = args.get("hotspot_id")
    if not hotspot_id:
        return {"ok": False, "error": "hotspot_id 必填"}
    return await call_api(token, "GET", f"/hotspots/{hotspot_id}")


async def _get_sources(
    args: Dict[str, Any], token: str, db: AsyncSession,
) -> Dict[str, Any]:
    hotspot_id = args.get("hotspot_id")
    if not hotspot_id:
        return {"ok": False, "error": "hotspot_id 必填"}
    return await call_api(token, "GET", f"/hotspots/{hotspot_id}/sources")


# skill 参数名 → HotTopicCreateRequest / HotTopicUpdateRequest 的真实字段名
_CREATE_MAP = {
    "title": "title",
    "slug": "slug",
    "summary": "summary",
    "analysis_md": "analysis_md",
    "date": "topic_date",
    "category": "primary_category",
    "tags": "tag_names",
    "heat_score": "heat_score",
    "status": "status",
    "auto_publish": "auto_publish",
}
_UPDATE_MAP = {
    "title": "title",
    "summary": "summary",
    "analysis_md": "analysis_md",
    "category": "primary_category",
    "tags": "tag_names",
    "heat_score": "heat_score",
    "status": "status",
}


async def _manage(
    args: Dict[str, Any], token: str, db: AsyncSession,
) -> Dict[str, Any]:
    action = args.get("action")
    hotspot_id = args.get("hotspot_id")

    if action == "create":
        body = {dst: args[src] for src, dst in _CREATE_MAP.items() if args.get(src) is not None}
        missing = [f for f in ("title", "slug", "topic_date") if not body.get(f)]
        if missing:
            return {"ok": False, "error": f"create 缺少必填字段: {', '.join(missing)}（对应参数 title/slug/date）"}
        return await call_api(token, "POST", "/hotspots", body=body)

    if not hotspot_id:
        return {"ok": False, "error": f"{action} 需要 hotspot_id"}

    if action == "update":
        body = {dst: args[src] for src, dst in _UPDATE_MAP.items() if args.get(src) is not None}
        if not body:
            return {"ok": False, "error": "update 至少要传一个要改的字段"}
        return await call_api(token, "PUT", f"/hotspots/{hotspot_id}", body=body)

    if action == "publish":
        return await call_api(token, "POST", f"/hotspots/{hotspot_id}/publish")
    if action == "hide":
        return await call_api(token, "POST", f"/hotspots/{hotspot_id}/hide")
    if action == "delete":
        return await call_api(token, "DELETE", f"/hotspots/{hotspot_id}")

    return {"ok": False, "error": f"未知 action: {action}"}


async def _run_fetch(
    args: Dict[str, Any], token: str, db: AsyncSession,
) -> Dict[str, Any]:
    # HotTopicTaskRunRequest: topic_date / auto_publish / sources
    body: Dict[str, Any] = {"auto_publish": bool(args.get("auto_publish"))}
    if args.get("date"):
        body["topic_date"] = args["date"]
    return await call_api(token, "POST", "/hotspots/tasks/run", body=body)


async def _list_jobs(
    args: Dict[str, Any], token: str, db: AsyncSession,
) -> Dict[str, Any]:
    return await call_api(
        token, "GET", "/hotspots/tasks/list",
        query_params=_query_params(args),
    )


# ---- 处理函数映射表 ------------------------------------------------ #

_HANDLERS = {
    "list_hotspots": _list_hotspots,
    "get_hotspot_meta": _get_hotspot_meta,
    "get_featured_hotspots": _get_featured,
    "get_hotspot_detail": _get_detail,
    "get_hotspot_sources": _get_sources,
    "manage_hotspot": _manage,
    "run_hotspot_fetch": _run_fetch,
    "list_fetch_jobs": _list_jobs,
}

SKILL_NAMES = frozenset(_HANDLERS.keys())


# ------------------------------------------------------------------ #
#  统一入口
# ------------------------------------------------------------------ #

async def execute(
    name: str,
    args: Dict[str, Any],
    token: str,
    db: AsyncSession,
) -> Dict[str, Any]:
    handler = _HANDLERS.get(name)
    if handler is None:
        return {"ok": False, "error": f"未实现的热点技能: {name}"}
    return await handler(args, token, db)
