# -*- coding: utf-8 -*-
"""把 wkq-blog 的 Jekyll 文章清洗成可导入我们博客的 manifest。

用法: python build_wkq_manifest.py
产出: F:\ProGram\DSH_Temporary\wkq_import\manifest.json + report.txt
"""
import json
import re
import sys
import pathlib
import datetime as dt

import yaml

SRC = pathlib.Path(r"F:\ProGram\DSH_Temporary\wkq-blog\_posts")
OUT = pathlib.Path(r"F:\ProGram\DSH_Temporary\wkq_import")
OUT.mkdir(parents=True, exist_ok=True)

CATEGORY_TAG = {"Paper": "Paper", "Code": "Code", "Note": "Note", "RL": "RL"}


def split_frontmatter(text: str):
    text = text.lstrip("\ufeff")
    m = re.match(r"^---\s*\n(.*?)\n---\s*\n", text, re.S)
    if not m:
        return {}, text
    fm = yaml.safe_load(m.group(1)) or {}
    return fm, text[m.end():]


TOC_BLOCK = re.compile(
    r"^#\s*目录\s*\n(?:.*\n)*?\* TOC\s*\n\{:toc\}\s*\n+(?:---\s*\n)?",
    re.M,
)
TOC_LEFTOVER = re.compile(r"^\s*\{:\.?no_toc\}\s*$|^\s*\{:toc\}\s*$", re.M)
LIQUID = re.compile(r"^\s*\{%\s*(?:raw|endraw)\s*%\}\s*$", re.M)
KRAMDOWN_ATTR = re.compile(r"[ \t]*\{:[#.][^}\n]*\}[ \t]*$", re.M)
KRAMDOWN_KV = re.compile(r'[ \t]*\{:[a-zA-Z_-]+="[^"]*"\}[ \t]*$', re.M)
INTERNAL_LINK = re.compile(r"\]\(/(\d{4}-\d{2}-\d{2})/([^)#]+?)\.html(?:#[^)]*)?\)")


def clean(body: str):
    body = TOC_BLOCK.sub("", body, count=1)
    body = LIQUID.sub("", body)
    body = TOC_LEFTOVER.sub("", body)
    body = body.replace("<!--more-->", "")
    body = KRAMDOWN_ATTR.sub("", body)
    body = KRAMDOWN_KV.sub("", body)
    body = INTERNAL_LINK.sub(lambda m: f"]([[WKQPOST:{m.group(2)}]])", body)
    body = re.sub(r"\n{4,}", "\n\n\n", body)
    return body.strip() + "\n"


def main():
    files = sorted(SRC.glob("*.md"))
    key_to_file = {}
    for p in files:
        m = re.match(r"^\d{4}-\d{2}-\d{2}-(.+)\.md$", p.name)
        key_to_file[m.group(1) if m else p.stem] = p

    items, problems = [], []
    for p in files:
        raw = p.read_text(encoding="utf-8-sig")
        fm, body = split_frontmatter(raw)
        title = (fm.get("title") or "").strip()
        summary = (fm.get("summary") or fm.get("description") or "").strip()
        cat = fm.get("categories")
        if isinstance(cat, list):
            cat = cat[0] if cat else ""
        cat = (cat or "").strip()
        date = fm.get("date")
        if isinstance(date, dt.datetime):
            d = date.replace(tzinfo=None)
        elif isinstance(date, dt.date):
            d = dt.datetime(date.year, date.month, date.day, 16, 0, 0)
        else:
            d = None

        cleaned = clean(body)
        # 校验：不能残留 Liquid / TOC / kramdown 行内属性
        for bad in ("{%", "{:toc", "{:.no_toc", "<!--more-->"):
            if bad in cleaned:
                problems.append(f"{p.name}: 残留 {bad!r}")
        # 数学定界符成对检查（粗检）
        if cleaned.count("$$") % 2:
            problems.append(f"{p.name}: $$ 数量为奇数")
        if not title:
            problems.append(f"{p.name}: 缺 title")
        if d is None:
            problems.append(f"{p.name}: 缺 date")
        if cat not in CATEGORY_TAG:
            problems.append(f"{p.name}: 未知分类 {cat!r}")

        items.append({
            "source_file": p.name,
            "key": re.match(r"^\d{4}-\d{2}-\d{2}-(.+)\.md$", p.name).group(1),
            "title": title,
            "summary": summary,
            "date": d.isoformat(sep=" ") if d else None,
            "category": cat,
            "tags": [CATEGORY_TAG.get(cat, cat)] if cat else [],
            "content_md": cleaned,
        })

    # 内部链接可达性
    unresolved = {}
    for it in items:
        for m in INTERNAL_LINK.finditer("" + it["content_md"]):
            pass
    for it in items:
        for key in re.findall(r"\[\[WKQPOST:([^\]]+)\]\]", it["content_md"]):
            if key in key_to_file:
                continue
            # 去前缀后按后缀匹配
            base = re.sub(r"^(Code|Paper|Note|RL)-", "", key)
            cands = [k for k in key_to_file if re.sub(r"^(Code|Paper|Note|RL)-", "", k) == base]
            if len(cands) == 1:
                it["content_md"] = it["content_md"].replace(f"[[WKQPOST:{key}]]", f"[[WKQPOST:{cands[0]}]]")
            else:
                unresolved[key] = unresolved.get(key, 0) + 1

    manifest = {
        "generated_at": dt.datetime.now().isoformat(timespec="seconds"),
        "source": "https://wkq9411.github.io (Jekyll _posts)",
        "count": len(items),
        "items": items,
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")

    cats = {}
    for it in items:
        cats[it["category"]] = cats.get(it["category"], 0) + 1
    rep = [
        f"posts: {len(items)}",
        f"categories: {cats}",
        f"date range: {min(i['date'] for i in items)} .. {max(i['date'] for i in items)}",
        f"unresolved internal links: {unresolved}",
        f"problems: {len(problems)}",
    ] + problems
    (OUT / "report.txt").write_text("\n".join(rep) + "\n", encoding="utf-8")
    print("\n".join(rep).encode("utf-8", "replace").decode("utf-8"))


if __name__ == "__main__":
    main()
