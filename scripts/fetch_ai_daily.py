#!/usr/bin/env python3
from __future__ import annotations

import datetime as dt
import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path

API = 'https://aihot.virxact.com/api/public/daily'
ITEMS_API = 'https://aihot.virxact.com/api/public/items'
UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 aihot-skill/0.2.0 qianxi-blog-ai-daily'
OUT = Path('/data/My_Blog/frontend/dist/data/ai-daily.json')
SELECTED_OUT = Path('/data/My_Blog/frontend/dist/data/ai-selected.json')
DAILY_DIR = Path('/data/My_Blog/frontend/dist/data/ai-daily')
INDEX_OUT = Path('/data/My_Blog/frontend/dist/data/ai-daily-index.json')
ARCHIVE = Path('/data/My_Blog/ai_daily_archive')
LOG = Path('/data/My_Blog/logs/ai_daily_fetch.log')

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


def fetch() -> dict:
    req = urllib.request.Request(API, headers={'User-Agent': UA, 'Accept': 'application/json'})
    with urllib.request.urlopen(req, timeout=45) as resp:
        raw = resp.read().decode('utf-8')
    data = json.loads(raw)
    if not isinstance(data, dict) or not data.get('date') or not isinstance(data.get('sections'), list):
        raise RuntimeError('AI HOT daily payload shape invalid')
    data['fetchedAt'] = now_bj()
    data['source'] = 'AI HOT'
    data['sourceUrl'] = 'https://aihot.virxact.com/'
    return data


def fetch_items(category: str | None = None, take: int = 80) -> dict:
    params = {'mode': 'selected', 'take': str(take)}
    if category:
        params['category'] = category
    url = f"{ITEMS_API}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/json'})
    with urllib.request.urlopen(req, timeout=45) as resp:
        raw = resp.read().decode('utf-8')
    data = json.loads(raw)
    if not isinstance(data, dict) or not isinstance(data.get('items'), list):
        raise RuntimeError('AI HOT selected items payload shape invalid')
    return data


def normalize_item(item: dict) -> dict:
    return {
        'id': item.get('id'),
        'title': item.get('title'),
        'titleEn': item.get('title_en'),
        'url': item.get('url'),
        'source': item.get('source'),
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
        data = fetch_items(api_category, take=100 if key == 'all' else 60)
        items = [normalize_item(item) for item in data.get('items') or [] if item.get('title') and item.get('url')]
        categories.append({
            'key': key,
            'label': label,
            'apiCategory': api_category,
            'count': len(items),
            'hasNext': bool(data.get('hasNext')),
            'nextCursor': data.get('nextCursor'),
            'items': items,
        })
        if key == 'all':
            latest_items = items
    return {
        'fetchedAt': fetched_at,
        'source': 'AI HOT',
        'sourceUrl': 'https://aihot.virxact.com/?page=1',
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


def main() -> None:
    data = fetch()
    selected = fetch_selected_payload()
    write_atomic(OUT, data)
    write_atomic(SELECTED_OUT, selected)
    ARCHIVE.mkdir(parents=True, exist_ok=True)
    write_atomic(ARCHIVE / f"{data['date']}.json", data)
    write_atomic(DAILY_DIR / f"{data['date']}.json", data)
    index = build_index()
    write_atomic(INDEX_OUT, index)
    items = sum(len(s.get('items') or []) for s in data.get('sections') or [])
    log(f"ok date={data.get('date')} sections={len(data.get('sections') or [])} items={items} selectedItems={selected.get('total')} selectedCategories={len(selected.get('categories') or [])} months={len(index.get('months') or [])}")
    print(json.dumps({'ok': True, 'date': data.get('date'), 'sections': len(data.get('sections') or []), 'items': items, 'selectedItems': selected.get('total'), 'selectedCategories': len(selected.get('categories') or []), 'months': len(index.get('months') or []), 'out': str(OUT), 'selectedOut': str(SELECTED_OUT)}, ensure_ascii=False))


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        log(f'error {exc}')
        print(json.dumps({'ok': False, 'error': str(exc)}, ensure_ascii=False), file=sys.stderr)
        raise
