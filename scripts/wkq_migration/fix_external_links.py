# -*- coding: utf-8 -*-
"""把正文里指向 wkq9411.github.io 的绝对链接换成站内 /#/articles/<id>，并重渲染 HTML。"""
import asyncio
import re
import sys

import app.main  # noqa: F401
from sqlalchemy import select

from app.core.database import async_session_maker
from app.models.article import Article
from app.services.markdown_service import parse_markdown

URL_RE = re.compile(r"\]\((https://wkq9411\.github\.io/[^)\s]+)\)")
LINK_RE = re.compile(r"\[([^\]]{1,120})\]\((https://wkq9411\.github\.io/[^)\s]+)\)")
PREFIXES = ("Paper-", "Code-", "Note-", "RL-")


def norm(s: str) -> str:
    s = s.lower()
    for ch in "[]【】()（）<>《》 \t-—_":
        s = s.replace(ch, "")
    return s


def core(title: str) -> str:
    t = re.sub(r"^【[^】]*】", "", title)
    return norm(t)


def url_key(url: str) -> str:
    name = url.rsplit("/", 1)[-1]
    if name.endswith(".html"):
        name = name[:-5]
    for p in PREFIXES:
        if name.startswith(p):
            name = name[len(p):]
            break
    return norm(name)


def resolve(text: str, url: str, titles: dict) -> int | None:
    k = url_key(url)
    hits = [aid for aid, c in titles.items() if k and (k == c or k in c)]
    if len(hits) == 1:
        return hits[0]
    if len(hits) > 1:
        hits.sort(key=lambda aid: len(titles[aid]), reverse=True)
        return hits[0]
    nt = norm(text)
    hits = [aid for aid, c in titles.items() if nt and (nt == c or c in nt or nt in c)]
    if len(hits) == 1:
        return hits[0]
    return None


async def main(apply: bool):
    async with async_session_maker() as db:
        rows = (await db.execute(select(Article).where(Article.id.between(109, 142)))).scalars().all()
        titles = {a.id: core(a.title) for a in rows}
        total = 0
        unresolved = []
        changed = 0
        for a in rows:
            md = a.content_md or ""
            if "wkq9411.github.io" not in md:
                continue

            def repl(m):
                nonlocal total
                url = m.group(1)
                # 找紧邻的链接文字
                start = max(0, m.start() - 160)
                seg = md[start:m.start()]
                lm = None
                for lm in re.finditer(r"\[([^\]]*)$", seg):
                    pass
                text = lm.group(1) if lm else ""
                aid = resolve(text, url, titles)
                total += 1
                if aid is None:
                    unresolved.append((a.id, text[:40], url))
                    return m.group(0)
                return f"](/#/articles/{aid})"

            new = URL_RE.sub(repl, md)
            if new != md:
                html, toc = parse_markdown(new)
                a.content_md = new
                a.content_html = html
                a.toc_html = toc
                changed += 1
        if apply:
            await db.commit()
        print(f"apply={apply} changed_articles={changed} links_seen={total} unresolved={len(unresolved)}")
        for u in unresolved:
            print("  UNRESOLVED", u)


asyncio.run(main("--apply" in sys.argv))
