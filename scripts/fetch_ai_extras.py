#!/usr/bin/env python3
"""拉取 AIHOT 周报 / 月报 / 热榜 / 额度重置，生成前端静态数据。

与 fetch_ai_daily.py 同源（AIHOT v1 JSON 接口，匿名只读），但独立成脚本，
避免动到已经在跑的日报链路。每个数据源单独 try/except：某一源失败时保留旧文件，
其余源照常更新。

输出（AI_EXTRAS_DATA_ROOT，默认 frontend/public/data）：
  ai-weekly.json   —— 最新周报 + 最近 12 期列表；归档 ai-weekly/<week>.json
  ai-monthly.json  —— 最新月报 + 最近 12 期列表；归档 ai-monthly/<month>.json
  ai-hot.json      —— AIHOT 热榜 Top10
  ai-resets.json   —— Codex / Claude / Antigravity / Grok Bot 额度重置事件
"""
from __future__ import annotations

import datetime as dt
import gzip
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

BASE = 'https://aihot.news/api/v1'
UA = 'aihot-api/2.0.0 qianxi-blog-extras/1.0'
SOURCE_URL = 'https://aihot.news/'
REPO_ROOT = Path(__file__).resolve().parents[1]
DATA_ROOT = Path(os.environ.get('AI_EXTRAS_DATA_ROOT', REPO_ROOT / 'frontend' / 'public' / 'data'))
LOG = Path(os.environ.get('AI_EXTRAS_LOG', REPO_ROOT / 'logs' / 'ai_extras_fetch.log'))
KEEP_ISSUES = 12
RESET_SOURCES = [
    ('codex', 'Codex', 'codex-resets'),
    ('claude', 'Claude', 'claude-resets'),
    ('antigravity', 'Antigravity', 'antigravity-resets'),
    ('grok-bot', 'Grok Bot', 'grok-bot-resets'),
]
RESET_EVENT_LIMIT = 30


def now_bj() -> str:
    return dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).isoformat()


def log(msg: str) -> None:
    LOG.parent.mkdir(parents=True, exist_ok=True)
    with LOG.open('a', encoding='utf-8') as f:
        f.write(f'[{now_bj()}] {msg}\n')


def _get_json(url: str, retries: int = 1) -> dict:
    """GET JSON。429 立即抛出（调用方降级），5xx/超时重试一次。"""
    req = urllib.request.Request(url, headers={
        'User-Agent': UA,
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
    })
    last_error = None
    for attempt in range(retries + 1):
        try:
            with urllib.request.urlopen(req, timeout=45) as resp:
                raw = resp.read()
                if resp.headers.get('Content-Encoding') == 'gzip':
                    raw = gzip.decompress(raw)
            return json.loads(raw.decode('utf-8'))
        except urllib.error.HTTPError as exc:
            last_error = exc
            if exc.code == 429 or exc.code < 500:
                raise
            if attempt < retries:
                time.sleep(3)
        except (urllib.error.URLError, TimeoutError) as exc:
            last_error = exc
            if attempt < retries:
                time.sleep(3)
    raise last_error  # type: ignore[misc]


def write_atomic(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + '.tmp')
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    tmp.replace(path)


def _links(value: dict | None) -> dict:
    value = value or {}
    return {'aihot': value.get('aihot'), 'original': value.get('original')}


def _adapt_period_item(item: dict) -> dict:
    source = item.get('source') or {}
    links = item.get('links') or {}
    return {
        'title': item.get('title'),
        'summary': item.get('summary') or '',
        'sourceName': source.get('name'),
        'sourceUrl': links.get('original'),
        'aihotUrl': links.get('aihot'),
        'publishedAt': item.get('publishedAt'),
    }


def _adapt_period(report: dict, kind: str, key: str) -> dict:
    sections = []
    for section in report.get('sections') or []:
        sections.append({
            'label': section.get('label') or '',
            'summary': section.get('summary') or '',
            'items': [_adapt_period_item(i) for i in section.get('items') or []],
        })
    return {
        'kind': kind,
        'key': key,
        'periodStart': report.get('periodStart'),
        'periodEnd': report.get('periodEnd'),
        'generatedAt': report.get('generatedAt'),
        'windowStart': report.get('windowStart'),
        'windowEnd': report.get('windowEnd'),
        'headline': report.get('headline'),
        'overview': report.get('overview'),
        'sections': sections,
        'links': _links(report.get('links')),
    }


def fetch_period(kind: str, path: str, key_field: str) -> dict:
    latest = _get_json(f'{BASE}/{path}/latest')
    report = latest.get('report') or {}
    key = report.get(key_field)
    if not key:
        raise RuntimeError(f'{path}: report.{key_field} missing')

    listing = _get_json(f'{BASE}/{path}?limit={KEEP_ISSUES}')
    issues = []
    for entry in listing.get('items') or []:
        entry_key = entry.get(key_field)
        if not entry_key:
            continue
        issues.append({
            'key': entry_key,
            'periodStart': entry.get('periodStart'),
            'periodEnd': entry.get('periodEnd'),
            'generatedAt': entry.get('generatedAt'),
            'headline': entry.get('headline'),
            'links': _links(entry.get('links')),
        })

    archive_dir = DATA_ROOT / f'ai-{kind}'
    archive_dir.mkdir(parents=True, exist_ok=True)
    write_atomic(archive_dir / f'{key}.json', _adapt_period(report, kind, key))
    # 滚动保留最近 KEEP_ISSUES 期（key 形如 2026-W45 / 2026-11，字典序即时间序）
    for old in sorted(archive_dir.glob('*.json'), reverse=True)[KEEP_ISSUES:]:
        old.unlink(missing_ok=True)

    return {
        'updatedAt': now_bj(),
        'source': 'AIHOT',
        'sourceUrl': f'{SOURCE_URL}{kind}',
        'latest': _adapt_period(report, kind, key),
        'issues': issues,
    }


