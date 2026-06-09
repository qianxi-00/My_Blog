"""
每日热点服务
"""

from __future__ import annotations

import hashlib
import re
from pathlib import Path
from datetime import datetime, date
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse

import httpx
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from slugify import slugify

from ..models.article import Article, Tag
from ..models.hot_topic import HotTopic, HotTopicSource, HotFetchJob
from ..models.settings import SiteSetting
from ..services.openai_service import OpenAIService


DEFAULT_CATEGORY = "AI"
DEFAULT_ANALYSIS_TEMPLATE = (
    "## 这篇内容讲了什么\n"
    "{what}\n\n"
    "## 核心观点\n"
    "{points}\n\n"
    "## 为什么值得关注\n"
    "{why}\n\n"
    "## 技术亮点\n"
    "{highlights}\n\n"
    "## 潜在局限\n"
    "{limits}\n\n"
    "## 对开发者与行业趋势的启发\n"
    "{insights}"
)


DEFAULT_ARTICLE_ARCHIVE_DIR = Path("/data/My_Blog/Articles")
HOTSPOT_PAGE_SIZE_DEFAULT = 12
HOTSPOT_PAGE_SIZE_MAX = 100
HOTSPOT_DETAIL_MAX_AGE_SECONDS = 300
HOTSPOT_SOURCE_TYPE_MANUAL_BLOCK = "__manual_blocked__"


def _sanitize_filename_component(value: str, fallback: str = "uncategorized") -> str:
    cleaned = re.sub(r"[^\w\-\u4e00-\u9fff]+", "-", (value or "").strip(), flags=re.UNICODE)
    cleaned = re.sub(r"-+", "-", cleaned).strip("-_. ")
    return cleaned or fallback


def _build_hotspot_archive_markdown(topic: HotTopic) -> str:
    published = topic.published_at.isoformat(sep=" ", timespec="seconds") if topic.published_at else ""
    tags = ", ".join([t.name for t in (topic.tags or [])])
    source_lines = []
    for src in (topic.sources or []):
        line = f"- [{src.source_name}]({src.source_url})"
        if src.original_title:
            line += f" — {src.original_title}"
        source_lines.append(line)
    source_block = "\n".join(source_lines) if source_lines else "- 暂无来源记录"
    body = topic.analysis_md or topic.summary or topic.title
    return f"# {topic.title}\n\n> 分类：{topic.primary_category or '未分类'}\n> 发布：{published or topic.topic_date.isoformat()}\n> 热度：{topic.heat_score}\n> 标签：{tags or '无'}\n> Slug：{topic.slug}\n\n## 摘要\n\n{topic.summary or '暂无摘要'}\n\n## 正文\n\n{body}\n\n## 来源\n\n{source_block}\n"


def _persist_hotspot_markdown(topic: HotTopic) -> str:
    category = _sanitize_filename_component(topic.primary_category or "未分类")
    topic_day = topic.topic_date.isoformat() if topic.topic_date else datetime.now().date().isoformat()
    archive_dir = DEFAULT_ARTICLE_ARCHIVE_DIR / category / topic_day
    archive_dir.mkdir(parents=True, exist_ok=True)
    file_path = archive_dir / f"{_sanitize_filename_component(topic.slug or topic.title, fallback='hotspot')}.md"
    file_path.write_text(_build_hotspot_archive_markdown(topic), encoding="utf-8")
    return str(file_path)


def _normalize_url(url: str) -> str:
    parsed = urlparse(url.strip())
    scheme = (parsed.scheme or "https").lower()
    netloc = parsed.netloc.lower()
    path = parsed.path.rstrip("/")
    return f"{scheme}://{netloc}{path}"


def _extract_domain(url: str) -> str:
    parsed = urlparse(url)
    return parsed.netloc.lower()


def _strip_html(text: str) -> str:
    cleaned = re.sub(r"<[^>]+>", "", text)
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned.strip()


def _hash_for_dedupe(title: str, url: str) -> str:
    source = f"{title.strip().lower()}::{_normalize_url(url)}"
    return hashlib.sha256(source.encode("utf-8")).hexdigest()


def _safe_excerpt(text: str, max_len: int = 300) -> str:
    text = _strip_html(text)
    return text[:max_len].strip()


