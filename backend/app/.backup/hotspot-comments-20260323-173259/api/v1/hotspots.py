"""
每日热点 API
"""

from __future__ import annotations

from datetime import date, datetime
import hashlib
from typing import Optional, Iterable

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.database import get_db
from ...core.deps import get_current_admin, get_current_admin_optional
from ...core.redis import cache_get, cache_set, cache_delete_pattern
from ...models.admin import Admin
from ...models.article import Tag
from ...models.hot_topic import HotTopic, HotTopicSource
from ...schemas.common import PaginatedResponse
from ...schemas.hot_topic import (
    HotTopicArchiveCount,
    HotTopicDetailResponse,
    HotTopicFacetCount,
    HotTopicListItem,
    HotTopicMetaResponse,
    HotTopicPublishRequest,
    HotTopicSourceResponse,
    HotTopicTaskRunRequest,
    HotTopicTaskRunResponse,
    HotTopicUpdateRequest,
    HotFetchJobResponse,
)
from ...services.hot_topic_service import (
    create_hot_topics_from_sources,
    ensure_hotspot_settings,
    get_hot_topic_detail,
    hide_hot_topic,
    list_hot_jobs,
    list_hot_topics,
    publish_hot_topic,
    update_hot_topic,
)

router = APIRouter()

FRONTEND_PAGE_SIZE_DEFAULT = 12
FRONTEND_PAGE_SIZE_MAX = 100
HOTSPOT_LIST_CACHE_TTL = 60
HOTSPOT_DETAIL_CACHE_TTL = 300
HOTSPOT_META_CACHE_TTL = 300
HOTSPOT_FEATURED_CACHE_TTL = 120
HOTSPOT_SOURCES_CACHE_TTL = 300


def _dedup_preserve_order(values: Iterable[str | None]) -> list[str]:
    seen = set()
    result: list[str] = []
    for value in values or []:
        if not value:
            continue
        cleaned = str(value).strip()
        if not cleaned or cleaned in seen:
            continue
        seen.add(cleaned)
        result.append(cleaned)
    return result


def _set_public_cache(response: Response, max_age: int, swr: int = 300) -> None:
    response.headers["Cache-Control"] = f"public, max-age={max_age}, stale-while-revalidate={swr}"


def _set_private_no_store(response: Response) -> None:
    response.headers["Cache-Control"] = "private, no-store"


def _cache_key(prefix: str, **params) -> str:
    material = "&".join(f"{k}={v}" for k, v in sorted(params.items()) if v is not None)
    digest = hashlib.md5(material.encode("utf-8")).hexdigest()[:16]
    return f"hotspots:{prefix}:{digest}"


async def _invalidate_hotspot_caches() -> None:
    await cache_delete_pattern("hotspots:*")


def _normalized_source_types(sources: Iterable) -> list[str]:
    return [s for s in _dedup_preserve_order([getattr(s, "source_type", None) for s in (sources or [])]) if s.lower() != "manual"]


def _normalized_source_domains(sources: Iterable) -> list[str]:
    return _dedup_preserve_order([getattr(s, "source_domain", None) for s in (sources or [])])


def _to_list_item(topic) -> HotTopicListItem:
    source_types = _normalized_source_types(topic.sources or [])
    source_domains = _normalized_source_domains(topic.sources or [])
    return HotTopicListItem(
        id=topic.id,
        topic_date=topic.topic_date,
        title=topic.title,
        slug=topic.slug,
        summary=topic.summary,
        heat_score=topic.heat_score,
        status=topic.status,
        primary_category=topic.primary_category,
        published_at=topic.published_at,
        article_id=topic.article_id,
        source_count=len(topic.sources or []),
        tags=_dedup_preserve_order([t.name for t in (topic.tags or [])]),
        source_type=source_types[0] if source_types else None,
        source_types=source_types,
        source_domains=source_domains,
        created_at=topic.created_at,
    )


def _to_detail(topic) -> HotTopicDetailResponse:
    source_types = _normalized_source_types(topic.sources or [])
    source_domains = _normalized_source_domains(topic.sources or [])
    return HotTopicDetailResponse(
        id=topic.id,
        topic_date=topic.topic_date,
        title=topic.title,
        slug=topic.slug,
        summary=topic.summary,
        analysis_md=topic.analysis_md,
        key_points_json=topic.key_points_json,
        heat_score=topic.heat_score,
        status=topic.status,
        primary_category=topic.primary_category,
        published_at=topic.published_at,
        article_id=topic.article_id,
        source_count=len(topic.sources or []),
        source_type=source_types[0] if source_types else None,
        source_types=source_types,
        source_domains=source_domains,
        tags=_dedup_preserve_order([t.name for t in (topic.tags or [])]),
        sources=[HotTopicSourceResponse.model_validate(s) for s in (topic.sources or [])],
        created_at=topic.created_at,
        updated_at=topic.updated_at,
    )


