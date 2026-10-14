"""二十三期 harness 论文工具层：论文深读 / 配图抽取 / 图床上传。

三件事，都是"让资料真正可用"而不是只给个摘要：
1. `search_papers`：按主题检索 arXiv 近三个月论文，带筛选条件（要技术含量
   的，不要综述灌水）——选题层的输入源（千禧拍板"检索主要要是论文"）
2. `fetch_paper`：读 arXiv HTML 版全文（不是 abstract），抽章节结构 + 候选配图
   URL（figure/table 的图位）——规划层的输入源
3. `publish_figures`：把规划层选定的论文图批量下载 → 推 GitHub 图床 → 返回
   正文可用的 raw URL 清单。**注意执行位置**：容器镜像内没有 git，
   推图必须走宿主（实测 `docker exec` 里 `git` 不存在），所以本模块在容器
   侧只负责下载到 /data 共享卷并产出清单，推图由宿主侧 hook 脚本完成。

图床走 SSH deploy key（服务器已有 /root/.ssh/github_my_image_deploy，实测有
写权限且 raw 匿名可读），不需要 token。图片路径 blog/images/<yyyy-mm>/<slug>/。
"""

from __future__ import annotations

import datetime as _dt
import html as html_mod
import json
import re
import time
from pathlib import Path

import httpx

_UA = "qianxi-blog-hotspot-pipeline/1.0"
_TIMEOUT = httpx.Timeout(25.0, connect=10.0)

# 图床（GitHub My_image）——SSH deploy key，无 token
_IMAGE_REPO = "git@github.com:qianxi-00/My_image.git"
_IMAGE_BRANCH = "main"
_IMAGE_PREFIX = "blog/images"
_IMAGE_KEY = "/root/.ssh/github_my_image_deploy"
_FIGURE_STAGE = Path("/data/pipeline/figures")

# OpenAlex 的 arXiv 源 ID（实测：限定它可过滤掉 zenodo/期刊预印本噪音）
_OPENALEX_ARXIV_SOURCE = "S4306400194"


def _get(url: str, **kw) -> httpx.Response:
    """带重试的 GET。

    两类失败分开处理（二十四期实测教训）：
    - 传输层（SSL EOF）：本地与容器都出现过，立即重试一次即可过；
    - **429 限流**：arXiv 会按出口 IP 限流（实测服务器 IP 101.32.163.17
      被持续 429 `Rate exceeded.`，等 60s 也不恢复）。429 是正常 HTTP 响应，
      不抛 TransportError，所以原实现完全没重试就把它当成"检索失败"了——
      这是"检索不到论文"的直接原因。这里对 429/503 做指数退避。
    """
    last: Exception | None = None
    for attempt in range(3):
        try:
            r = httpx.get(url, headers={"User-Agent": _UA}, timeout=_TIMEOUT,
                          follow_redirects=True, **kw)
            if r.status_code in (429, 503) and attempt < 2:
                time.sleep(2 ** attempt * 3)  # 3s, 6s
                continue
            return r
        except (httpx.TransportError, httpx.HTTPError) as exc:
            last = exc
            if attempt < 2:
                time.sleep(1)
                continue
    if last is not None:
        raise last
    return r  # type: ignore[possibly-undefined]


# ---------------------------------------------------------------------------
# 论文检索（选题层输入）
# ---------------------------------------------------------------------------

# 只在这些分类里找技术论文（cs.LG 等），避免灌水与纯理论
_TECH_CATEGORIES = (
    "cs.LG", "cs.CL", "cs.AI", "cs.CV", "cs.RO",
    "cs.DC", "cs.SE", "cs.CR", "cs.NE", "stat.ML",
)


