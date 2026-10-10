#!/usr/bin/env python3
"""拉取 AIHOT 日报与精选，生成前端静态数据。

2026-10-08 自旧接口迁移到 v1（旧 /api/public/* 与旧域名 2026-10-31 停用）：
  - https://aihot.news/api/v1/dailies/latest —— 日报在响应顶层 report 里
  - https://aihot.news/api/v1/items —— take→limit、字段 title_en→originalTitle、
    url→links.original、source→source.name、顶层 hasNext/nextCursor→page.*
  - 输出 JSON 的结构保持前端契约（frontend/src/api/aiDaily.ts 的 interface）
    不变，v1 的嵌套结构在 adapt_* 里降级成旧的扁平字段
  - 按官方建议启用 gzip 压缩与 If-None-Match/304（仅日报：一天一期，
    cron 每 30 分钟轮询时绝大多数是 304）；迁移后不复用任何旧 ETag
  - User-Agent 不再伪装浏览器，按官方格式如实标识
"""
from __future__ import annotations

import datetime as dt
import gzip
import json
import os
import sys
import urllib.parse
import urllib.error
import urllib.request
from pathlib import Path

API = 'https://aihot.news/api/v1/dailies/latest'
ITEMS_API = 'https://aihot.news/api/v1/items'
UA = 'aihot-api/2.0.0 qianxi-blog-ai-daily/2.0'
SOURCE_URL = 'https://aihot.news/'
REPO_ROOT = Path(__file__).resolve().parents[1]
DATA_ROOT = Path(os.environ.get('AI_DAILY_DATA_ROOT', REPO_ROOT / 'frontend' / 'public' / 'data'))
OUT = DATA_ROOT / 'ai-daily.json'
SELECTED_OUT = DATA_ROOT / 'ai-selected.json'
DAILY_DIR = DATA_ROOT / 'ai-daily'
INDEX_OUT = DATA_ROOT / 'ai-daily-index.json'
TOPICS_OUT = DATA_ROOT / 'ai-daily-topics.json'
ARCHIVE = Path(os.environ.get('AI_DAILY_ARCHIVE_DIR', DAILY_DIR))
LOG = Path(os.environ.get('AI_DAILY_LOG', REPO_ROOT / 'logs' / 'ai_daily_fetch.log'))
STATE = LOG.parent / 'ai-daily-state.json'

# 十六期：与 AIHOT 官方归档窗口对齐，本地同样只滚动保留 30 天成稿。
# （AIHOT 的 /dailies 只开放 30 天历史，更早的源头已不可回填——归档页改按主题组织，
#  ai-daily-topics.json 由本脚本在每次抓取后聚合重建。）
KEEP_DAYS = 30

CATEGORIES = [
    ('all', '全部', None),
    ('ai-models', '模型', 'ai-models'),
    ('ai-products', '产品', 'ai-products'),
    ('industry', '行业', 'industry'),
    ('paper', '论文', 'paper'),
    ('tip', '技巧', 'tip'),
]


def now_bj() -> str:
    return dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).isoformat()


def log(msg: str) -> None:
    LOG.parent.mkdir(parents=True, exist_ok=True)
    with LOG.open('a', encoding='utf-8') as f:
        f.write(f'[{now_bj()}] {msg}\n')


def _load_state() -> dict:
    try:
        return json.loads(STATE.read_text(encoding='utf-8'))
    except Exception:
        return {}


def _save_state(state: dict) -> None:
    try:
        STATE.parent.mkdir(parents=True, exist_ok=True)
        STATE.write_text(json.dumps(state, ensure_ascii=False), encoding='utf-8')
    except Exception as exc:  # 状态存不进去只影响省流量，不阻断抓取
        log(f'warn state-save-failed {exc}')


def _get_json(url: str, etag: str | None = None) -> tuple[int, dict | None, object]:
    """GET JSON，开 gzip，支持 If-None-Match。

    返回 (status, body, headers)：304 时 body 为 None。
    headers 直接返回 HTTPMessage（大小写不敏感容器）——转成 dict 会把
    'Etag' 固定成某个大小写，按 'ETag' 取就拿不到（nginx 实发 'Etag'）。
    urllib 会把 304 抛成 HTTPError，这里统一接住。
    """
    headers = {
        'User-Agent': UA,
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
    }
    if etag:
        headers['If-None-Match'] = etag
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            status = resp.status
            raw = resp.read()
            resp_headers = resp.headers
    except urllib.error.HTTPError as e:
        if e.code == 304:
            return 304, None, e.headers
        raise
    if resp_headers.get('Content-Encoding') == 'gzip':
        raw = gzip.decompress(raw)
    return status, json.loads(raw.decode('utf-8')), resp_headers


def _adapt_attribution(attr: dict | None) -> dict | None:
    """v1 {name,url} → 旧存档格式 {source,canonical}。"""
    if not isinstance(attr, dict):
        return None
    return {'source': attr.get('name'), 'canonical': attr.get('url')}


