# -*- coding: utf-8 -*-
"""把 wkq 博客的 34 篇文章导入 My_Blog。

在容器里跑：docker exec -w /app qianxi-blog python /data/import_wkq.py [--apply]
默认 dry-run，只统计不写库。--apply 才落库。

幂等：按 title 判重；重复跑只会补链接替换。
"""
import asyncio
import datetime as dt
import json
import sys

from sqlalchemy import select
from sqlalchemy.orm import selectinload

import app.main  # noqa: F401  触发全部模型注册（否则 mapper 解析不到 Comment 等关系）
from app.core.database import async_session_maker
from app.models.article import Article, Tag
from app.services.markdown_service import estimate_read_time, parse_markdown

MANIFEST = "/data/import_wkq_manifest.json"
AUTHOR_ID = 1
APPLY = "--apply" in sys.argv
TOKEN = "[[WKQPOST:{}]]"


async def main():
    data = json.loads(open(MANIFEST, encoding="utf-8").read())
    items = data["items"]
    print(f"manifest: {len(items)} items, generated {data.get('generated_at')}")

    async with async_session_maker() as db:
        rows = (await db.execute(select(Article.id, Article.title))).all()
        by_title = {t: i for i, t in rows}
        print(f"db: {len(rows)} articles, matched by title: {sum(1 for it in items if it['title'] in by_title)}")

        created = []
        if APPLY:
            for it in items:
                if it["title"] in by_title:
                    continue
                html, toc = parse_markdown(it["content_md"])
                art = Article(
                    title=it["title"],
                    summary=it["summary"] or None,
                    content_md=it["content_md"],
                    content_html=html,
                    toc_html=toc,
                    category=it["category"],
                    author_id=AUTHOR_ID,
                    status="published",
                    published_at=dt.datetime.fromisoformat(it["date"]),
                    read_time_minutes=estimate_read_time(it["content_md"]),
                    view_count=0,
                    like_count=0,
                    comment_count=0,
                )
                db.add(art)
                await db.flush()
                # 异步环境里直接 append 会触发懒加载 → MissingGreenlet，按 API 的写法先预加载
                art = (await db.execute(
                    select(Article).options(selectinload(Article.tags)).where(Article.id == art.id)
                )).scalar_one()
                for name in it["tags"]:
                    tag = (await db.execute(select(Tag).where(Tag.name == name))).scalar_one_or_none()
                    if not tag:
                        tag = Tag(name=name)
                        db.add(tag)
                        await db.flush()
                    art.tags.append(tag)
                created.append(art.id)
            await db.commit()
            print(f"inserted: {len(created)} articles")
        else:
            sample = items[0]
            html, toc = parse_markdown(sample["content_md"])
            print(f"[dry-run] sample: {sample['title']!r} html={len(html)}B toc={len(toc)}B read={estimate_read_time(sample['content_md'])}min")
            print(f"[dry-run] would insert: {sum(1 for it in items if it['title'] not in by_title)}")

        # 第二遍：把 [[WKQPOST:key]] 换成 /articles/{id}
        rows = (await db.execute(select(Article.id, Article.title, Article.content_md))).all()
        by_title = {t: i for i, t, _ in rows}
        keymap = {it["key"]: by_title[it["title"]] for it in items if it["title"] in by_title}
        print(f"keymap: {len(keymap)}/{len(items)}")

        changed = 0
        for aid, title, content in rows:
            if "[[WKQPOST:" not in (content or ""):
                continue
            new = content
            for key, target in keymap.items():
                new = new.replace(TOKEN.format(key), f"/articles/{target}")
            if new != content:
                changed += 1
                if APPLY:
                    html, toc = parse_markdown(new)
                    art = await db.get(Article, aid)
                    art.content_md = new
                    art.content_html = html
                    art.toc_html = toc
        if APPLY:
            await db.commit()
        print(f"link-rewritten articles: {changed}")


asyncio.run(main())
