# -*- coding: utf-8 -*-
"""把 wkq 文章里的 OSS 图片地址换成站内 /uploads/wkq/ 路径（图片已下载到 dist/uploads/wkq）。"""
import asyncio
import re

import app.main  # noqa: F401
from sqlalchemy import select

from app.core.database import async_session_maker
from app.models.article import Article
from app.services.markdown_service import parse_markdown

PAT = re.compile(r"https?://wkqpicture\.oss-cn-beijing\.aliyuncs\.com/img/([^\s\"'<>)]+)")


async def main():
    async with async_session_maker() as db:
        rows = (await db.execute(select(Article).where(Article.id.between(109, 142)))).scalars().all()
        n = 0
        total = 0
        for a in rows:
            md = a.content_md or ""
            if "wkqpicture" not in md:
                continue
            new, k = PAT.subn(r"/uploads/wkq/\1", md)
            html, toc = parse_markdown(new)
            a.content_md = new
            a.content_html = html
            a.toc_html = toc
            n += 1
            total += k
        await db.commit()
        print(f"rewritten articles={n} image-refs={total}")


asyncio.run(main())