def search_papers(
    topic: str,
    months_back: int = 3,
    max_results: int = 8,
    include_categories: str = "",
) -> str:
    """按主题检索 arXiv 近若干月论文（技术类为主），返回带摘要/日期/链接的清单。

    topic: 检索关键词（英文短语效果最好，中文会显著降低召回）
    months_back: 只看最近几个月（0=不限）
    include_categories: 逗号分隔的 arXiv 分类，如 "cs.CL,cs.AI"；留空用默认技术集
    """
    cats = [c.strip() for c in (include_categories or ",".join(_TECH_CATEGORIES[:6])).split(",") if c.strip()]
    cat_clause = " OR ".join(f"cat:{c}" for c in cats)
    try:
        # 必须 https：export.arxiv.org 已把 http 全量 301 到 https
        r = _get(
            "https://export.arxiv.org/api/query",
            params={
                "search_query": f"(all:{topic}) AND ({cat_clause})",
                "start": 0,
                "max_results": max_results,
                "sortBy": "submittedDate",
                "sortOrder": "descending",
            },
        )
        r.raise_for_status()
        entries = re.findall(r"(?s)<entry>(.*?)</entry>", r.text)
        if not entries:
            return "无结果：换英文关键词、放宽分类或去掉近月限制。"
        lines = []
        for e in entries:
            title = re.search(r"(?s)<title>(.*?)</title>", e)
            summary = re.search(r"(?s)<summary>(.*?)</summary>", e)
            pub = re.search(r"<published>(.*?)</published>", e)
            aid = re.search(r"<id>(.*?)</id>", e)
            cats_m = re.findall(r'term="([^"]+)"', e)
            t = re.sub(r"\s+", " ", title.group(1)).strip() if title else "?"
            s = re.sub(r"\s+", " ", summary.group(1)).strip() if summary else ""
            # 近月过滤（如果请求了）
            date = pub.group(1)[:10] if pub else "?"
            if months_back > 0 and date != "?":
                from datetime import date as _d, timedelta
                try:
                    if _d.fromisoformat(date) < _d.today() - timedelta(days=31 * months_back):
                        continue
                except ValueError:
                    pass
            cats_clean = ",".join(dict.fromkeys(cats_m))[:80]
            lines.append(
                f"- {t}\n  [{date}] {cats_clean}\n  {s[:300]}\n  {aid.group(1) if aid else ''}"
            )
        return "\n".join(lines) if lines else "结果都超出近月窗口，试试 months_back=0 或更通用的关键词。"
    except Exception as exc:
        return f"arXiv 检索失败: {exc}"


def _search_hf_papers(query: str, max_results: int, months_back: int) -> str:
    """HuggingFace daily_papers 兜底源：返回 arXiv ID + 标题 + 摘要 + 日期。

    为什么用它兜底（二十四期实测）：arXiv API 按出口 IP 限流后，
    `arxiv.org/html` 全文仍可读、HuggingFace 的每日论文 API 也 200——
    所以"列表检索"断了不等于"论文读不了"。HF 还自带社区热度（upvotes），
    比 arXiv 原始时间序列表更有信号。返回格式与 search_papers 对齐。
    """
    r = _get("https://huggingface.co/api/daily_papers", params={"limit": max(12, max_results)})
    if r.status_code != 200:
        return f"（HuggingFace 兜底源 HTTP {r.status_code}）"
    try:
        items = r.json()
    except Exception as exc:
        return f"（HuggingFace 兜底源解析失败: {exc}）"
    cutoff = _dt.date.today() - _dt.timedelta(days=31 * months_back) if months_back > 0 else None
    lines: list[str] = []
    for it in items:
        p = (it or {}).get("paper") or {}
        aid = str(p.get("id") or "").strip()
        if not re.fullmatch(r"\d{4}\.\d{4,5}", aid):
            continue
        pub = str(p.get("publishedAt") or "")[:10]
        if cutoff and pub:
            try:
                if _dt.date.fromisoformat(pub) < cutoff:
                    continue
            except ValueError:
                pass
        title = re.sub(r"\s+", " ", str(p.get("title") or "?")).strip()
        summ = re.sub(r"\s+", " ", str(p.get("summary") or "")).strip()
        lines.append(
            f"- {title}\n  [{pub}] HF-daily upvotes={p.get('upvotes', 0)}\n  {summ[:300]}\n  https://arxiv.org/abs/{aid}"
        )
        if len(lines) >= max_results:
            break
    return "\n".join(lines) if lines else "（HuggingFace 兜底源无近期论文）"


