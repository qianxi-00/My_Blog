#!/usr/bin/env python3
"""拉取 AIHOT 大模型排行榜，生成前端静态数据。

AIHOT 没有公开的榜单 JSON API（官方文档：模型榜只有网页），数据在页面内嵌的
React Router single-fetch 流里。这里按两条通道解析：

  1) https://aihot.news/leaderboard.data —— 直接返回 turbo-stream 扁平数组；
  2) https://aihot.news/leaderboard      —— HTML 里 streamController.enqueue("…") 的同一份流。

turbo-stream 结构：扁平数组 + {"_keyIdx": valueIdx} 引用，下标指向数组元素；
负数表示特殊值（undefined/null 等），这里统一降级为 None。

输出 data/ai-leaderboard.json：run（生成时间/方法学/汇率）、boards（5 个榜单 × 50 条）、
models（slug → 名称/厂商/发布日期/上下文/价格/官方链接）。任一通道解析失败时保留旧文件。
"""
from __future__ import annotations

import datetime as dt
import gzip
import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

PAGE = 'https://aihot.news/leaderboard'
DATA_ENDPOINT = 'https://aihot.news/leaderboard.data'
UA = 'aihot-api/2.0.0 qianxi-blog-leaderboard/1.0'
REPO_ROOT = Path(__file__).resolve().parents[1]
DATA_ROOT = Path(os.environ.get('AI_LEADERBOARD_DATA_ROOT', REPO_ROOT / 'frontend' / 'public' / 'data'))
OUT = DATA_ROOT / 'ai-leaderboard.json'
LOG = Path(os.environ.get('AI_LEADERBOARD_LOG', REPO_ROOT / 'logs' / 'ai_leaderboard_fetch.log'))
STREAM_RE = re.compile(r'streamController\.enqueue\(("(?:[^"\\]|\\.)*")\)', re.S)


def now_bj() -> str:
    return dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).isoformat()


def log(msg: str) -> None:
    LOG.parent.mkdir(parents=True, exist_ok=True)
    with LOG.open('a', encoding='utf-8') as f:
        f.write(f'[{now_bj()}] {msg}\n')


def _get(url: str) -> str:
    req = urllib.request.Request(url, headers={
        'User-Agent': UA,
        'Accept': 'text/html,application/json;q=0.9,*/*;q=0.8',
        'Accept-Encoding': 'gzip',
    })
    with urllib.request.urlopen(req, timeout=45) as resp:
        raw = resp.read()
        if resp.headers.get('Content-Encoding') == 'gzip':
            raw = gzip.decompress(raw)
    return raw.decode('utf-8', 'replace')


def decode_turbo_stream(flat: list) -> object:
    """把 turbo-stream 扁平数组还原成普通 Python 对象。"""
    def res(idx, depth: int = 0):
        if depth > 60:
            return None
        if isinstance(idx, bool) or not isinstance(idx, int):
            return idx
        if idx < 0 or idx >= len(flat):
            return None
        value = flat[idx]
        if isinstance(value, dict) and value and all(isinstance(k, str) and k.startswith('_') for k in value):
            out = {}
            for key_ref, val_ref in value.items():
                key = flat[int(key_ref[1:])]
                out[key] = res(val_ref, depth + 1)
            return out
        if isinstance(value, list):
            return [res(x, depth + 1) for x in value]
        return value

    return res(0)


def find_payload(node, depth: int = 0):
    """在解码结果里找到同时含 boards 与 models 的对象。"""
    if depth > 12:
        return None
    if isinstance(node, dict):
        if isinstance(node.get('boards'), list) and isinstance(node.get('models'), dict):
            return node
        for value in node.values():
            found = find_payload(value, depth + 1)
            if found is not None:
                return found
    elif isinstance(node, list):
        for value in node:
            found = find_payload(value, depth + 1)
            if found is not None:
                return found
    return None


def parse_from_data_endpoint() -> dict:
    flat = json.loads(_get(DATA_ENDPOINT))
    if not isinstance(flat, list):
        raise RuntimeError('leaderboard.data is not a turbo-stream array')
    payload = find_payload(decode_turbo_stream(flat))
    if payload is None:
        raise RuntimeError('leaderboard.data: payload with boards/models not found')
    return payload


