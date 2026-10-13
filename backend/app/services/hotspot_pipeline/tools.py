"""热点流水线资料检索工具（全部匿名 API，零密钥）+ mermaid 结构校验。

多源设计（千禧拍板：不绑死 AIHOT，全网/GitHub 检索均可）：
- search_github：api.github.com 匿名搜索（10 req/min 限额内使用，一手 README/Release）
- search_arxiv：export.arxiv.org（论文一手来源）
- fetch_url：httpx 抓任意网页正文（官方博客、raw.githubusercontent README 等）
- search_aihot：AIHOT 实时池（选题热度参考，仅 hot 模式主用）

mermaid 校验（validate_mermaid_blocks）：纯 python 结构自检——前端 mermaid
渲染白名单对齐（图型/节点 id/括号引号配平），挡住绝大多数低级语法错误；
三级防线：生成规范 → 结构校验回修 → 前端渲染失败显示代码框（不崩页）。
"""

from __future__ import annotations

import re

import httpx
from langchain_core.tools import tool

# ---------------------------------------------------------------------------
# 网络：容器内直连（博客容器在 blog-net，经 new-api 侧出公网）
# ---------------------------------------------------------------------------

_UA = "qianxi-blog-hotspot-pipeline/1.0"
_TIMEOUT = httpx.Timeout(20.0, connect=10.0)