def _search_openalex(query: str, max_results: int, months_back: int) -> str:
    """OpenAlex 兜底源（第一顺位）：**限定 arXiv 源**做真检索。

    实测定序（二十四期）：
    - 裸 `search=` 会捞进社会学/教育学论文（查 "LLM agent tool use" 返回
      "Employee Creativity"），噪音太大；
    - 加 `title_and_abstract.search` 好一些，但仍混入 zenodo/期刊预印本；
    - **限定 arXiv 源 `locations.source.id:S4306400194` 后结果纯是 arXiv 论文**，
      且 DOI 形如 `10.48550/arxiv.2610.13708` 能可靠反解出 arXiv ID
      ——规划层后续要靠这个 ID 调 fetch_paper 读全文，所以这条最关键。
    """
    since = (_dt.date.today() - _dt.timedelta(days=31 * months_back)).isoformat() if months_back > 0 else ""
    filters = [
        f"title_and_abstract.search:{query}",
        f"locations.source.id:{_OPENALEX_ARXIV_SOURCE}",  # 只要 arXiv 论文
    ]
    if since:
        filters.append(f"from_publication_date:{since}")
    r = _get(
        "https://api.openalex.org/works",
        params={
            "filter": ",".join(filters),
            "per_page": max_results,
            "sort": "publication_date:desc",
            "mailto": "pipeline@blog.local",  # OpenAlex 礼貌池
        },
    )
    if r.status_code != 200:
        return f"（OpenAlex 兜底源 HTTP {r.status_code}）"
    try:
        results = (r.json() or {}).get("results") or []
    except Exception as exc:
        return f"（OpenAlex 兜底源解析失败: {exc}）"
    lines: list[str] = []
    for w in results[:max_results]:
        title = re.sub(r"\s+", " ", str(w.get("display_name") or "?")).strip()
        date = str(w.get("publication_date") or "?")
        # 摘要：OpenAlex 用倒排索引，重建
        aii = w.get("abstract_inverted_index") or {}
        pos: dict[int, str] = {}
        for word, idxs in aii.items():
            for i in (idxs or [])[:1]:
                pos[i] = word
        summ = " ".join(pos[k] for k in sorted(pos))[:300] if pos else ""
        # arXiv ID：DOI 10.48550/arxiv.<id> 是最可靠的形式（实测），再兜底其它形态
        blob = " ".join([
            str(w.get("doi") or ""),
            json.dumps(w.get("ids") or {}, ensure_ascii=False),
            json.dumps(w.get("locations") or [], ensure_ascii=False),
        ])
        aid = ""
        for pat in (
            r"arxiv[./](\d{4}\.\d{4,5})",
            r"arxiv\.org/(?:abs|pdf|html)/(\d{4}\.\d{4,5})",
        ):
            m = re.search(pat, blob, re.I)
            if m:
                aid = m.group(1)
                break
        ref = f"https://arxiv.org/abs/{aid}" if aid else str(w.get("doi") or w.get("id") or "")
        lines.append(f"- {title}\n  [{date}] OpenAlex/arXiv\n  {summ}\n  {ref}")
    return "\n".join(lines) if lines else "（OpenAlex 兜底源无结果）"


