"""
统计相关技能
覆盖：站点概览、每日统计、热门文章、统计数据更新
"""

from __future__ import annotations

from typing import Any, Dict, List

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..tools.call_api import call_api


# ------------------------------------------------------------------ #
#  Skill Schema
# ------------------------------------------------------------------ #

SKILL_SCHEMAS: List[Dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "get_site_overview",
            "description": "获取站点概览统计（文章数、评论数、总访问量等）",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_daily_stats",
            "description": "获取最近 N 天的每日统计数据",
            "parameters": {
                "type": "object",
                "properties": {
                    "days": {"type": "integer", "description": "天数，默认 7", "default": 7},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_popular_articles",
            "description": "获取热门文章排行榜",
            "parameters": {
                "type": "object",
                "properties": {
                    "days": {"type": "integer", "description": "统计天数，默认 7", "default": 7},
                    "limit": {"type": "integer", "description": "返回条数，默认 10", "default": 10},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "update_daily_stats",
            "description": "修改指定日期的统计数据（增量式），传入的字段值会与已有值相加，不传的字段不变",
            "parameters": {
                "type": "object",
                "properties": {
                    "date": {"type": "string", "description": "日期，格式 YYYY-MM-DD"},
                    "total_views": {"type": "integer", "description": "访问次数增量"},
                    "unique_visitors": {"type": "integer", "description": "独立访客增量"},
                    "article_views": {"type": "integer", "description": "文章访问次数增量"},
                    "new_comments": {"type": "integer", "description": "新评论数增量"},
                    "ai_api_calls": {"type": "integer", "description": "AI 模型调用次数增量"},
                },
                "required": ["date"],
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
        return {"ok": False, "error": f"未知统计技能: {name}"}
    return await handler(args, token, db)


async def _get_site_overview(
    args: Dict[str, Any], token: str, db: AsyncSession,
) -> Dict[str, Any]:
    return await call_api(token, "GET", "/stats/overview")


async def _get_daily_stats(
    args: Dict[str, Any], token: str, db: AsyncSession,
) -> Dict[str, Any]:
    days = args.get("days", 7)
    return await call_api(token, "GET", "/stats/daily", query_params={"days": days})


async def _get_popular_articles(
    args: Dict[str, Any], token: str, db: AsyncSession,
) -> Dict[str, Any]:
    days = args.get("days", 7)
    limit = args.get("limit", 10)
    return await call_api(
        token, "GET", "/stats/popular-articles",
        query_params={"days": days, "limit": limit},
    )


async def _update_daily_stats(
    args: Dict[str, Any], token: str, db: AsyncSession,
) -> Dict[str, Any]:
    """
    增量式修改指定日期的统计数据
    NOTE: 此 Skill 直接操作数据库，绕过 API 层，提供更灵活的增量更新能力
    """
    date_str = args.get("date")
    if not date_str:
        return {"ok": False, "error": "缺少 date 参数"}

    result = await db.execute(
        text("SELECT id, total_views, unique_visitors, article_views, new_comments, ai_api_calls FROM daily_stats WHERE date = :d"),
        {"d": date_str},
    )
    row = result.first()

    delta_views = args.get("total_views", 0)
    delta_visitors = args.get("unique_visitors", 0)
    delta_article = args.get("article_views", 0)
    delta_comments = args.get("new_comments", 0)
    delta_ai = args.get("ai_api_calls", 0)

    if row:
        await db.execute(
            text(
                "UPDATE daily_stats SET "
                "total_views = total_views + :v, "
                "unique_visitors = unique_visitors + :u, "
                "article_views = article_views + :a, "
                "new_comments = new_comments + :c, "
                "ai_api_calls = ai_api_calls + :ai "
                "WHERE id = :id"
            ),
            {"v": delta_views, "u": delta_visitors, "a": delta_article, "c": delta_comments, "ai": delta_ai, "id": row.id},
        )
    else:
        from app.models.stats import DailyStat
        ds = DailyStat(
            date=date_str,
            total_views=delta_views,
            unique_visitors=delta_visitors,
            article_views=delta_article,
            new_comments=delta_comments,
            ai_api_calls=delta_ai,
        )
        db.add(ds)

    await db.flush()
    return {
        "ok": True,
        "message": f"已更新 {date_str} 的统计数据",
        "delta": {
            "total_views": delta_views,
            "unique_visitors": delta_visitors,
            "article_views": delta_article,
            "new_comments": delta_comments,
            "ai_api_calls": delta_ai,
        },
    }


_HANDLERS = {
    "get_site_overview": _get_site_overview,
    "get_daily_stats": _get_daily_stats,
    "get_popular_articles": _get_popular_articles,
    "update_daily_stats": _update_daily_stats,
}
