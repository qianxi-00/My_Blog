"""
统计 API
"""

from datetime import datetime, date, timedelta
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status, Request, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from ...core.database import get_db
from ...core.deps import get_current_admin
from ...core.redis import cache_get, cache_set, cache_delete, cache_delete_pattern, CacheKeys
from ...models.admin import Admin
from ...models.article import Article
from ...models.comment import Comment
from ...models.stats import PageView, DailyStat
from ...schemas.stats import (
    PageViewCreate, DailyStatResponse, DailyStatUpdate, StatsOverview, PopularArticle
)

router = APIRouter()


@router.post("/page-view")
async def record_page_view(
    page_view: PageViewCreate,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """
    记录页面访问（公开）
    """
    view = PageView(
        page_path=page_view.page_path,
        article_id=page_view.article_id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        referer=page_view.referer
    )
    
    db.add(view)
    await db.commit()
    
    return {"message": "已记录"}


@router.get("/overview", response_model=StatsOverview)
async def get_stats_overview(
    db: AsyncSession = Depends(get_db),
    admin: Admin = Depends(get_current_admin)
):
    """
    获取统计概览（管理员）
    """
    cached = await cache_get(CacheKeys.STATS_OVERVIEW)
    if cached:
        return cached

    today = date.today()
    today_start = datetime.combine(today, datetime.min.time())
    today_end = datetime.combine(today, datetime.max.time())
    
    # 今日访问量
    result = await db.execute(
        select(func.count())
        .select_from(PageView)
        .where(PageView.created_at >= today_start)
        .where(PageView.created_at <= today_end)
    )
    today_views = result.scalar() or 0
    
    # 今日独立访客
    result = await db.execute(
        select(func.count(func.distinct(PageView.ip_address)))
        .where(PageView.created_at >= today_start)
        .where(PageView.created_at <= today_end)
    )
    today_visitors = result.scalar() or 0
    
    # 总文章数
    result = await db.execute(
        select(func.count()).select_from(Article)
    )
    total_articles = result.scalar() or 0
    
    # 总评论数（只统计已通过的）
    result = await db.execute(
        select(func.count())
        .select_from(Comment)
        .where(Comment.status == "approved")
    )
    total_comments = result.scalar() or 0
    
    # 待审核评论
    result = await db.execute(
        select(func.count())
        .select_from(Comment)
        .where(Comment.status == "pending")
    )
    pending_comments = result.scalar() or 0
    
    # AI 调用次数（今日）
    result = await db.execute(
        select(DailyStat).where(DailyStat.date == str(today))
    )
    today_stat = result.scalar_one_or_none()
    today_ai_calls = today_stat.ai_api_calls if today_stat else 0
    
    # AI 调用次数（累计）
    result = await db.execute(
        select(func.sum(DailyStat.ai_api_calls))
    )
    total_ai_calls = result.scalar() or 0
    
    resp = StatsOverview(
        today_views=today_views,
        today_visitors=today_visitors,
        total_articles=total_articles,
        total_comments=total_comments,
        pending_comments=pending_comments,
        today_ai_calls=today_ai_calls,
        total_ai_calls=total_ai_calls
    )
    await cache_set(CacheKeys.STATS_OVERVIEW, resp.model_dump(), ttl=30)
    return resp


@router.get("/daily", response_model=List[DailyStatResponse])
async def get_daily_stats(
    days: int = Query(7, ge=1, le=90),
    db: AsyncSession = Depends(get_db),
    admin: Admin = Depends(get_current_admin)
):
    """
    获取每日统计（管理员）
    从 page_views / comments 实时聚合，ai_api_calls 来自 daily_stats 表
    """
    today = date.today()
    start_date = today - timedelta(days=days - 1)
    start_dt = datetime.combine(start_date, datetime.min.time())

    # 1) 按天聚合 page_views => total_views, unique_visitors, article_views
    pv_query = (
        select(
            func.date(PageView.created_at).label("d"),
            func.count().label("total_views"),
            func.count(func.distinct(PageView.ip_address)).label("unique_visitors"),
            func.count(PageView.article_id).label("article_views"),
        )
        .where(PageView.created_at >= start_dt)
        .group_by(func.date(PageView.created_at))
    )
    pv_result = await db.execute(pv_query)
    pv_map: dict = {}
    for row in pv_result:
        day_str = str(row.d)
        pv_map[day_str] = {
            "total_views": row.total_views,
            "unique_visitors": row.unique_visitors,
            "article_views": row.article_views,
        }

    # 2) 按天聚合 comments => new_comments
    comment_query = (
        select(
            func.date(Comment.created_at).label("d"),
            func.count().label("cnt"),
        )
        .where(Comment.created_at >= start_dt)
        .group_by(func.date(Comment.created_at))
    )
    cm_result = await db.execute(comment_query)
    cm_map: dict = {}
    for row in cm_result:
        cm_map[str(row.d)] = row.cnt

    # 3) 读取 daily_stats 表中的 ai_api_calls
    ds_result = await db.execute(
        select(DailyStat)
        .where(DailyStat.date >= str(start_date))
    )
    ds_map: dict = {}
    for ds in ds_result.scalars().all():
        ds_map[str(ds.date)] = ds.ai_api_calls

    # 4) 合并生成每天记录（即使某天无数据也要有占位）
    merged: List[DailyStatResponse] = []
    for i in range(days):
        d = start_date + timedelta(days=i)
        d_str = str(d)
        pv = pv_map.get(d_str, {})
        merged.append(DailyStatResponse(
            date=d,
            total_views=pv.get("total_views", 0),
            unique_visitors=pv.get("unique_visitors", 0),
            article_views=pv.get("article_views", 0),
            new_comments=cm_map.get(d_str, 0),
            ai_api_calls=ds_map.get(d_str, 0),
        ))

    return merged


@router.get("/popular-articles", response_model=List[PopularArticle])
async def get_popular_articles(
    limit: int = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    admin: Admin = Depends(get_current_admin)
):
    """
    获取热门文章（管理员）
    """
    result = await db.execute(
        select(Article)
        .where(Article.status == "published")
        .order_by(Article.view_count.desc())
        .limit(limit)
    )
    articles = result.scalars().all()
    
    return [
        PopularArticle(
            id=a.id,
            title=a.title,
            view_count=a.view_count,
            published_at=a.published_at
        )
        for a in articles
    ]


@router.put("/update-daily")
async def update_daily_stats(
    body: DailyStatUpdate,
    db: AsyncSession = Depends(get_db),
    admin: Admin = Depends(get_current_admin)
):
    """
    修改指定日期的统计数据（增量式，管理员）
    """
    result = await db.execute(
        select(DailyStat).where(DailyStat.date == body.date)
    )
    daily_stat = result.scalar_one_or_none()

    if daily_stat:
        daily_stat.total_views += body.total_views
        daily_stat.unique_visitors += body.unique_visitors
        daily_stat.article_views += body.article_views
        daily_stat.new_comments += body.new_comments
        daily_stat.ai_api_calls += body.ai_api_calls
    else:
        daily_stat = DailyStat(
            date=body.date,
            total_views=body.total_views,
            unique_visitors=body.unique_visitors,
            article_views=body.article_views,
            new_comments=body.new_comments,
            ai_api_calls=body.ai_api_calls,
        )
        db.add(daily_stat)

    await db.commit()
    return {"message": f"已更新 {body.date} 的统计数据"}


async def record_ai_call(db: AsyncSession, count: int = 1):
    """
    记录 AI API 调用次数
    
    Args:
        db: 数据库会话
        count: 调用次数（默认为1）
    """
    today = date.today()
    today_str = str(today)
    
    # 查找或创建今日统计记录
    result = await db.execute(
        select(DailyStat).where(DailyStat.date == today_str)
    )
    daily_stat = result.scalar_one_or_none()
    
    if daily_stat:
        daily_stat.ai_api_calls += count
    else:
        daily_stat = DailyStat(
            date=today_str,
            ai_api_calls=count
        )
        db.add(daily_stat)
    
    await db.commit()
