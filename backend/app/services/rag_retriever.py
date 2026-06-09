"""
轻量 RAG 检索器（非向量检索）

设计目标：不依赖向量库、embedding 或 reranker，用类似 Claude Code/Codex 的
agentic 检索方式增强召回：关键词扩展、多字段打分、块级命中定位、返回可继续读取的证据位置。
"""

from __future__ import annotations

import math
import re
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..core.config import settings
from ..models.article import Article, Tag


_STOPWORDS = {
    "the", "and", "for", "with", "this", "that", "from", "into", "your",
    "about", "what", "how", "why", "where", "when", "can", "could", "should",
    "is", "are", "was", "were", "be", "to", "of", "in", "on", "a", "an",
    "我", "你", "他", "她", "它", "我们", "你们", "他们", "以及", "关于", "如何",
    "为什么", "是什么", "怎么", "哪些", "是否", "可以", "需要", "一些", "一个",
    "这个", "那个", "里面", "博客", "文章", "解释", "一下", "什么", "区别", "联系",
}

_SYNONYMS = {
    "rag": ["retrieval", "检索增强", "检索", "知识库", "召回", "chunk", "上下文"],
    "agent": ["智能体", "代理", "工具调用", "tool", "规划", "执行"],
    "agents": ["智能体", "代理", "工具调用", "tool", "规划", "执行"],
    "llm": ["大模型", "语言模型", "模型", "推理", "上下文"],
    "ai": ["人工智能", "大模型", "模型"],
    "openai": ["chatgpt", "gpt"],
    "claude": ["anthropic"],
    "codex": ["代码", "编程", "agent"],
    "向量": ["embedding", "vector", "语义检索"],
    "检索": ["搜索", "召回", "查找", "retrieval", "search"],
    "缓存": ["cache", "kv", "prefix", "复用"],
    "推理": ["inference", "reasoning", "服务", "serving"],
    "训练": ["training", "pretraining", "post-training", "微调", "sft", "rlhf"],
}


def _extract_keywords(text: str) -> List[str]:
    tokens = re.findall(r"[A-Za-z0-9_+\-.]{2,}|[\u4e00-\u9fff]{2,}", text or "")
    keywords: List[str] = []
    for token in tokens:
        token_lower = token.lower().strip(".,;:!?()[]{}<>，。；：！？（）【】《》")
        if not token_lower or token_lower in _STOPWORDS:
            continue
        if token_lower not in keywords:
            keywords.append(token_lower)
    return keywords


def expand_keywords(text: str, max_terms: int = 24) -> List[str]:
    """轻量 query rewrite：保留用户原词，并补少量人工同义词。"""
    keywords = _extract_keywords(text)
    expanded: List[str] = []
    for kw in keywords:
        if kw not in expanded:
            expanded.append(kw)
        for extra in _SYNONYMS.get(kw, []):
            extra_l = extra.lower()
            if extra_l not in expanded:
                expanded.append(extra_l)
        if len(expanded) >= max_terms:
            break
    return expanded[:max_terms]


