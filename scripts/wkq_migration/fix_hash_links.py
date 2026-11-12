# -*- coding: utf-8 -*-
"""把 wkq 文章里的站内链接 /articles/<id> 改成 HashRouter 形式 /#/articles/<id>，并重渲染 HTML。"""
import asyncio
import re

import app.main  # noqa: F401
from sqlalchemy import select

from app.core.database import async_session_maker
from app.models.article import Article
from app.services.markdown_service import parse_markdown


async def main():
    async with async_session_maker() as db:
        rows = (await db.execute(select(Article).where(Article.id.between(109, 142)))).scalars().all()
        n = tot = 0
        for a in rows:
            md = a.content_md or ""
            if "](/articles/" not in md:
                continue
            new, k = re.subn(r"\]\(/articles/", "](/#/articles/", md)
            html, toc = parse_markdown(new)
            a.content_md = new
            a.content_html = html
            a.toc_html = toc
            n += 1
            tot += k
        await db.commit()
        print(f"fixed articles={n} links={tot}")


asyncio.run(main())