def _normalize_sort(sort: Optional[str]) -> str:
    value = (sort or "latest").strip().lower()
    mapping = {
        "latest": "latest",
        "newest": "latest",
        "recent": "latest",
        "published_at": "latest",
        "hottest": "hottest",
        "hot": "hottest",
        "heat": "hottest",
        "heat_score": "hottest",
        "featured": "hottest",
        "top": "hottest",
        "top3": "hottest",
    }
    return mapping.get(value, "latest")


async def _get_setting_map(db: AsyncSession) -> Dict[str, SiteSetting]:
    result = await db.execute(select(SiteSetting))
    settings = result.scalars().all()
    return {s.key: s for s in settings}


def _parse_json_setting(raw: Optional[str], default: Any) -> Any:
    if not raw:
        return default
    import json

    try:
        return json.loads(raw)
    except Exception:
        return default


async def get_hotspot_sources_config(db: AsyncSession) -> List[Dict[str, str]]:
    setting_map = await _get_setting_map(db)
    default_sources = [
        {
            "source_type": "rss",
            "source_name": "OpenAI Blog",
            "source_url": "https://openai.com/news/rss.xml",
            "source_domain": "openai.com",
        },
        {
            "source_type": "rss",
            "source_name": "Anthropic News",
            "source_url": "https://www.anthropic.com/news/rss.xml",
            "source_domain": "anthropic.com",
        },
    ]
    item = setting_map.get("hotspot_sources")
    return _parse_json_setting(item.value if item else None, default_sources)


async def get_hotspot_whitelist_domains(db: AsyncSession) -> List[str]:
    setting_map = await _get_setting_map(db)
    default_domains = ["openai.com", "anthropic.com", "huggingface.co", "arxiv.org", "github.com"]
    item = setting_map.get("hotspot_whitelist_domains")
    domains = _parse_json_setting(item.value if item else None, default_domains)
    return [d.lower() for d in domains]


async def get_hotspot_analysis_prompt(db: AsyncSession) -> str:
    setting_map = await _get_setting_map(db)
    item = setting_map.get("hotspot_analysis_prompt")
    if item and item.value:
        return item.value
    return (
        "你是技术编辑。请基于给定标题、摘要与来源，输出 JSON，字段包括："
        "what, points, why, highlights, limits, insights。"
        "必须谨慎，不可虚构原文事实。"
    )


async def ensure_hotspot_settings(db: AsyncSession) -> None:
    exists = await _get_setting_map(db)
    defaults: List[Tuple[str, str, str, str]] = [
        (
            "hotspot_sources",
            "json",
            '[{"source_type":"rss","source_name":"OpenAI Blog","source_url":"https://openai.com/news/rss.xml","source_domain":"openai.com"},{"source_type":"rss","source_name":"Anthropic News","source_url":"https://www.anthropic.com/news/rss.xml","source_domain":"anthropic.com"}]',
            "每日热点来源配置(JSON)",
        ),
        (
            "hotspot_whitelist_domains",
            "json",
            '["openai.com","anthropic.com","huggingface.co","arxiv.org","github.com"]',
            "每日热点来源域名白名单(JSON)",
        ),
        (
            "hotspot_daily_limit",
            "number",
            "8",
            "每日热点最大条数",
        ),
        (
            "hotspot_auto_publish",
            "boolean",
            "false",
            "每日热点是否自动发布",
        ),
        (
            "hotspot_analysis_prompt",
            "string",
            "你是技术编辑。请基于给定标题、摘要与来源，输出 JSON，字段包括：what, points, why, highlights, limits, insights。必须谨慎，不可虚构原文事实。",
            "每日热点分析提示词",
        ),
    ]

    from ..models.settings import SiteSetting

    for key, stype, value, desc in defaults:
        if key in exists:
            continue
        db.add(
            SiteSetting(
                key=key,
                type=stype,
                value=value,
                description=desc,
            )
        )
    await db.commit()


async def _fetch_rss_items(source: Dict[str, str]) -> List[Dict[str, Any]]:
    # 简化版 RSS 抓取（兼容首版）
    url = source["source_url"]
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        content = resp.text

    items: List[Dict[str, Any]] = []
    blocks = re.findall(r"<item>([\s\S]*?)</item>", content)
    for block in blocks[:30]:
        title_match = re.search(r"<title>([\s\S]*?)</title>", block)
        link_match = re.search(r"<link>([\s\S]*?)</link>", block)
        desc_match = re.search(r"<description>([\s\S]*?)</description>", block)
        pub_match = re.search(r"<pubDate>([\s\S]*?)</pubDate>", block)

        if not title_match or not link_match:
            continue

        title = _strip_html(title_match.group(1))
        link = _strip_html(link_match.group(1))
        if not title or not link:
            continue

        description = _strip_html(desc_match.group(1)) if desc_match else ""
        pub_date = _strip_html(pub_match.group(1)) if pub_match else ""
        items.append(
            {
                "title": title,
                "url": link,
                "summary": _safe_excerpt(description),
                "published_raw": pub_date,
                "source_name": source.get("source_name", "未知来源"),
                "source_type": source.get("source_type", "rss"),
                "source_domain": source.get("source_domain") or _extract_domain(link),
            }
        )
    return items