def parse_from_html() -> dict:
    html = _get(PAGE)
    match = STREAM_RE.search(html)
    if not match:
        raise RuntimeError('leaderboard html: streamController.enqueue not found')
    flat = json.loads(json.loads(match.group(1)))
    if not isinstance(flat, list):
        raise RuntimeError('leaderboard html: stream is not an array')
    payload = find_payload(decode_turbo_stream(flat))
    if payload is None:
        raise RuntimeError('leaderboard html: payload with boards/models not found')
    return payload


def normalize(payload: dict) -> dict:
    run = payload.get('run') or {}
    boards = []
    for board in payload.get('boards') or []:
        meta = board.get('board') or {}
        entries = []
        for entry in board.get('entries') or []:
            slug = entry.get('slug')
            if not slug:
                continue
            entries.append({
                'slug': slug,
                'rank': entry.get('rank'),
                'score': entry.get('score'),
                'sourceCount': entry.get('sourceCount'),
                'coverage': entry.get('coverage'),
            })
        if not entries:
            continue
        boards.append({
            'key': meta.get('key'),
            'name': meta.get('name'),
            'title': meta.get('title'),
            'focus': meta.get('focus'),
            'description': meta.get('description'),
            'howToRead': meta.get('howToRead'),
            'sourceCount': meta.get('sourceCount'),
            'operatorCount': meta.get('operatorCount'),
            'entries': entries,
        })

    models = {}
    for slug, raw in (payload.get('models') or {}).items():
        if not isinstance(raw, dict):
            continue
        meta = raw.get('model') or {}
        price = raw.get('price') or {}
        access = raw.get('access') or {}
        models[slug] = {
            'name': meta.get('name') or slug,
            'provider': meta.get('provider'),
            'releasedAt': meta.get('releasedAt'),
            'contextWindowTokens': meta.get('contextWindowTokens'),
            'price': {
                'currency': price.get('currency') or 'USD',
                'input': price.get('input'),
                'output': price.get('output'),
                'cached': price.get('cached'),
                'inputCny': price.get('inputCny'),
                'outputCny': price.get('outputCny'),
                'cachedCny': price.get('cachedCny'),
                'officialUrl': price.get('officialUrl'),
                'note': price.get('note'),
            },
            'access': {
                'domestic': access.get('domestic'),
                'weightsUrl': access.get('weightsUrl'),
            },
            'url': f'https://aihot.news/leaderboard/{slug}',
        }

    if len(boards) < 1 or len(models) < 50:
        raise RuntimeError(f'payload shape invalid: boards={len(boards)} models={len(models)}')

    return {
        'updatedAt': now_bj(),
        'run': {
            'id': run.get('id'),
            'methodologyVersion': run.get('methodologyVersion'),
            'generatedAt': run.get('generatedAt'),
            'fx': run.get('fx') or {},
        },
        'expiresAt': payload.get('expiresAt'),
        'source': 'AIHOT',
        'sourceUrl': PAGE,
        'boards': boards,
        'models': models,
    }


def write_atomic(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + '.tmp')
    tmp.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    tmp.replace(path)


def main() -> None:
    errors = []
    payload = None
    for name, loader in (('data', parse_from_data_endpoint), ('html', parse_from_html)):
        try:
            payload = loader()
            break
        except Exception as exc:  # 单通道失败换下一条
            errors.append(f'{name}: {exc}')
    if payload is None:
        raise RuntimeError('all channels failed: ' + '; '.join(errors))

    data = normalize(payload)
    write_atomic(OUT, data)
    summary = {
        'ok': True,
        'boards': [{'key': b['key'], 'entries': len(b['entries'])} for b in data['boards']],
        'models': len(data['models']),
        'generatedAt': data['run'].get('generatedAt'),
        'out': str(OUT),
    }
    log('ok ' + json.dumps(summary, ensure_ascii=False))
    print(json.dumps(summary, ensure_ascii=False))


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        log(f'error {exc}')
        print(json.dumps({'ok': False, 'error': str(exc)}, ensure_ascii=False), file=sys.stderr)
        raise