def search_papers_multi(
    topic: str,
    months_back: int = 3,
    max_results: int = 6,
) -> tuple[str, str]:
    """多源论文检索：arXiv 优先，被限流时自动切 OpenAlex → HuggingFace。

    返回 (清单文本, 实际使用的源名)。二十四期加：实测服务器出口 IP 被
    arXiv 持续 429/超时，单源会让整条流水线"检索不到论文"而空转。

    兜底顺序有讲究（实测定序）：
    - **OpenAlex 第一顺位**：支持真正的按词检索，实测查
      "speculative decoding kv cache" 第一条就命中 Adaptive DHiSparse；
    - **HuggingFace 第二顺位**：`daily_papers` **不接受查询词**（实测两次
      不同查询返回完全相同的结果），只能给"当日热门论文"，所以它只配做
      "arXiv/OpenAlex 都不行时，至少给规划层一批真实存在的新论文"的兜底。
    """
    arxiv = search_papers(topic, months_back=months_back, max_results=max_results)
    if not arxiv.startswith(("arXiv 检索失败", "无结果", "结果都超出近月窗口")):
        return arxiv, "arxiv"
    print(f"[hotspot-pipeline] arXiv 不可用（{arxiv[:70]}），切 OpenAlex")

    oa = _search_openalex(topic, max_results, months_back)
    if not oa.startswith("（"):
        return oa, "openalex"

    print(f"[hotspot-pipeline] OpenAlex 也不可用（{oa[:60]}），切 HuggingFace 当日论文")
    hf = _search_hf_papers(topic, max_results, months_back)
    if not hf.startswith("（"):
        return hf, "huggingface"

    return f"所有论文源都不可用：arXiv={arxiv[:80]}；OpenAlex={oa[:80]}；HF={hf[:80]}", "none"


# ---------------------------------------------------------------------------
# 论文深读（规划层输入）
# ---------------------------------------------------------------------------

# arXiv 新版 HTML 用 <object data="..."> 嵌图，老版用 <img src="...">，两者都要抓
_FIG_SRC_RE = re.compile(r'<(?:img[^>]+src|object[^>]+data)="([^"]+)"', re.I)
_SEC_HEAD_RE = re.compile(r'<h([1-3])[^>]*>(.*?)</h\1>', re.S)


def fetch_paper(arxiv_id_or_url: str) -> str:
    """读一篇 arXiv 论文的 HTML 全文版，返回：章节结构 + 候选配图清单。

    优先 arXiv HTML（ar5iv/arxiv html），能拿到 figure/table 图位与章节标题；
    没有 HTML 版（老论文）时退回 abstract，函数会说明。
    """
    aid = arxiv_id_or_url.strip()
    m = re.search(r"(\d{4}\.\d{4,5})(v\d+)?", aid)
    if not m:
        return f"不是有效的 arXiv ID/URL: {arxiv_id_or_url}"
    base = m.group(1)

    html_url = f"https://arxiv.org/html/{base}"
    try:
        r = _get(html_url)
        if r.status_code == 200 and len(r.text) > 20000:
            doc = r.text
        else:
            # 尝试 ar5iv
            r5 = _get(f"https://ar5iv.labs.arxiv.org/html/{base}")
            if r5.status_code == 200 and len(r5.text) > 20000:
                doc = r5.text
                html_url = f"https://ar5iv.labs.arxiv.org/html/{base}"
            else:
                # 无 HTML 版：退回 abstract
                ab = _get(f"https://export.arxiv.org/api/query?id_list={base}")
                title = re.search(r"(?s)<entry>.*?<title>(.*?)</title>", ab.text)
                summ = re.search(r"(?s)<entry>.*?<summary>(.*?)</summary>", ab.text)
                t = re.sub(r"\s+", " ", title.group(1)).strip() if title else base
                s = re.sub(r"\s+", " ", summ.group(1)).strip() if summ else ""
                return f"[无HTML版，仅摘要] {t}\n{s[:1200]}"
    except Exception as exc:
        return f"论文抓取失败: {exc}"

    # 章节结构
    secs = []
    for level, raw in _SEC_HEAD_RE.findall(doc):
        name = html_mod.unescape(re.sub(r"\s+", " ", re.sub(r"(?s)<[^>]+>", "", raw))).strip()
        if name and len(name) < 80 and not name.lower().startswith(("references", "参考文献")):
            secs.append(f"{'  ' * (int(level) - 1)}- {name}")
    secs_txt = "\n".join(secs[:40]) or "(未识别到章节标题)"

    # 候选配图（figure/table 的图位 + caption），过滤掉 logo/公式小图
    figs = []
    for m in re.finditer(
        r'(?s)<figure.*?</figure>', doc
    ):
        block = m.group(0)
        src = _FIG_SRC_RE.search(block)
        cap = re.search(r"(?s)<figcaption.*?>(.*?)</figcaption>", block)
        caption = html_mod.unescape(
            re.sub(r"\s+", " ", re.sub(r"(?s)<[^>]+>", " ", cap.group(1)))
        ).strip() if cap else ""
        if not src:
            continue
        u = src.group(1)
        if not u or any(x in u.lower() for x in ("logo", "icon", "sprite", "author", "eqn", ".gif")):
            continue
        if u.startswith("//"):
            u = "https:" + u
        elif u.startswith("/"):
            u = "https://arxiv.org" + u
        elif not u.startswith("http"):
            u = html_url.rsplit("/", 1)[0] + "/" + u
        # caption 里有数据/曲线/架构描述的优先（真正有信息量的论文图）
        score = 0
        cl = caption.lower()
        for kw in ("architecture", "framework", "pipeline", "overview", "图", "架构", "对比", "comparison",
                   "ablation", "curve", "result", "accuracy", "流程"):
            if kw in cl:
                score += 1
        figs.append((score, u, caption[:180]))
    figs.sort(key=lambda x: -x[0])

    # 正文关键事实（方法/结论段落片段，给写作 subagent 用）
    return (
        f"# 论文全文 HTML: {html_url}\n\n"
        f"## 章节结构（{len(secs)} 节）\n{secs_txt}\n\n"
        f"## 候选配图（{len(figs)} 张，按信息量排序，取前 8）\n"
        + "\n".join(f"- [score={s}] {u}\n  图注: {c}" for s, u, c in figs[:8])
        + "\n\n（下载其中合适的图用 upload_image；不够的图自己画 mermaid）"
    )