def _domain_allowed(url: str, whitelist: List[str]) -> bool:
    domain = _extract_domain(url)
    return any(domain == w or domain.endswith(f".{w}") for w in whitelist)


async def _generate_analysis(
    ai: OpenAIService,
    prompt: str,
    title: str,
    summary: str,
    source_name: str,
    source_url: str,
) -> Tuple[str, Dict[str, Any]]:
    payload = (
        f"标题：{title}\n"
        f"摘要：{summary or '无'}\n"
        f"来源：{source_name}\n"
        f"链接：{source_url}\n"
        "请严格输出 JSON，不要附加解释。"
    )

    raw = await ai.chat(
        messages=[{"role": "user", "content": payload}],
        system_prompt=prompt,
        max_tokens=900,
        temperature=0.3,
    )

    import json

    data: Dict[str, Any] = {}
    try:
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = re.sub(r"^```(?:json)?", "", cleaned).strip()
            cleaned = re.sub(r"```$", "", cleaned).strip()
        data = json.loads(cleaned)
    except Exception:
        # 降级：保留最小结构
        data = {
            "what": summary or "该内容介绍了与 AI 相关的最新动态。",
            "points": "- 信息提炼失败，建议查看原文。",
            "why": "具备参考价值，建议结合原文判断。",
            "highlights": "- 暂无自动提炼结果",
            "limits": "- 自动分析失败，可能因原文结构异常",
            "insights": "- 建议关注原文后续更新",
        }

    analysis_md = DEFAULT_ANALYSIS_TEMPLATE.format(
        what=data.get("what", ""),
        points=data.get("points", ""),
        why=data.get("why", ""),
        highlights=data.get("highlights", ""),
        limits=data.get("limits", ""),
        insights=data.get("insights", ""),
    )

    return analysis_md, data


async def _ensure_topic_article(db: AsyncSession, topic: HotTopic) -> int:
    """热点不再创建普通文章锚点，避免串到普通文章页。"""
    topic.article_id = None
    _persist_hotspot_markdown(topic)
    return 0