def _hotspot_public_filters(
    resolved_search: Optional[str] = None,
    resolved_from_date: Optional[date] = None,
    resolved_to_date: Optional[date] = None,
):
    filters = [HotTopic.status == "published"]
    if resolved_search:
        like = f"%{resolved_search.strip()}%"
        filters.append(
            or_(
                HotTopic.title.ilike(like),
                HotTopic.summary.ilike(like),
                HotTopic.analysis_md.ilike(like),
            )
        )
    if resolved_from_date:
        filters.append(HotTopic.topic_date >= resolved_from_date)
    if resolved_to_date:
        filters.append(HotTopic.topic_date <= resolved_to_date)
    return filters


@router.get("", response_model=PaginatedResponse[HotTopicListItem])
async def get_hotspots(
    response: Response,
    page: int = Query(1, ge=1),
    page_size: int = Query(FRONTEND_PAGE_SIZE_DEFAULT, ge=1, le=FRONTEND_PAGE_SIZE_MAX),
    status_filter: Optional[str] = Query(None, alias="status"),
    search: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    tag: Optional[str] = Query(None),
    source: Optional[str] = Query(None, description="来源域名或来源类型"),
    source_type: Optional[str] = Query(None),
    topic_date: Optional[date] = Query(None),
    topic_date_from: Optional[date] = Query(None),
    topic_date_to: Optional[date] = Query(None),
    from_date: Optional[date] = Query(None, alias="from"),
    to_date: Optional[date] = Query(None, alias="to"),
    primary_category: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    sort: Optional[str] = Query("latest"),
    db: AsyncSession = Depends(get_db),
    admin: Optional[Admin] = Depends(get_current_admin_optional),
):
    admin_mode = admin is not None
    resolved_search = (q or search or "").strip() or None
    resolved_category = (category or primary_category or "").strip() or None
    resolved_source = (source_type or source or "").strip() or None
    resolved_from_date = topic_date_from or from_date
    resolved_to_date = topic_date_to or to_date

    if resolved_source and resolved_source.lower() == "manual":
        resolved_source = "__manual_blocked__"

    if admin_mode:
        _set_private_no_store(response)
    else:
        _set_public_cache(response, HOTSPOT_LIST_CACHE_TTL)
        cache_key = _cache_key(
            "list",
            page=page,
            page_size=page_size,
            status=status_filter,
            search=resolved_search,
            tag=tag,
            source=resolved_source,
            topic_date=topic_date,
            from_date=resolved_from_date,
            to_date=resolved_to_date,
            category=resolved_category,
            sort=sort,
        )
        cached = await cache_get(cache_key)
        if cached:
            return cached

    items, total = await list_hot_topics(
        db=db,
        page=page,
        page_size=page_size,
        status_filter=status_filter,
        search=resolved_search,
        tag=tag,
        source_domain=resolved_source,
        topic_date=topic_date,
        from_date=resolved_from_date,
        to_date=resolved_to_date,
        primary_category=resolved_category,
        sort=sort,
        admin_mode=admin_mode,
    )

    resp = PaginatedResponse(
        data=[_to_list_item(i) for i in items],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=(total + page_size - 1) // page_size,
    )

    if not admin_mode:
        await cache_set(cache_key, resp.model_dump(), ttl=HOTSPOT_LIST_CACHE_TTL)

    return resp


@router.get("/featured", response_model=list[HotTopicListItem])
async def get_hotspots_featured(
    response: Response,
    limit: int = Query(3, ge=1, le=10),
    db: AsyncSession = Depends(get_db),
):
    _set_public_cache(response, HOTSPOT_FEATURED_CACHE_TTL)
    cache_key = _cache_key("featured", limit=limit)
    cached = await cache_get(cache_key)
    if cached:
        return cached

    items, _ = await list_hot_topics(
        db=db,
        page=1,
        page_size=limit,
        sort="hottest",
        admin_mode=False,
    )
    resp = [_to_list_item(i).model_dump() for i in items]
    await cache_set(cache_key, resp, ttl=HOTSPOT_FEATURED_CACHE_TTL)
    return resp


