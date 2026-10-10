#!/usr/bin/env python3
"""热点主题打标：用系统同款 LLM 链路（grok-4.7 经 new-api）把热点归一到统一中文主题词表。

为什么不用 primary_category：它是来源站的原始分类——中英混杂且同义重复
（"AI基础设施" 90 vs "AI-Infrastructure" 33），归档页主题分组不可用。

运行方式（容器内，复用挂载的 /data 与注入的 runtime.env）：
  cp tag_hotspots.py /data/blog/data/tag_hotspots.py   # = 容器内 /data/tag_hotspots.py
  docker exec qianxi-blog python3 /data/tag_hotspots.py

幂等：只处理 topic_tag IS NULL 的行——可反复跑，新热点增量补标。
LLM 失败的批次留 NULL，下次运行重试。
"""
from __future__ import annotations

import json
import os
import sqlite3
import time
import urllib.request

DB = os.environ.get('TAG_DB', '/data/blog.db')
API_BASE = os.environ.get('OPENAI_API_BASE', 'http://new-api:3000/v1').rstrip('/')
API_KEY = os.environ['OPENAI_API_KEY']
MODEL = os.environ.get('OPENAI_MODEL', 'grok-4.7')
BATCH = 20

TOPICS = [
    '模型发布', '推理与部署', '多模态', 'Agent与工具', '开源生态',
    '行业与商业', '研究论文', '安全与对齐', '编程实践', '其他',
]

PROMPT = """你是技术内容分类器。把下面每个 AI 热点专题归入唯一主题。

主题词表（只能从中选一个）：
{topics}

条目（JSON）：
{items}

要求：
- 依据 title 与 summary 判断，primary_category 仅作参考（它是来源站分类，中英混杂不可信）
- 每条输出 {{"id": <数字>, "tag": "<词表中一个主题>"}}
- 只输出一个 JSON 数组，不要任何其他文字、不要 markdown 代码块标记"""


def llm_classify(batch: list[dict]) -> dict[int, str]:
    payload = json.dumps({
        'model': MODEL,
        'temperature': 0,
        'messages': [{'role': 'user', 'content': PROMPT.format(
            topics=' / '.join(TOPICS),
            items=json.dumps([
                {'id': b['id'], 'title': b['title'][:80],
                 'summary': (b['summary'] or '')[:120],
                 'primary_category': b['primary_category']}
                for b in batch
            ], ensure_ascii=False),
        )}],
    }, ensure_ascii=False).encode('utf-8')
    req = urllib.request.Request(
        f'{API_BASE}/chat/completions',
        data=payload,
        headers={'Content-Type': 'application/json', 'Authorization': f'Bearer {API_KEY}'},
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        data = json.loads(resp.read().decode('utf-8'))
    text = (data.get('choices') or [{}])[0].get('message', {}).get('content', '')
    # 提取第一个 JSON 数组（容忍模型在前后加了说明文字）
    start, end = text.find('['), text.rfind(']')
    if start == -1 or end == -1:
        raise RuntimeError(f'回复无 JSON 数组: {text[:120]}')
    mapping: dict[int, str] = {}
    for entry in json.loads(text[start:end + 1]):
        tag = str(entry.get('tag', '')).strip()
        if tag in TOPICS:
            mapping[int(entry['id'])] = tag
    return mapping


def main() -> None:
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT id, title, summary, primary_category FROM hot_topics "
        "WHERE status='published' AND topic_tag IS NULL ORDER BY id"
    ).fetchall()
    batch_list = [dict(r) for r in rows]
    print(f'待打标: {len(batch_list)} 条（模型 {MODEL} @ {API_BASE}）')
    if not batch_list:
        return

    tagged = 0
    for i in range(0, len(batch_list), BATCH):
        batch = batch_list[i:i + BATCH]
        try:
            mapping = llm_classify(batch)
        except Exception as exc:
            print(f'  批 {i // BATCH + 1} 失败（留 NULL 下次重试）: {exc}')
            time.sleep(2)
            continue
        for hid, tag in mapping.items():
            conn.execute('UPDATE hot_topics SET topic_tag=? WHERE id=?', (tag, hid))
        conn.commit()
        tagged += len(mapping)
        print(f'  批 {i // BATCH + 1}/{(len(batch_list) + BATCH - 1) // BATCH}: {len(mapping)}/{len(batch)} 条 → {sorted(set(mapping.values()))}')
        time.sleep(1)

    print(f'完成: 本次打标 {tagged} 条; 剩余未标 {len(batch_list) - tagged} 条')
    dist = conn.execute(
        "SELECT topic_tag, COUNT(*) FROM hot_topics WHERE status='published' GROUP BY 1 ORDER BY 2 DESC"
    ).fetchall()
    for r in dist:
        print(f'  {r[0] or "(未标)"}: {r[1]}')
    conn.close()


if __name__ == '__main__':
    main()