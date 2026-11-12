# -*- coding: utf-8 -*-
"""收尾：清掉 111 里残留的 {#complete-transformer}，并把 3 个失效的站内锚点指到新 heading id。"""
import asyncio
import html as htmllib
import re
import sys

import app.main  # noqa: F401
from sqlalchemy import select

from app.core.database import async_session_maker
from app.models.article import Article
from app.services.markdown_service import parse_markdown

# 旧锚点 -> 目标标题里的特征文字
TARGETS = {
    "complete-transformer": "4.完整的Transformer",
    "3-解耦rope": "3. 解耦RoPE",
    "sec-pref-modeling": "（二）偏好采样和奖励模型建模",
}


def heading_ids(html: str):
    out = []
    for m in re.finditer(r"<h([1-6])[^>]*id=\"([^\"]+)\"[^>]*>(.*?)</h\1>", html, re.S):
        txt = re.sub(r"<[^>]+>", "", m.group(3))
        out.append((htmllib.unescape(txt).strip(), m.group(2)))
    return out


async def main(apply: bool):
    async with async_session_maker() as db:
        rows = (await db.execute(select(Article).where(Article.id.between(109, 142)))).scalars().all()
        changed = 0
        report = []

        # pass 1: 去掉残留的 kramdown 标题属性
        for a in rows:
            md = a.content_md or ""
            if "{#complete-transformer}" not in md:
                continue
            new = md.replace(" {#complete-transformer}", "").replace("{#complete-transformer}", "")
            html, toc = parse_markdown(new)
            a.content_md, a.content_html, a.toc_html = new, html, toc
            changed += 1
            report.append((a.id, "strip-attr"))

        # pass 2: 修锚点
        for a in rows:
            md = a.content_md or ""
            anchors = set(re.findall(r"\]\(#([^)\s]+)\)", md))
            if not anchors:
                continue
            ids = heading_ids(a.content_html or "")
            new_md = md
            for old in anchors:
                hint = TARGETS.get(old)
                if not hint:
                    continue
                match = [(txt, hid) for txt, hid in ids if hint in txt]
                if not match:
                    report.append((a.id, f"no-heading-for {old}"))
                    continue
                new_md = new_md.replace(f"](#{old})", f"](#{match[0][1]})")
                report.append((a.id, f"{old} -> {match[0][1]}"))
            if new_md != md:
                html, toc = parse_markdown(new_md)
                a.content_md, a.content_html, a.toc_html = new_md, html, toc
                changed += 1

        if apply:
            await db.commit()
        print(f"apply={apply} changed={changed}")
        for r in report:
            print(" ", r)


asyncio.run(main("--apply" in sys.argv))