# ---------------------------------------------------------------------------
# 图床上传（deploy key，无 token）
# ---------------------------------------------------------------------------

_IMG_OK_RE = re.compile(r"^https://raw\.githubusercontent\.com/qianxi-00/My_image/", re.I)


def stage_figures(slug: str, figures_json: str) -> str:
    """把规划层选定的论文图下载到共享卷并产出待推清单（容器侧可做，无 git 依赖）。

    figures_json: JSON 数组，每项 {"url": 图直链, "name": 文件名, "caption": 图注}
    返回 JSON 字符串：{"staged":[{rel,raw_url,caption}], "failed":[...]}，
    其中 raw_url 在宿主推图成功后即刻可用；推图脚本 push_figures.sh 负责
    提交，本函数只负责"下载 + 排好路径 + 给出预期 URL"。
    """
    try:
        items = json.loads(figures_json)
        if not isinstance(items, list):
            return json.dumps({"staged": [], "failed": ["figures_json 不是数组"]}, ensure_ascii=False)
    except Exception as exc:
        return json.dumps({"staged": [], "failed": [f"JSON 解析失败: {exc}"]}, ensure_ascii=False)

    staged, failed = [], []
    for it in items[:6]:  # 单篇最多 6 张，多了页面太碎
        url = str(it.get("url") or "")
        if not url:
            failed.append("(空 url)")
            continue
        try:
            r = _get(url)
            if r.status_code != 200 or len(r.content) < 2000:
                failed.append(f"{url} HTTP {r.status_code} {len(r.content)}B")
                continue
            ctype = r.headers.get("content-type", "")
            ext = ".jpg" if "jpeg" in ctype or "jpg" in ctype else (".svg" if "svg" in ctype else ".png")
            name = re.sub(r"[^a-zA-Z0-9_-]+", "-", str(it.get("name") or Path(url.split("?")[0]).stem)).strip("-")[:48] or "fig"
            rel = f"{_IMAGE_PREFIX}/{_dt.date.today():%Y-%m}/{slug}/{name}{ext}"
            # 下载到共享卷（宿主 /data/blog/data/pipeline/figures/…），宿主推图脚本从这里取
            dst = _FIGURE_STAGE / rel
            dst.parent.mkdir(parents=True, exist_ok=True)
            dst.write_bytes(r.content)
            staged.append({
                "rel": rel,
                "host_path": str(dst),
                "raw_url": f"https://raw.githubusercontent.com/qianxi-00/My_image/{_IMAGE_BRANCH}/{rel}",
                "caption": str(it.get("caption") or "")[:160],
                "bytes": len(r.content),
            })
        except Exception as exc:
            failed.append(f"{url} {type(exc).__name__}: {exc}")
    return json.dumps({"staged": staged, "failed": failed}, ensure_ascii=False)