def _adapt_content_item(item: dict) -> dict:
    """日报/快讯条目：v1 嵌套结构 → 前端契约的扁平字段。"""
    links = item.get('links') or {}
    source = item.get('source') or {}
    return {
        'title': item.get('title'),
        'summary': item.get('summary') or '',
        'sourceName': source.get('name'),
        'sourceUrl': links.get('original'),
        'permalink': links.get('aihot'),
        'attribution': _adapt_attribution(item.get('attribution')),
    }


def fetch() -> dict | None:
    """最新日报。304（内容没变）时返回 None，调用方跳过日报写入。"""
    state = _load_state()
    status, data, headers = _get_json(API, etag=state.get('daily_etag'))
    if status == 304:
        return None

    report = (data or {}).get('report') or {}
    if not report.get('date') or not isinstance(report.get('sections'), list):
        raise RuntimeError('AIHOT v1 daily payload shape invalid (report.date/report.sections missing)')

    sections = []
    for section in report.get('sections') or []:
        sections.append({
            'label': section.get('label'),
            'items': [_adapt_content_item(i) for i in section.get('items') or []],
        })
    flashes = []
    for flash in report.get('flashes') or []:
        adapted = _adapt_content_item(flash)
        adapted['publishedAt'] = flash.get('publishedAt')
        flashes.append(adapted)

    daily = {
        'date': report.get('date'),
        'generatedAt': report.get('generatedAt'),
        'windowStart': report.get('windowStart'),
        'windowEnd': report.get('windowEnd'),
        'lead': report.get('lead'),
        'sections': sections,
        'flashes': flashes,
        'attribution': _adapt_attribution(report.get('attribution')),
        'fetchedAt': now_bj(),
        'source': 'AI HOT',
        'sourceUrl': SOURCE_URL,
    }

    new_etag = headers.get('ETag') or headers.get('etag')
    if new_etag:
        state['daily_etag'] = new_etag
        _save_state(state)
    return daily


def fetch_items(category: str | None = None, limit: int = 80) -> dict:
    """精选条目。window 用 v1 默认（7 天，与旧接口的全量精选语义最接近）；
    v1 拒绝一切未声明参数，所以除 mode/limit/category 外什么都不加。"""
    params = {'mode': 'selected', 'limit': str(limit)}
    if category:
        params['category'] = category
    url = f"{ITEMS_API}?{urllib.parse.urlencode(params)}"
    status, data, _ = _get_json(url)
    if not isinstance(data, dict) or not isinstance(data.get('items'), list):
        raise RuntimeError('AIHOT v1 items payload shape invalid')
    return data


def normalize_item(item: dict) -> dict:
    """输出字段名保持前端契约（aiDaily.ts AiSelectedItem），读取路径迁到 v1。"""
    links = item.get('links') or {}
    source = item.get('source') or {}
    return {
        'id': item.get('id'),
        'title': item.get('title'),
        'titleEn': item.get('originalTitle'),
        'url': links.get('original'),
        'source': source.get('name'),
        'publishedAt': item.get('publishedAt'),
        'summary': item.get('summary'),
        'category': item.get('category'),
        'score': item.get('score'),
        'selected': item.get('selected'),
    }


def fetch_selected_payload() -> dict:
    fetched_at = now_bj()
    categories = []
    latest_items: list[dict] = []
    for key, label, api_category in CATEGORIES:
        data = fetch_items(api_category, limit=100 if key == 'all' else 60)
        page = data.get('page') or {}
        items = [normalize_item(item) for item in data.get('items') or [] if item.get('title')]
        items = [i for i in items if i.get('url')]
        categories.append({
            'key': key,
            'label': label,
            'apiCategory': api_category,
            'count': len(items),
            'hasNext': bool(page.get('hasMore')),
            'nextCursor': page.get('nextCursor'),
            'items': items,
        })
        if key == 'all':
            latest_items = items
    return {
        'fetchedAt': fetched_at,
        'source': 'AI HOT',
        'sourceUrl': f'{SOURCE_URL}?page=1',
        'mode': 'selected',
        'categories': categories,
        'items': latest_items,
        'total': len(latest_items),
    }


def write_atomic(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + '.tmp')
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    tmp.replace(path)


def build_index() -> dict:
    ARCHIVE.mkdir(parents=True, exist_ok=True)
    by_month: dict[str, list[dict]] = {}
    for item in ARCHIVE.glob('*.json'):
        try:
            data = json.loads(item.read_text(encoding='utf-8'))
        except Exception:
            continue
        date_value = str(data.get('date') or item.stem)
        month = date_value[:7]
        if len(month) == 7:
            by_month.setdefault(month, []).append({'date': date_value, 'label': date_value[5:] if len(date_value) >= 10 else date_value, 'path': f'/data/ai-daily/{date_value}.json'})
    months = []
    for month, days in sorted(by_month.items(), reverse=True):
        year, mon = month.split('-')
        days = sorted(days, key=lambda x: x['date'], reverse=True)
        months.append({'month': month, 'label': f'{year} 年 {int(mon)} 月', 'count': len(days), 'days': days})
    return {'updatedAt': now_bj(), 'total': sum(len(days) for days in by_month.values()), 'months': months}