@router.get("/meta", response_model=HotTopicMetaResponse)
async def get_hotspots_meta(
    response: Response,
    search: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    topic_date_from: Optional[date] = Query(None),
    topic_date_to: Optional[date] = Query(None),
    from_date: Optional[date] = Query(None, alias="from"),
    to_date: Optional[date] = Query(None, alias="to"),
    db: AsyncSession = Depends(get_db),
):
    resolved_search = (q or search or "").strip() or None
    resolved_from_date = topic_date_from or from_date
    resolved_to_date = topic_date_to or to_date

    _set_public_cache(response, HOTSPOT_META_CACHE_TTL)
    cache_key = _cache_key(
        "meta",
        search=resolved_search,
        from_date=resolved_from_date,
        to_date=resolved_to_date,
    )
    cached = await cache_get(cache_key)
    if cached:
        return cached

    filters = _hotspot_public_filters(
        resolved_search=resolved_search,
        resolved_from_date=resolved_from_date,
        resolved_to_date=resolved_to_date,
    )

    total_published = await db.scalar(select(func.count(HotTopic.id)).where(*filters)) or 0

    featured_result = await db.execute(
        select(HotTopic.id)
        .where(*filters)
        .order_by(
            HotTopic.heat_score.desc(),
            HotTopic.published_at.desc(),
            HotTopic.topic_date.desc(),
            HotTopic.id.desc(),
        )
        .limit(3)
    )
    featured_ids = [row[0] for row in featured_result.all()]

    category_result = await db.execute(
        select(HotTopic.primary_category, func.count(HotTopic.id))
        .where(*filters)
        .where(HotTopic.primary_category.isnot(None))
        .group_by(HotTopic.primary_category)
        .order_by(func.count(HotTopic.id).desc(), HotTopic.primary_category.asc())
    )
    category_counts = [
        HotTopicFacetCount(name=name, count=count)
        for name, count in category_result.all()
        if name
    ]

    tag_result = await db.execute(
        select(Tag.name, func.count(func.distinct(HotTopic.id)))
        .select_from(HotTopic)
        .join(HotTopic.tags)
        .where(*filters)
        .group_by(Tag.name)
        .order_by(func.count(func.distinct(HotTopic.id)).desc(), Tag.name.asc())
    )
    tag_counts = [
        HotTopicFacetCount(name=name, count=int(count))
        for name, count in tag_result.all()
        if name
    ]

    source_type_result = await db.execute(
        select(HotTopicSource.source_type, func.count(func.distinct(HotTopic.id)))
        .select_from(HotTopic)
        .join(HotTopic.sources)
        .where(*filters)
        .where(HotTopicSource.source_type != "manual")
        .group_by(HotTopicSource.source_type)
        .order_by(func.count(func.distinct(HotTopic.id)).desc(), HotTopicSource.source_type.asc())
    )
    source_type_counts = [
        HotTopicFacetCount(name=name, count=count)
        for name, count in source_type_result.all()
        if name
    ]

    source_domain_result = await db.execute(
        select(HotTopicSource.source_domain, func.count(func.distinct(HotTopic.id)))
        .select_from(HotTopic)
        .join(HotTopic.sources)
        .where(*filters)
        .where(HotTopicSource.source_domain.isnot(None))
        .group_by(HotTopicSource.source_domain)
        .order_by(func.count(func.distinct(HotTopic.id)).desc(), HotTopicSource.source_domain.asc())
    )
    source_domain_counts = [
        HotTopicFacetCount(name=name, count=count)
        for name, count in source_domain_result.all()
        if name
    ]

    archive_result = await db.execute(
        select(func.date_format(HotTopic.topic_date, "%Y-%m"), func.count(HotTopic.id))
        .where(*filters)
        .group_by(func.date_format(HotTopic.topic_date, "%Y-%m"))
        .order_by(func.date_format(HotTopic.topic_date, "%Y-%m").desc())
    )
    archive_month_counts = [
        HotTopicArchiveCount(month=month, count=count)
        for month, count in archive_result.all()
        if month
    ]

    resp = HotTopicMetaResponse(
        total_published=int(total_published),
        featured_ids=featured_ids,
        category_counts=category_counts,
        tag_counts=tag_counts,
        source_type_counts=source_type_counts,
        source_domain_counts=source_domain_counts,
        archive_month_counts=archive_month_counts,
    )
    await cache_set(cache_key, resp.model_dump(), ttl=HOTSPOT_META_CACHE_TTL)
    return resp


@router.get("/{topic_id}", response_model=HotTopicDetailResponse)
async def get_hotspot_detail(
    topic_id: int,
    response: Response,
    db: AsyncSession = Depends(get_db),
    admin: Optional[Admin] = Depends(get_current_admin_optional),
):
    admin_mode = admin is not None
    if admin_mode:
        _set_private_no_store(response)
    else:
        _set_public_cache(response, HOTSPOT_DETAIL_CACHE_TTL)
        cache_key = _cache_key("detail", topic_id=topic_id)
        cached = await cache_get(cache_key)
        if cached:
            return cached

    topic = await get_hot_topic_detail(db, topic_id, admin_mode=admin_mode)
    if not topic:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="热点不存在")

    resp = _to_detail(topic)
    if not admin_mode:
        await cache_set(cache_key, resp.model_dump(), ttl=HOTSPOT_DETAIL_CACHE_TTL)
    return resp