def _extract_text(html: str) -> str:
    """极简正文提取：去 script/style/标签，压缩空白，截断防爆上下文。"""
    text = re.sub(r"(?is)<(script|style|nav|header|footer)[^>]*>.*?</\1>", " ", html)
    text = re.sub(r"(?s)<[^>]+>", " ", text)
    # 通用 HTML 实体一把替换（&nbsp; & < > &#39; ... 全覆盖）
    text = re.sub(r"&[a-zA-Z#0-9]+;", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


# ---------------------------------------------------------------------------
# 检索工具
# ---------------------------------------------------------------------------


@tool
def search_github(query: str) -> str:
    """Search GitHub repositories by keyword. Returns top 8 repos with name,
    description, stars, updated date, and URL — use fetch_url to dig into
    README/releases for primary sources."""
    try:
        r = httpx.get(
            "https://api.github.com/search/repositories",
            params={"q": query, "sort": "updated", "order": "desc", "per_page": 8},
            headers={"User-Agent": _UA, "Accept": "application/vnd.github+json"},
            timeout=_TIMEOUT,
        )
        r.raise_for_status()
        items = r.json().get("items") or []
        if not items:
            return "无结果，建议换关键词。"
        lines = []
        for it in items:
            desc = (it.get("description") or "")[:160]
            lines.append(
                f"- {it['full_name']} ⭐{it['stargazers_count']} 更新:{(it.get('pushed_at') or '')[:10]}"
                f"\n  {desc}\n  https://github.com/{it['full_name']}"
            )
        return "\n".join(lines)
    except Exception as exc:  # 工具失败不阻断管线，回消息让 LLM 换路
        return f"GitHub 搜索失败: {exc}（限额或网络问题，可换 fetch_url 直接抓）"


@tool
def search_arxiv(query: str) -> str:
    """Search arXiv papers (last 6 months). Returns top 6 papers with title,
    abstract snippet, published date, and abs URL — primary source for
    research-grade topics."""
    try:
        r = httpx.get(
            "http://export.arxiv.org/api/query",
            params={
                "search_query": f"all:{query}",
                "start": 0,
                "max_results": 6,
                "sortBy": "submittedDate",
                "sortOrder": "descending",
            },
            headers={"User-Agent": _UA},
            timeout=_TIMEOUT,
        )
        r.raise_for_status()
        entries = re.findall(r"(?s)<entry>(.*?)</entry>", r.text)
        if not entries:
            return "无结果，建议换关键词。"
        lines = []
        for e in entries:
            title = re.search(r"(?s)<title>(.*?)</title>", e)
            summary = re.search(r"(?s)<summary>(.*?)</summary>", e)
            pub = re.search(r"<published>(.*?)</published>", e)
            link = re.search(r'href="([^"]+abs[^"]*)"', e)
            t = re.sub(r"\s+", " ", title.group(1)).strip() if title else "?"
            s = re.sub(r"\s+", " ", summary.group(1)).strip()[:220] if summary else ""
            lines.append(
                f"- {t} [{(pub.group(1)[:10] if pub else '?')}]\n  {s}\n  {link.group(1) if link else ''}"
            )
        return "\n".join(lines)
    except Exception as exc:
        return f"arXiv 搜索失败: {exc}"


@tool
def search_aihot(category: str = "") -> str:
    """Fetch AIHOT recent item pool (30-day rolling window). Optional category
    filter: ai-models / ai-products / industry / paper / tip. Returns top 12
    items with title, summary, source and URL — hotspot trend reference."""
    try:
        params = {"mode": "selected", "limit": "12"}
        if category:
            params["category"] = category
        r = httpx.get(
            "https://aihot.news/api/v1/items",
            params=params,
            headers={"User-Agent": _UA, "Accept": "application/json", "Accept-Encoding": "gzip"},
            timeout=_TIMEOUT,
        )
        r.raise_for_status()
        items = r.json().get("items") or []
        if not items:
            return "AIHOT 池无结果。"
        lines = []
        for it in items:
            links = it.get("links") or {}
            src = (it.get("source") or {}).get("name")
            lines.append(
                f"- {(it.get('publishedAt') or '')[:10]} {(it.get('title') or '')[:120]}"
                f"\n  {(it.get('summary') or '')[:160]}\n  来源:{src} {links.get('original') or links.get('aihot') or ''}"
            )
        return "\n".join(lines)
    except Exception as exc:
        return f"AIHOT 拉取失败: {exc}"


@tool
def fetch_url(url: str) -> str:
    """Fetch a web page and return its main text (up to ~4000 chars). Use for
    GitHub raw README (https://raw.githubusercontent.com/...), official blog
    posts, release notes — primary source deep-dive."""
    try:
        r = httpx.get(url, headers={"User-Agent": _UA}, timeout=_TIMEOUT, follow_redirects=True)
        r.raise_for_status()
        text = _extract_text(r.text)
        if not text:
            return "页面无可提取正文（可能是纯 JS 渲染页）。"
        return text[:4000]
    except Exception as exc:
        return f"抓取失败: {exc}（403/超时可换 raw 地址或放弃该源）"


RESEARCH_TOOLS = [search_github, search_arxiv, fetch_url, search_aihot]
RESEARCH_TOOLS_BY_NAME = {t.name: t for t in RESEARCH_TOOLS}

# ---------------------------------------------------------------------------
# mermaid 结构校验（与前端 mermaid 渲染白名单对齐）
# ---------------------------------------------------------------------------

_MERMAID_ALLOWED_TYPES = (
    "graph ",
    "flowchart ",
    "sequenceDiagram",
    "classDiagram",
    "stateDiagram-v2",
    "erDiagram",
    "pie ",
    "timeline",
    "gantt",
)

_EXPERIMENTAL_TYPES = (
    "mindmap", "journey", "quadrantChart", "gitGraph", "sankey",
    "xychart", "block-beta", "architecture-beta", "packet-beta", "requirementDiagram",
)


def validate_mermaid_blocks(markdown: str) -> list[str]:
    """校验 markdown 里全部 mermaid 代码块。返回错误清单（空 = 通过）。

    与写作提示词的白名单一致：图型合法 / 首行声明 / 括号引号配平 /
    节点 id 纯英数下划线。挡住常见低级错误；语义级问题交给审稿 LLM。
    """
    blocks = re.findall(r"(?s)```mermaid[ \t]*\r?\n(.*?)```", markdown)
    if not blocks:
        return ["未找到 mermaid 代码块（需至少 1 个 ```mermaid ... ```）"]

    errors: list[str] = []
    for i, block in enumerate(blocks, 1):
        lines = [ln.rstrip() for ln in block.strip().splitlines() if ln.strip()]
        if not lines:
            errors.append(f"图{i}: 空代码块")
            continue
        head = lines[0].strip()

        # 1) 图型白名单
        if any(head.startswith(x.rstrip()) for x in _EXPERIMENTAL_TYPES):
            errors.append(f"图{i}: 图型 `{head}` 在实验性白名单外，前端渲染不保证，请换 flowchart/sequenceDiagram 等")
            continue
        if not any(head.startswith(t.rstrip()) or head == t.strip() for t in _MERMAID_ALLOWED_TYPES):
            errors.append(f"图{i}: 首行 `{head}` 不是合法 mermaid 图型声明（白名单：graph/flowchart/sequenceDiagram/classDiagram/stateDiagram-v2/erDiagram/pie/timeline/gantt）")
            continue

        # 2) 括号 / 引号配平（对块内非注释行）
        opens, closes = 0, 0
        for ln in lines[1:]:
            s = ln.strip()
            if s.startswith("%%"):
                continue
            opens += s.count("(") + s.count("[") + s.count("{")
            closes += s.count(")") + s.count("]") + s.count("}")
        if opens != closes:
            errors.append(f"图{i}: 括号/方括号不配平（{opens} 开 {closes} 闭）——请检查节点标签是否漏闭合")

        # 3) flowchart/graph 的节点 id 非法字符（英数下划线，或 A["标签"] 形式）
        if head.split()[0] in ("graph", "flowchart"):
            for ln in lines[1:]:
                s = ln.strip()
                if not s or s.startswith("%%") or s.startswith("subgraph") or s == "end":
                    continue
                m = re.match(r"^([A-Za-z0-9_]+)\s*(-->|---|-.->|-\.->|==>)", s)
                if m and not re.fullmatch(r"[A-Za-z0-9_]+", m.group(1)):
                    errors.append(f"图{i}: 节点 id `{m.group(1)}` 含非法字符（只能英数下划线），中文请放标签：{s[:50]}")
                # 3b) 未加引号的 [] 标签里含 {}：mermaid 会把 {…} 当成节点语法解析并报错。
                # 实测 #674 第 5 图 `A1[量化状态 S_t] --> A2[下一步输入 x_{t+1}]`
                # 括号是配平的（骗过第 2 条检查）但前端报 Syntax error。
                # 已加引号的 ["…{…}"] 是安全的，必须放过（正则用 (?<!") 排除）。
                for label in re.findall(r"\[([^\]\[]+)\]", s):
                    if label.startswith('"'):
                        continue
                    if "{" in label or "}" in label:
                        errors.append(
                            f"图{i}: 节点标签里出现未加引号的 {{}}（如 `{label[:30]}`）——"
                            f"数学下标请写成 A[\"x_(t+1)\"] 或去掉花括号"
                        )
                        break

    return errors