async def create_hot_topics_from_sources(
    db: AsyncSession,
    run_date: Optional[date] = None,
    trigger_mode: str = "manual",
    source_overrides: Optional[List[Dict[str, str]]] = None,
    auto_publish: bool = False,
) -> Dict[str, Any]:
    await ensure_hotspot_settings(db)

    run_date = run_date or date.today()
    sources = source_overrides or await get_hotspot_sources_config(db)
    whitelist = await get_hotspot_whitelist_domains(db)
    prompt = await get_hotspot_analysis_prompt(db)

    setting_map = await _get_setting_map(db)
    daily_limit_setting = setting_map.get("hotspot_daily_limit")
    daily_limit = 8
    if daily_limit_setting and daily_limit_setting.value:
        try:
            daily_limit = max(1, min(30, int(daily_limit_setting.value)))
        except Exception:
            daily_limit = 8

    job = HotFetchJob(
        run_date=run_date,
        trigger_mode=trigger_mode,
        status="running",
        source_count=len(sources),
    )
    db.add(job)
    await db.flush()

    candidates: List[Dict[str, Any]] = []
    errors: List[str] = []

    for s in sources:
        try:
            if s.get("source_type", "rss") == "rss":
                items = await _fetch_rss_items(s)
            else:
                items = []
            candidates.extend(items)
        except Exception as e:
            errors.append(f"{s.get('source_name', '未知来源')}: {str(e)}")

    job.candidate_count = len(candidates)

    dedupe_seen: set[str] = set()
    selected: List[Dict[str, Any]] = []

    # 先按白名单过滤 + 去重
    for item in candidates:
        url = item["url"]
        if not _domain_allowed(url, whitelist):
            continue
        dedupe = _hash_for_dedupe(item["title"], url)
        if dedupe in dedupe_seen:
            continue
        dedupe_seen.add(dedupe)
        item["dedupe_hash"] = dedupe
        selected.append(item)
        if len(selected) >= daily_limit:
            break

    ai = OpenAIService()
    created_topic_ids: List[int] = []

    for item in selected:
        try:
            title = item["title"].strip()
            slug_base = slugify(title, lowercase=True, separator="-")[:180] or "hot-topic"
            slug = f"{slug_base}-{int(datetime.now().timestamp())}"[:220]

            summary = item.get("summary") or ""
            analysis_md, key_points = await _generate_analysis(
                ai,
                prompt,
                title,
                summary,
                item.get("source_name", "未知来源"),
                item["url"],
            )

            topic = HotTopic(
                topic_date=run_date,
                title=title,
                slug=slug,
                summary=summary,
                analysis_md=analysis_md,
                key_points_json=key_points,
                heat_score=75,
                status="published" if auto_publish else "draft",
                primary_category=DEFAULT_CATEGORY,
                published_at=datetime.now() if auto_publish else None,
            )
            db.add(topic)
            await db.flush()

            # 来源
            src = HotTopicSource(
                topic_id=topic.id,
                source_type=item.get("source_type", "rss"),
                source_name=item.get("source_name", "未知来源"),
                source_domain=item.get("source_domain") or _extract_domain(item["url"]),
                source_url=_normalize_url(item["url"]),
                original_title=title,
                content_snippet=summary,
                dedupe_hash=item.get("dedupe_hash"),
                quality_score=80,
            )
            db.add(src)

            # 默认标签
            tag_name = "AI热点"
            tag = await db.scalar(select(Tag).where(Tag.name == tag_name))
            if not tag:
                tag = Tag(name=tag_name, slug=slugify(tag_name, lowercase=True))
                db.add(tag)
                await db.flush()
            topic.tags.append(tag)

            # 评论锚点
            await _ensure_topic_article(db, topic)

            created_topic_ids.append(topic.id)
        except Exception as e:
            errors.append(f"topic_create:{item.get('title', 'unknown')} -> {str(e)}")

    job.selected_count = len(created_topic_ids)
    if errors and created_topic_ids:
        job.status = "partial"
    elif errors and not created_topic_ids:
        job.status = "failed"
    else:
        job.status = "success"
    job.error_message = "\n".join(errors) if errors else None
    job.finished_at = datetime.now()

    await db.commit()

    return {
        "job_id": job.id,
        "status": job.status,
        "source_count": job.source_count,
        "candidate_count": job.candidate_count,
        "selected_count": job.selected_count,
        "created_topic_ids": created_topic_ids,
        "errors": errors,
    }