def _strip_markdown(text: str) -> str:
    if not text:
        return ""
    text = re.sub(r"```[\s\S]*?```", " ", text)
    text = re.sub(r"`([^`]*)`", r"\1", text)
    text = re.sub(r"!\[[^\]]*\]\([^\)]*\)", " ", text)
    text = re.sub(r"\[([^\]]*)\]\([^\)]*\)", r"\1", text)
    text = re.sub(r"^#+\s*", "", text, flags=re.MULTILINE)
    text = re.sub(r"^>+\s*", "", text, flags=re.MULTILINE)
    text = re.sub(r"\*\*([^*]+)\*\*", r"\1", text)
    text = re.sub(r"[_*#>-]", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def _build_article_url(article: Article) -> str:
    base = settings.SITE_URL.rstrip("/")
    if article.slug:
        return f"{base}/#/article/{article.slug}"
    return f"{base}/#/articles/{article.id}"


def _field_count(text: Optional[str], keywords: Sequence[str]) -> int:
    haystack = (text or "").lower()
    return sum(haystack.count(kw) for kw in keywords if kw)


def _score_article(article: Article, keywords: Sequence[str]) -> int:
    title_score = _field_count(article.title, keywords) * 18
    summary_score = _field_count(article.summary, keywords) * 8
    content_score = _field_count(article.content_md, keywords) * 2
    category_score = _field_count(article.category, keywords) * 10
    tag_score = sum(_field_count(tag.name, keywords) * 12 for tag in (article.tags or []))

    # 新文章略微加权，但不盖过相关性。
    recency_score = 0
    if article.published_at:
        recency_score = 2

    return title_score + summary_score + content_score + category_score + tag_score + recency_score


def _split_blocks(markdown: str, target_chars: int = 900, overlap: int = 120) -> List[Dict[str, Any]]:
    """把文章切为可定位证据块，保留字符 offset。"""
    text = markdown or ""
    if not text:
        return []

    parts: List[Tuple[int, str]] = []
    cursor = 0
    for match in re.finditer(r"\n(?=#{1,6}\s)|\n\s*\n", text):
        end = match.start()
        chunk = text[cursor:end].strip()
        if chunk:
            parts.append((cursor, chunk))
        cursor = match.end()
    tail = text[cursor:].strip()
    if tail:
        parts.append((cursor, tail))

    blocks: List[Dict[str, Any]] = []
    for start, part in parts:
        if len(part) <= target_chars * 1.4:
            blocks.append({"start": start, "end": start + len(part), "text": part})
            continue
        local = 0
        while local < len(part):
            local_end = min(len(part), local + target_chars)
            window = part[local:local_end]
            blocks.append({"start": start + local, "end": start + local_end, "text": window})
            if local_end >= len(part):
                break
            local = max(local_end - overlap, local + 1)

    return blocks


def _best_blocks(markdown: str, keywords: Sequence[str], limit: int = 3) -> List[Dict[str, Any]]:
    blocks = _split_blocks(markdown)
    ranked: List[Dict[str, Any]] = []
    for idx, block in enumerate(blocks):
        plain = _strip_markdown(block["text"])
        if not plain:
            continue
        score = _field_count(plain, keywords)
        heading_bonus = 0
        first_line = block["text"].splitlines()[0] if block["text"].splitlines() else ""
        if first_line.lstrip().startswith("#"):
            heading_bonus = 2
        score = score * 5 + heading_bonus
        if score <= 0:
            continue
        snippet = plain[:420]
        ranked.append({
            "block_index": idx,
            "start": block["start"],
            "end": block["end"],
            "score": score,
            "snippet": snippet,
        })
    ranked.sort(key=lambda item: item["score"], reverse=True)
    return ranked[:limit]


async def search_articles(
    db: AsyncSession,
    query: str,
    top_k: int = 5,
    candidate_limit: int = 80,
) -> List[Dict[str, Any]]:
    keywords = expand_keywords(query)
    if not keywords:
        return []

    conditions = []
    for kw in keywords:
        like = f"%{kw}%"
        conditions.append(Article.title.ilike(like))
        conditions.append(Article.summary.ilike(like))
        conditions.append(Article.content_md.ilike(like))
        conditions.append(Article.category.ilike(like))
        conditions.append(Tag.name.ilike(like))

    stmt = (
        select(Article)
        .options(selectinload(Article.tags))
        .outerjoin(Article.tags)
        .where(Article.status == "published")
        .where(or_(*conditions))
        .order_by(Article.published_at.is_(None), Article.published_at.desc(), Article.created_at.desc())
        .limit(candidate_limit)
    )
    result = await db.execute(stmt)
    articles = list(dict.fromkeys(result.scalars().all()))

    ranked: List[Dict[str, Any]] = []
    for article in articles:
        score = _score_article(article, keywords)
        blocks = _best_blocks(article.content_md or "", keywords, limit=3)
        if blocks:
            score += sum(block["score"] for block in blocks[:2])
        if score <= 0:
            continue
        snippet_source = article.summary or (blocks[0]["snippet"] if blocks else _strip_markdown(article.content_md or ""))
        snippet = snippet_source[:520]
        ranked.append({
            "id": article.id,
            "title": article.title,
            "slug": article.slug or "",
            "url": _build_article_url(article),
            "category": article.category or "",
            "tags": [tag.name for tag in (article.tags or [])],
            "snippet": snippet,
            "score": score,
            "matched_blocks": blocks,
        })

    ranked.sort(key=lambda item: item["score"], reverse=True)
    return ranked[:top_k]


async def search_article_blocks(
    db: AsyncSession,
    query: str,
    top_k: int = 8,
    article_limit: int = 40,
) -> List[Dict[str, Any]]:
    """跨文章返回最相关正文块。适合作为代码 agent 里的 grep/search。"""
    keywords = expand_keywords(query)
    if not keywords:
        return []

    articles = await search_articles(db, query, top_k=article_limit, candidate_limit=120)
    results: List[Dict[str, Any]] = []
    for item in articles:
        stmt = select(Article).options(selectinload(Article.tags)).where(Article.id == int(item["id"]))
        result = await db.execute(stmt)
        article = result.scalar_one_or_none()
        if not article:
            continue
        blocks = _best_blocks(article.content_md or "", keywords, limit=4)
        for block in blocks:
            results.append({
                "article_id": article.id,
                "title": article.title,
                "slug": article.slug or "",
                "url": _build_article_url(article),
                "category": article.category or "",
                "tags": [tag.name for tag in (article.tags or [])],
                **block,
            })
    results.sort(key=lambda item: item["score"], reverse=True)
    return results[:top_k]


def slice_text_around(markdown: str, start: int, max_chars: int = 5000) -> Dict[str, Any]:
    text = markdown or ""
    if not text:
        return {"content": "", "start": 0, "end": 0, "truncated_before": False, "truncated_after": False}
    max_chars = max(500, min(max_chars, 16000))
    start = max(0, min(int(start or 0), len(text)))
    half = max_chars // 2
    left = max(0, start - half)
    right = min(len(text), left + max_chars)
    if right - left < max_chars:
        left = max(0, right - max_chars)
    return {
        "content": text[left:right],
        "start": left,
        "end": right,
        "truncated_before": left > 0,
        "truncated_after": right < len(text),
    }


def format_rag_context(items: List[Dict[str, Any]]) -> str:
    if not items:
        return ""
    lines: List[str] = ["以下是可参考的博客文章资料："]
    for idx, item in enumerate(items, start=1):
        lines.append(f"[{idx}] 标题: {item['title']}")
        lines.append(f"链接: {item['url']}")
        if item.get("snippet"):
            lines.append(f"摘要: {item['snippet']}")
    return "\n".join(lines)