@router.get("/{topic_id}/sources", response_model=list[HotTopicSourceResponse])
async def get_hotspot_sources(
    topic_id: int,
    response: Response,
    db: AsyncSession = Depends(get_db),
    admin: Optional[Admin] = Depends(get_current_admin_optional),
):
    admin_mode = admin is not None
    if admin_mode:
        _set_private_no_store(response)
    else:
        _set_public_cache(response, HOTSPOT_SOURCES_CACHE_TTL)
        cache_key = _cache_key("sources", topic_id=topic_id)
        cached = await cache_get(cache_key)
        if cached:
            return cached

    topic = await get_hot_topic_detail(db, topic_id, admin_mode=admin_mode)
    if not topic:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="热点不存在")

    resp = [HotTopicSourceResponse.model_validate(s).model_dump() for s in (topic.sources or [])]
    if not admin_mode:
        await cache_set(cache_key, resp, ttl=HOTSPOT_SOURCES_CACHE_TTL)
    return resp


@router.post("/tasks/run", response_model=HotTopicTaskRunResponse)
async def run_hotspot_task(
    request: HotTopicTaskRunRequest,
    db: AsyncSession = Depends(get_db),
    admin: Admin = Depends(get_current_admin),
):
    result = await create_hot_topics_from_sources(
        db=db,
        run_date=request.topic_date,
        trigger_mode="manual",
        source_overrides=[s.model_dump() for s in request.sources] if request.sources else None,
        auto_publish=request.auto_publish,
    )
    if result.get("created_topic_ids"):
        await _invalidate_hotspot_caches()
    return HotTopicTaskRunResponse(**result)


@router.get("/tasks/list", response_model=PaginatedResponse[HotFetchJobResponse])
async def get_hotspot_tasks(
    response: Response,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    admin: Admin = Depends(get_current_admin),
):
    _set_private_no_store(response)
    items, total = await list_hot_jobs(db, page, page_size)
    return PaginatedResponse(
        data=[HotFetchJobResponse.model_validate(i) for i in items],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=(total + page_size - 1) // page_size,
    )


@router.put("/{topic_id}", response_model=HotTopicDetailResponse)
async def edit_hotspot(
    topic_id: int,
    response: Response,
    payload: HotTopicUpdateRequest,
    db: AsyncSession = Depends(get_db),
    admin: Admin = Depends(get_current_admin),
):
    _set_private_no_store(response)
    topic = await get_hot_topic_detail(db, topic_id, admin_mode=True)
    if not topic:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="热点不存在")

    updated = await update_hot_topic(
        db,
        topic,
        title=payload.title,
        summary=payload.summary,
        analysis_md=payload.analysis_md,
        key_points_json=payload.key_points_json,
        heat_score=payload.heat_score,
        primary_category=payload.primary_category,
        tag_names=payload.tag_names,
        status=payload.status,
    )
    await _invalidate_hotspot_caches()
    return _to_detail(updated)


@router.post("/{topic_id}/publish", response_model=HotTopicDetailResponse)
async def publish_hotspot_item(
    topic_id: int,
    response: Response,
    payload: HotTopicPublishRequest,
    db: AsyncSession = Depends(get_db),
    admin: Admin = Depends(get_current_admin),
):
    _set_private_no_store(response)
    topic = await get_hot_topic_detail(db, topic_id, admin_mode=True)
    if not topic:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="热点不存在")

    updated = await publish_hot_topic(db, topic, published_at=payload.published_at)
    await _invalidate_hotspot_caches()
    return _to_detail(updated)


@router.post("/{topic_id}/hide", response_model=HotTopicDetailResponse)
async def hide_hotspot_item(
    topic_id: int,
    response: Response,
    db: AsyncSession = Depends(get_db),
    admin: Admin = Depends(get_current_admin),
):
    _set_private_no_store(response)
    topic = await get_hot_topic_detail(db, topic_id, admin_mode=True)
    if not topic:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="热点不存在")

    updated = await hide_hot_topic(db, topic)
    await _invalidate_hotspot_caches()
    return _to_detail(updated)


@router.post("/settings/init")
async def init_hotspot_settings(
    response: Response,
    db: AsyncSession = Depends(get_db),
    admin: Admin = Depends(get_current_admin),
):
    _set_private_no_store(response)
    await ensure_hotspot_settings(db)
    return {"message": "热点默认配置已初始化"}