async def list_hot_topics(
    db: AsyncSession,
    page: int,
    page_size: int,
    status_filter: Optional[str] = None,
    search: Optional[str] = None,
    tag: Optional[str] = None,
    source_domain: Optional[str] = None,
    topic_date: Optional[date] = None,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    primary_category: Optional[str] = None,
    sort: Optional[str] = None,
    admin_mode: bool = False,
):
    normalized_page = max(1, page)
    normalized_page_size = max(1, min(page_size or HOTSPOT_PAGE_SIZE_DEFAULT, HOTSPOT_PAGE_SIZE_MAX))
    normalized_sort = _normalize_sort(sort)

    base_query = select(HotTopic.id, HotTopic.heat_score, HotTopic.published_at, HotTopic.topic_date)
    requires_dedup = False

    if not admin_mode:
        base_query = base_query.where(HotTopic.status == "published")
    elif status_filter:
        base_query = base_query.where(HotTopic.status == status_filter)

    if search:
        like = f"%{search.strip()}%"
        base_query = base_query.where(
            or_(
                HotTopic.title.ilike(like),
                HotTopic.summary.ilike(like),
                HotTopic.analysis_md.ilike(like),
            )
        )

    if tag:
        requires_dedup = True
        base_query = base_query.join(HotTopic.tags).where(Tag.name == tag.strip())

    if source_domain:
        normalized_source = source_domain.strip().lower()
        if normalized_source == HOTSPOT_SOURCE_TYPE_MANUAL_BLOCK:
            base_query = base_query.where(HotTopic.id == -1)
        else:
            requires_dedup = True
            base_query = base_query.join(HotTopic.sources).where(
                or_(
                    HotTopicSource.source_domain == normalized_source,
                    HotTopicSource.source_type == normalized_source,
                )
            )

    if topic_date:
        base_query = base_query.where(HotTopic.topic_date == topic_date)
    if from_date:
        base_query = base_query.where(HotTopic.topic_date >= from_date)
    if to_date:
        base_query = base_query.where(HotTopic.topic_date <= to_date)
    if primary_category:
        base_query = base_query.where(HotTopic.primary_category == primary_category.strip())

    if requires_dedup:
        base_query = base_query.group_by(
            HotTopic.id,
            HotTopic.heat_score,
            HotTopic.published_at,
            HotTopic.topic_date,
        )

    if normalized_sort == "hottest":
        ordered_ids_query = base_query.order_by(
            HotTopic.heat_score.desc(),
            HotTopic.published_at.desc(),
            HotTopic.topic_date.desc(),
            HotTopic.id.desc(),
        )
    else:
        ordered_ids_query = base_query.order_by(
            HotTopic.published_at.desc(),
            HotTopic.topic_date.desc(),
            HotTopic.heat_score.desc(),
            HotTopic.id.desc(),
        )

    total = await db.scalar(select(func.count()).select_from(ordered_ids_query.order_by(None).subquery())) or 0

    offset = (normalized_page - 1) * normalized_page_size
    page_ids_result = await db.execute(ordered_ids_query.offset(offset).limit(normalized_page_size))
    page_rows = page_ids_result.all()
    page_ids = [row[0] for row in page_rows]

    if not page_ids:
        return [], int(total)

    query = (
        select(HotTopic)
        .options(selectinload(HotTopic.sources), selectinload(HotTopic.tags))
        .where(HotTopic.id.in_(page_ids))
    )
    result = await db.execute(query)
    items_by_id = {item.id: item for item in result.scalars().all()}
    ordered_items = [items_by_id[item_id] for item_id in page_ids if item_id in items_by_id]

    return ordered_items, int(total)


async def get_hot_topic_detail(db: AsyncSession, topic_id: int, admin_mode: bool = False) -> Optional[HotTopic]:
    result = await db.execute(
        select(HotTopic)
        .options(selectinload(HotTopic.sources), selectinload(HotTopic.tags))
        .where(HotTopic.id == topic_id)
    )
    topic = result.scalar_one_or_none()
    if not topic:
        return None
    if not admin_mode and topic.status != "published":
        return None

    if not admin_mode:
        topic.key_points_json = dict(topic.key_points_json or {})
        if topic.published_at:
            topic.key_points_json.setdefault(
                "last_modified",
                topic.updated_at.isoformat() if topic.updated_at else topic.published_at.isoformat(),
            )
            topic.key_points_json.setdefault("cache_max_age", HOTSPOT_DETAIL_MAX_AGE_SECONDS)

    return topic


async def create_hot_topic(
    db: AsyncSession,
    payload,
    created_by: Optional[int] = None,
):
    slug = (payload.slug or "").strip()
    if not slug:
        raise ValueError("slug 不能为空")

    existing = await db.scalar(select(HotTopic).where(HotTopic.slug == slug))
    if existing and payload.upsert_strategy != "update":
        raise ValueError("slug 已存在，请更换 slug 或使用 update 策略")

    if existing:
        topic = existing
    else:
        topic = HotTopic(
            topic_date=payload.topic_date,
            title=payload.title.strip(),
            slug=slug,
            summary=payload.summary,
            analysis_md=payload.analysis_md,
            key_points_json=payload.key_points_json or {},
            heat_score=payload.heat_score or 0,
            status="draft",
            primary_category=payload.primary_category,
            created_by=created_by,
        )
        db.add(topic)
        await db.flush()

    topic.topic_date = payload.topic_date
    topic.title = payload.title.strip()
    topic.slug = slug
    topic.summary = payload.summary
    topic.analysis_md = payload.analysis_md
    topic.key_points_json = payload.key_points_json or {}
    topic.heat_score = payload.heat_score or 0
    topic.primary_category = payload.primary_category

    source_items = payload.sources or []
    topic.sources.clear()
    for src in source_items:
        source_url = _normalize_url(src.source_url)
        topic.sources.append(
            HotTopicSource(
                source_type=src.source_type or "manual",
                source_name=src.source_name,
                source_domain=(src.source_domain or _extract_domain(source_url)) if source_url else src.source_domain,
                source_url=source_url,
                original_title=src.original_title,
                published_at=src.published_at,
                content_snippet=src.content_snippet,
                dedupe_hash=_hash_for_dedupe(src.original_title or payload.title, source_url),
                quality_score=src.quality_score or 0,
            )
        )

    topic.tags.clear()
    for name in payload.tag_names or []:
        cleaned = name.strip()
        if not cleaned:
            continue
        tag = await db.scalar(select(Tag).where(Tag.name == cleaned))
        if not tag:
            tag = Tag(name=cleaned, slug=slugify(cleaned, lowercase=True))
            db.add(tag)
            await db.flush()
        topic.tags.append(tag)

    final_status = payload.status if payload.status in {"draft", "published", "hidden"} else "draft"
    if payload.auto_publish:
        final_status = "published"
    topic.status = final_status
    if final_status == "published":
        topic.published_at = payload.published_at or topic.published_at or datetime.now()
    elif payload.published_at is not None:
        topic.published_at = payload.published_at

    topic.article_id = None
    archive_path = _persist_hotspot_markdown(topic)
    if topic.key_points_json is None:
        topic.key_points_json = {}
    if isinstance(topic.key_points_json, dict):
        topic.key_points_json.setdefault("archive_markdown_path", archive_path)
        topic.key_points_json.setdefault("pipeline_state", "published" if final_status == "published" else "draft_ready")
        topic.key_points_json.setdefault("publish_pending", final_status != "published")

    await db.commit()
    await db.refresh(topic)
    return topic