def prune_old_dailies(keep_days: int = KEEP_DAYS) -> list[str]:
    """滚动窗口清理：删除超过 keep_days 的历史日报（与 AIHOT 官方 30 天归档对齐）。

    ISO 日期字符串的字典序 == 时间序，直接字符串比较。
    cron 每 30 分钟都会跑到这里——即使当天日报是 304 未更新，
    30 天边界的滚动清理也不能停。
    """
    cutoff = (dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).date() - dt.timedelta(days=keep_days)).isoformat()
    removed = []
    for item in DAILY_DIR.glob('*.json'):
        if item.stem < cutoff:
            item.unlink(missing_ok=True)
            removed.append(item.stem)
    if ARCHIVE != DAILY_DIR:
        for item in ARCHIVE.glob('*.json'):
            if item.stem < cutoff:
                item.unlink(missing_ok=True)
    if removed:
        log(f'prune keepDays={keep_days} removed={sorted(removed)}')
    return removed


def build_topics(limit_per_topic: int = 30) -> dict:
    """按 section.label（AIHOT 自带的主题分类）聚合滚动窗口内的日报条目。

    归档页的"AI 日报 · 按主题"视图直接消费这个静态文件——30 天窗口内
    每天最多十几条、每主题截最近 30 条，文件体积可控。
    """
    by_topic: dict[str, list[dict]] = {}
    total = 0
    for item in sorted(DAILY_DIR.glob('*.json'), reverse=True):
        try:
            data = json.loads(item.read_text(encoding='utf-8'))
        except Exception:
            continue
        date_value = str(data.get('date') or item.stem)
        for section in data.get('sections') or []:
            label = (section.get('label') or '其他').strip() or '其他'
            for entry in section.get('items') or []:
                title = entry.get('title')
                if not title:
                    continue
                by_topic.setdefault(label, []).append({
                    'date': date_value,
                    'title': title,
                    'summary': (entry.get('summary') or '')[:160],
                    'sourceName': entry.get('sourceName'),
                    'sourceUrl': entry.get('sourceUrl'),
                })
                total += 1
    topics = []
    for label, items in sorted(by_topic.items(), key=lambda kv: -len(kv[1])):
        items.sort(key=lambda x: x['date'], reverse=True)
        topics.append({'label': label, 'count': len(items), 'items': items[:limit_per_topic]})
    return {'updatedAt': now_bj(), 'total': total, 'topics': topics}


def main() -> None:
    prune_old_dailies()
    daily = fetch()
    selected = fetch_selected_payload()
    daily_skipped = daily is None
    if daily is not None:
        write_atomic(OUT, daily)
        ARCHIVE.mkdir(parents=True, exist_ok=True)
        write_atomic(ARCHIVE / f"{daily['date']}.json", daily)
        write_atomic(DAILY_DIR / f"{daily['date']}.json", daily)
    # 十六期：index 与主题索引无条件重建——prune 可能已删除文件，
    # 且 304（未更新）时滚动窗口同样要维持
    index = build_index()
    write_atomic(INDEX_OUT, index)
    topics = build_topics()
    write_atomic(TOPICS_OUT, topics)
    write_atomic(SELECTED_OUT, selected)
    if daily_skipped:
        log(f"ok not_modified selectedItems={selected.get('total')} selectedCategories={len(selected.get('categories') or [])} dailies={index.get('total')} topics={topics.get('total')}")
        print(json.dumps({'ok': True, 'notModified': True, 'selectedItems': selected.get('total'), 'dailies': index.get('total'), 'topics': topics.get('total')}, ensure_ascii=False))
        return
    items = sum(len(s.get('items') or []) for s in daily.get('sections') or [])
    log(f"ok date={daily.get('date')} sections={len(daily.get('sections') or [])} items={items} selectedItems={selected.get('total')} selectedCategories={len(selected.get('categories') or [])} dailies={index.get('total')} topics={topics.get('total')}")
    print(json.dumps({'ok': True, 'date': daily.get('date'), 'sections': len(daily.get('sections') or []), 'items': items, 'selectedItems': selected.get('total'), 'selectedCategories': len(selected.get('categories') or []), 'dailies': index.get('total'), 'topics': topics.get('total'), 'out': str(OUT), 'selectedOut': str(SELECTED_OUT)}, ensure_ascii=False))


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        log(f'error {exc}')
        print(json.dumps({'ok': False, 'error': str(exc)}, ensure_ascii=False), file=sys.stderr)
        raise