def push_figures(manifest_json: str) -> str:
    """宿主侧用：把已 staged 的图推上 My_image（git 在宿主，容器内不可用）。

    manifest_json: stage_figures 返回的 JSON。
    返回每张图的 {"rel": raw_url 或 错误} 映射。
    """
    import subprocess

    try:
        data = json.loads(manifest_json)
    except Exception as exc:
        return json.dumps({"ok": False, "error": f"manifest 解析失败: {exc}"}, ensure_ascii=False)
    staged = data.get("staged") or []
    if not staged:
        return json.dumps({"ok": True, "results": [], "note": "无待推图片"})

    work = Path("/tmp/img_push_batch")
    subprocess.run(["rm", "-rf", str(work)], check=False)
    work.mkdir(parents=True, exist_ok=True)
    env = {"GIT_SSH_COMMAND": f"ssh -i {_IMAGE_KEY} -o IdentitiesOnly=yes -o BatchMode=yes",
           "PATH": "/usr/bin:/bin:/usr/local/bin"}
    try:
        for c in (["git", "init", "-q"],
                  ["git", "remote", "add", "origin", _IMAGE_REPO],
                  ["git", "-c", "protocol.version=2", "fetch", "-q", "--depth=1", "origin", _IMAGE_BRANCH],
                  ["git", "reset", "-q", "--hard", f"origin/{_IMAGE_BRANCH}"]):
            subprocess.run(c, cwd=work, check=True, env=env, capture_output=True)
        added = 0
        for item in staged:
            # manifest 是容器写的，host_path 是容器路径（/data/pipeline/…）；
            # 宿主上共享卷挂在 /data/blog/data → 容器 /data，直接用会 is_file()=False
            # 全部静默跳过。这里做一次挂载前缀映射（容器 /data/X → 宿主 /data/blog/data/X）。
            raw = str(item.get("host_path") or "")
            src = Path(raw)
            if not src.is_file() and raw.startswith("/data/"):
                src = Path("/data/blog/data") / raw[len("/data/"):]
            rel = str(item.get("rel") or "")
            if not src.is_file() or not rel:
                continue
            dst = work / rel
            dst.parent.mkdir(parents=True, exist_ok=True)
            dst.write_bytes(src.read_bytes())
            subprocess.run(["git", "add", rel], cwd=work, check=True, env=env, capture_output=True)
            added += 1
        if not added:
            return json.dumps({"ok": False, "error": "没有可推的文件（host_path 不存在？）"}, ensure_ascii=False)
        subprocess.run(["git", "config", "user.email", "pipeline@blog.local"], cwd=work, check=True, env=env)
        subprocess.run(["git", "config", "user.name", "hotspot-pipeline"], cwd=work, check=True, env=env)
        subprocess.run(["git", "commit", "-qm", f"img: {added} figure(s) for pipeline"], cwd=work, check=True, env=env)
        p = subprocess.run(["git", "push", "origin", f"HEAD:{_IMAGE_BRANCH}"], cwd=work,
                           env=env, capture_output=True, text=True)
        ok = p.returncode == 0
        return json.dumps({"ok": ok, "pushed": added, "error": (p.stderr or "")[-300:] if not ok else ""},
                          ensure_ascii=False)
    except Exception as exc:
        return json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False)
    finally:
        subprocess.run(["rm", "-rf", str(work)], check=False)


# ---------------------------------------------------------------------------
# 汇总成 LLM 可用的工具集
# ---------------------------------------------------------------------------

HARNESS_TOOLS = [search_papers, fetch_paper]