def fetch_hot() -> dict:
    data = _get_json(f'{BASE}/hot-topics')
    items = []
    for item in data.get('items') or []:
        source = item.get('source') or {}
        links = item.get('links') or {}
        items.append({
            'rank': item.get('rank'),
            'id': item.get('id'),
            'title': item.get('title'),
            'sourceName': source.get('name'),
            'sourceCount': item.get('sourceCount'),
            'signalCount': item.get('signalCount'),
            'participantCount': item.get('participantCount'),
            'latestAt': item.get('latestAt'),
            'aihotUrl': links.get('aihot'),
            'originalUrl': links.get('original'),
            'storyUrl': links.get('story'),
        })
    return {
        'updatedAt': now_bj(),
        'source': 'AIHOT',
        'sourceUrl': f'{SOURCE_URL}hot',
        'count': len(items),
        'items': items,
    }


def _adapt_reset_events(data: dict) -> list:
    events = []
    for event in data.get('events') or []:
        presentation = event.get('presentation') or {}
        posts = []
        for post in event.get('posts') or []:
            posts.append({
                'author': post.get('author'),
                'publishedAt': post.get('publishedAt'),
                'text': post.get('text') or post.get('fullText') or '',
                'url': post.get('url'),
            })
        events.append({
            'id': event.get('id'),
            'type': event.get('type'),
            'displayLabel': event.get('displayLabel') or event.get('label'),
            'status': event.get('status'),
            'presentationStatus': presentation.get('status'),
            'title': event.get('title'),
            'scope': event.get('scope'),
            'occurredOn': event.get('occurredOn'),
            'confirmedAt': event.get('confirmedAt'),
            'updatedAt': event.get('updatedAt'),
            'url': event.get('url'),
            'posts': posts,
        })
    return events


def _merge_events(old: list, new: list, limit: int) -> list:
    merged = {event.get('id') or f"idx-{i}": event for i, event in enumerate(new)}
    for event in old:
        key = event.get('id')
        if key and key not in merged:
            merged[key] = event
    ordered = sorted(
        merged.values(),
        key=lambda e: e.get('updatedAt') or e.get('occurredOn') or e.get('confirmedAt') or '',
        reverse=True,
    )
    return ordered[:limit]


def fetch_resets() -> dict:
    previous = {}
    try:
        previous_payload = json.loads((DATA_ROOT / 'ai-resets.json').read_text(encoding='utf-8'))
        previous = {source.get('key'): source for source in previous_payload.get('sources') or []}
    except Exception:
        previous = {}

    sources = []
    for index, (key, label, path) in enumerate(RESET_SOURCES):
        if index:
            time.sleep(0.5)  # 四个源连续请求容易触发 429
        partial = False
        try:
            data = _get_json(f'{BASE}/{path}')
        except urllib.error.HTTPError as exc:
            if exc.code != 429:
                raise
            # 完整历史限流「每客户端 10 分钟一次」——降级 recent，并与旧数据合并
            data = _get_json(f'{BASE}/{path}/recent')
            partial = True
            log(f'resets {key}: history 429, fallback to recent')
        events = _adapt_reset_events(data)
        if partial:
            events = _merge_events((previous.get(key) or {}).get('events') or [], events, RESET_EVENT_LIMIT)
        else:
            events = events[:RESET_EVENT_LIMIT]
        sources.append({
            'key': key,
            'label': label,
            'checkedAt': data.get('checkedAt'),
            'today': data.get('today'),
            'count': data.get('count'),
            'partial': partial,
            'events': events,
        })
    return {
        'updatedAt': now_bj(),
        'source': 'AIHOT',
        'sourceUrl': f'{SOURCE_URL}codex-reset',
        'sources': sources,
    }


TASKS = [
    ('weekly', lambda: fetch_period('weekly', 'weeklies', 'week'), 'ai-weekly.json'),
    ('monthly', lambda: fetch_period('monthly', 'monthlies', 'month'), 'ai-monthly.json'),
    ('hot', fetch_hot, 'ai-hot.json'),
    ('resets', fetch_resets, 'ai-resets.json'),
]


def main() -> None:
    results = {}
    errors = {}
    for index, (name, loader, filename) in enumerate(TASKS):
        if index:
            time.sleep(0.3)
        try:
            payload = loader()
            write_atomic(DATA_ROOT / filename, payload)
            results[name] = 'ok'
        except Exception as exc:  # 单源失败不阻断其它源
            errors[name] = str(exc)
            log(f'error {name}: {exc}')
    summary = {'ok': not errors, 'written': results, 'errors': errors, 'out': str(DATA_ROOT)}
    log('done ' + json.dumps(summary, ensure_ascii=False))
    print(json.dumps(summary, ensure_ascii=False))
    if errors and not results:
        raise SystemExit(1)


if __name__ == '__main__':
    try:
        main()
    except SystemExit:
        raise
    except Exception as exc:
        log(f'fatal {exc}')
        print(json.dumps({'ok': False, 'error': str(exc)}, ensure_ascii=False), file=sys.stderr)
        raise
