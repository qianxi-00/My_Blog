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


def _get(url: str, **kw) -> httpx.Response:
    """带一次重试的 GET：arXiv 偶发 SSL EOF（本地与容器都出现过），重试一次即可过。"""
    last: Exception | None = None
    for _ in (0, 1):
        try:
            return httpx.get(url, headers={"User-Agent": _UA}, timeout=_TIMEOUT,
                            follow_redirects=True, **kw)
        except (httpx.TransportError, httpx.HTTPError) as exc:
            last = exc
    raise last  # type: ignore[misc]


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