async def update_hot_topic(
    db: AsyncSession,
    topic: HotTopic,
    title: Optional[str] = None,
    summary: Optional[str] = None,
    analysis_md: Optional[str] = None,
    key_points_json: Optional[Dict[str, Any]] = None,
    heat_score: Optional[float] = None,
    primary_category: Optional[str] = None,
    tag_names: Optional[List[str]] = None,
    status: Optional[str] = None,
    published_at: Optional[datetime] = None,
):
    if title is not None:
        topic.title = title.strip()
    if summary is not None:
        topic.summary = summary
    if analysis_md is not None:
        topic.analysis_md = analysis_md
    if key_points_json is not None:
        topic.key_points_json = key_points_json
    if heat_score is not None:
        topic.heat_score = heat_score
    if primary_category is not None:
        topic.primary_category = primary_category

    if status is not None:
        topic.status = status
        if status == "published":
            topic.published_at = published_at or topic.published_at or datetime.now()

    if published_at is not None:
        topic.published_at = published_at

    if tag_names is not None:
        topic.tags.clear()
        for name in tag_names:
            cleaned = name.strip()
            if not cleaned:
                continue
            tag = await db.scalar(select(Tag).where(Tag.name == cleaned))
            if not tag:
                tag = Tag(name=cleaned, slug=slugify(cleaned, lowercase=True))
                db.add(tag)
                await db.flush()
            topic.tags.append(tag)

    # 热点不得同步到普通文章，确保 article_id 保持为空
    topic.article_id = None

    archive_path = _persist_hotspot_markdown(topic)
    if topic.key_points_json is None:
        topic.key_points_json = {}
    if isinstance(topic.key_points_json, dict):
        topic.key_points_json["archive_markdown_path"] = archive_path

    await db.commit()
    await db.refresh(topic)
    return topic


async def publish_hot_topic(db: AsyncSession, topic: HotTopic, published_at: Optional[datetime] = None):
    topic.status = "published"
    topic.published_at = published_at or datetime.now()
    await _ensure_topic_article(db, topic)
    topic.article_id = None

    archive_path = _persist_hotspot_markdown(topic)
    if topic.key_points_json is None:
        topic.key_points_json = {}
    if isinstance(topic.key_points_json, dict):
        topic.key_points_json["archive_markdown_path"] = archive_path

    await db.commit()
    await db.refresh(topic)
    return topic


async def hide_hot_topic(db: AsyncSession, topic: HotTopic):
    topic.status = "hidden"
    await db.commit()
    await db.refresh(topic)
    return topic


async def list_hot_jobs(db: AsyncSession, page: int, page_size: int):
    query = select(HotFetchJob).order_by(HotFetchJob.id.desc())

    total_result = await db.execute(select(HotFetchJob.id).from_statement(query.with_only_columns(HotFetchJob.id).order_by(None)))
    total = len(total_result.scalars().all())

    offset = (page - 1) * page_size
    result = await db.execute(query.offset(offset).limit(page_size))
    items = result.scalars().all()
    return items, total
