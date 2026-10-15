"""二十三期 harness：执行层——按规划并发写章节。

这是"一口气吐整篇"的解药：一次 LLM 调用只写一节，词数预算明确（规划层
给的 target_chars），写完立刻自检（字数/配图/事实分层），不达标当场重写该节。
章节之间并发（asyncio.gather），互不阻塞；汇总层最后把它们拼成整篇。

对应千禧的要求："在具体的去实现每一个章节，每个章节这里你甚至可以让他派
subagent 去实现"——这里用 LangGraph 原生 fan-out（asyncio.gather）实现并发
章节 agent；接口设计成将来可换成 deepagents 的 subagent（每个章节一个
SubAgentMiddleware），本期先不引依赖。
"""

from __future__ import annotations

import asyncio
from typing import Any

import yaml
from langchain_core.messages import HumanMessage, SystemMessage

from .graph import _chinese_chars, _extract_json, _llm, _log
from .tools import validate_mermaid_blocks

SECTION_WRITER_SYSTEM_PROMPT = """你是《千禧 DevLog》的技术作者，负责撰写文章中的**一个章节**。

读者：AI 从业者与深度学习者，要技术深度不要资讯转述。
你拿到：整篇的写作计划（目标/标题/大纲）+ 你负责这一节的具体要求 + 相关论文材料。

# 这一节怎么写
- 开头直接进内容（不要"本节将介绍..."这类导语废话——整篇有专门的导语段）
- 按 target_chars 上下浮动写足，宁深勿注水；技术机制讲清"为什么这样设计、代价是什么"
- 用 Markdown，可用：段落、列表、**加粗**、`代码`、表格（| --- |）、mermaid 图
- 需要 mermaid 时严格用白名单图型：graph/flowchart、sequenceDiagram、classDiagram、
  stateDiagram-v2、erDiagram、pie、timeline、gantt；节点 id 只用英文字母数字下划线，
  中文放方括号 A["注意力计算"]
- 三层事实区分：用"官方/论文明确""社区观察""笔者推断"等措辞标出来
- 不要写章节标题（## 标记由汇总层统一加），只输出本节正文
- 引用资料时带上出处线索（论文名/arXiv ID/URL），汇总层会整理成参考资料段

# 输出格式（严格）
直接输出本节正文 Markdown，不要解释、不要 frontmatter、不要重复章节标题。
"""


# 二十三期实测：stepfun 渠道并发上限 5，实测 3 并发在有其他请求时仍会 429
# （current: 6）。留足余量用 2——章节多写几十秒无所谓，429 重试反而更慢。
MAX_CONCURRENT_SECTIONS = 2


async def write_sections(plan: dict[str, Any], materials: str, fix_hint: str = "") -> list[dict[str, Any]]:
    """并发写所有章节，返回每节结果 [{heading, md, chars, figure_used}]。

    信号量限流（3 并发，留余量）+ 每节最多 2 次尝试，429 自动退避重试。
    fix_hint：闸/审稿意见（第二轮带进每节，让 agent 针对性修而不是盲改）。
    """
    sections = plan.get("sections") or []
    if not isinstance(sections, list) or not sections:
        raise ValueError("规划层没有章节，无法写作")
    _log(f"执行层：并发写 {len(sections)} 个章节（每节一个 agent，并发上限 {MAX_CONCURRENT_SECTIONS}）")
    sem = asyncio.Semaphore(MAX_CONCURRENT_SECTIONS)

    async def run_one(idx: int, section: dict) -> dict[str, Any]:
        async with sem:
            return await _write_one(plan, section, materials, idx, fix_hint)

    tasks = [asyncio.create_task(run_one(i, s)) for i, s in enumerate(sections)]
    results = await asyncio.gather(*tasks)

    # 缺口补写：偶发限流/异常会让个别章节空缺（实测 6/7），整篇缺一块不能忍——
    # 串行重试这些失败章节（串行不会再撞并发上限）
    missing = [i for i, r in enumerate(results) if not r.get("md")]
    if missing:
        _log(f"补写 {len(missing)} 个失败章节: {[str(sections[i].get('heading'))[:14] for i in missing]}")
        for i in missing:
            results[i] = await _write_one(plan, sections[i], materials, i, fix_hint)

    ok = [r for r in results if r.get("md")]
    _log(f"执行层：{len(ok)}/{len(sections)} 章节完成")
    return results


async def _llm_with_retry(temperature: float, messages: list, attempts: int = 6) -> str:
    """带退避的 LLM 调用：429/限流/超时都退避重试（stepfun 渠道高频触发）。

    attempts=6、退避 10s×attempt：429 在 3-4 次后才稳（实测 8/16/24s 三次
    退避才过），章节级失败等于整篇缺一块，不能省。
    二十四期末补超时分支：单节要吐 800-1000 汉字技术正文，step-5-preview
    偶发 3 分钟以上；以前超时会走到 break 直接放弃该节，现在按 429 同样
    退避重试（超时多发生在渠道拥挤时，等一会儿就好）。
    """
    import asyncio as _a

    last_exc: Exception | None = None
    for i in range(attempts):
        try:
            resp = await _llm(temperature=temperature).ainvoke(messages)
            return resp.content if isinstance(resp.content, str) else str(resp.content)
        except Exception as exc:
            last_exc = exc
            msg = str(exc)
            low = msg.lower()
            if "429" in msg or "rate_limit" in low or "concurrency" in low:
                wait = 10 * (i + 1)
                _log(f"章节调用限流（{msg[:50]}）——{wait}s 后重试({i + 2}/{attempts})")
                await _a.sleep(wait)
                continue
            if "timed out" in low or "timeout" in low:
                wait = 10 * (i + 1)
                _log(f"章节调用超时（{msg[:50]}）——{wait}s 后重试({i + 2}/{attempts})")
                await _a.sleep(wait)
                continue
            if i == attempts - 1:
                break
            await _a.sleep(3)
    raise last_exc  # type: ignore[misc]


async def _write_one(plan: dict, section: dict, materials: str, idx: int, fix_hint: str = "") -> dict[str, Any]:
    heading = str(section.get("heading") or f"第{idx + 1}节")
    target = int(section.get("target_chars") or 0)
    fig = section.get("figure") or {}
    key_points = section.get("key_points") or []

    human = f"""文章标题: {plan.get('title')}
文章目标: {plan.get('goal')}
本章任务: 写「{heading}」
本章目的: {section.get('purpose')}
目标字数: {target} 汉字（这是硬要求，上下浮动 15%，不要注水）
必须覆盖的要点:
{chr(10).join('- ' + str(k) for k in key_points) if key_points else '- （规划未列，自行把握）'}
配图要求: kind={fig.get('kind', 'none')} {('图注: ' + str(fig.get('caption'))) if fig.get('caption') else ''}
{('mermaid 内容要求: ' + str(fig.get('mermaid_draft'))) if fig.get('kind') == 'mermaid' else ''}
{('注意: 论文原图由汇总层统一插入，你本节正文里不要写图片链接，只需在合适位置写一行占位（形如 <!-- FIGURE: 图注 -->）') if fig.get('kind') == 'paper' else ''}

可用论文材料（来自主锚论文全文/摘要，仅供引用事实）:
{materials[:4500]}
{('【本轮必须修的问题（来自结构校验/审稿）】' + chr(10) + fix_hint) if fix_hint else ''}

输出本节正文（Markdown，不要 ## 标题）："""

    for attempt in range(2):  # 每节最多 2 次尝试（第二次带自检反馈）
        try:
            md = await _llm_with_retry(
                0.3,
                [SystemMessage(content=SECTION_WRITER_SYSTEM_PROMPT), HumanMessage(content=human)],
            )
            md = _strip_duplicate_heading(md, heading)
            chars = _chinese_chars(_strip_mermaid(md))
            # 章节级自检：字数不足 85% 或 mermaid 非法 → 带反馈重试。
            # 阈值曾是 60%——实测这是"整篇反复踩 6000 线"的元凶：7 节各写
            # 目标的 60% 就能通过自检，合计恰好 ~5990 字卡在闸下，然后整篇
            # 回修 3-4 轮（每轮重写全部章节，代价极大）。单节就该写够。
            problems = []
            if chars < target * 0.85:
                problems.append(f"字数 {chars} 不足目标 {target} 的 85%——写足技术细节")
            mm = validate_mermaid_blocks(md)
            if mm:
                problems.append("mermaid 校验失败: " + "; ".join(mm[:3]))
            if not problems:
                return {"heading": heading, "md": md, "chars": chars, "figure_kind": fig.get("kind", "none")}
            human += f"\n\n【上一稿问题（必须修）】{'; '.join(problems)}\n请重写本节。"
        except Exception as exc:
            _log(f"执行层：第{idx + 1}节生成异常 {exc}")
            break
    # 两次都失败/仍不达标：把最后一稿交上去（汇总层+回检层兜底，不丢内容）
    return {"heading": heading, "md": md if "md" in locals() else "", "chars": chars if "chars" in locals() else 0,
            "figure_kind": fig.get("kind", "none")}


def _strip_duplicate_heading(md: str, heading: str) -> str:
    """模型偶尔会在正文里重复写 ## 标题，汇总层会统一加——这里去掉模型自己写的。"""
    lines = [ln for ln in md.splitlines() if not (ln.strip().lstrip("#").strip() == heading.strip() and ln.strip().startswith("#"))]
    return "\n".join(lines).strip()


def _strip_mermaid(md: str) -> str:
    """去掉 mermaid 代码块再数字数（mermaid 不是正文汉字）。"""
    import re

    return re.sub(r"(?s)```mermaid.*?```", "", md)


# ---------------------------------------------------------------------------
# 汇总层：把章节拼成整篇 frontmatter + 正文
# ---------------------------------------------------------------------------

ASSEMBLY_NOTE = "（图）"


def assemble(
    plan: dict,
    results: list[dict],
    sources: list[dict],
    topic_date: str,
    generated_at: str,
    queue_slot: str = "pipeline",
) -> str:
    """汇总层：章节 + 配图占位 + frontmatter + 参考资料 → 完整文章 md。

    frontmatter 必须是真 YAML（_parse_frontmatter 用 yaml.safe_load 解析，
    手拼字符串一旦格式不对整个 fm 变空 dict——二十三期实测踩过：sources 写成
    markdown 链接导致标题/字数全解析成 0）。这里用 yaml.safe_dump 生成。
    """
    title = str(plan.get("title") or "").strip()
    if not title:
        # 汇总层兜底：规划层丢标题时不能写出空 frontmatter（实测 10-15：
        # 空标题让结构闸反复失败、整轮空转）。从 goal 或首节标题派生一个。
        seed = str(plan.get("goal") or "").strip()
        if not seed:
            secs = plan.get("sections") or []
            seed = str((secs[0] or {}).get("heading") or "") if secs else ""
        import re as _re

        title = _re.sub(r"\s+", " ", seed).strip("。.：: ").split("：")[0].split(":")[0].strip()[:28] or "技术深度解读"
        _log(f"汇总层兜底标题: {title!r}（规划层未给）")
    slug = str(plan.get("slug") or "")
    if not slug:
        import re as _re

        slug = _re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")[:40] or "post"
        _log(f"汇总层兜底 slug: {slug!r}")
    summary = str(plan.get("summary") or "")
    primary_category = str(plan.get("primary_category") or "其他")
    tags = ["AI", str(plan.get("topic_tag") or "技术")]

    src_items = []
    for s in sources[:8]:
        url = s.get("url") or ""
        if url:
            src_items.append({"name": str(s.get("name") or s.get("title") or "来源")[:80], "url": url})
    if not src_items:
        src_items = [{"name": "来源待补", "url": "https://arxiv.org/"}]

    fm = {
        "title": title,
        "slug": slug,
        "summary": summary,
        "topic_date": topic_date,
        "primary_category": primary_category,
        "tags": tags,
        "sources": src_items,
        # queue_slot 是审稿的一票否决字段（二十三期实测：缺它即使内容
        # 90 分也被判 revise "此为当前唯一一票否决项"）
        "queue_slot": queue_slot,
        "generated_at": generated_at,
    }
    # safe_dump + allow_unicode：中文标题/摘要不能转义成 \uXXXX
    fm_text = yaml.safe_dump(fm, allow_unicode=True, sort_keys=False, width=10000)

    parts = ["---", fm_text.rstrip("\n"), "---", ""]

    for r in results:
        if not r.get("md"):
            continue
        parts.append(f"## {r['heading']}")
        parts.append("")
        parts.append(r["md"].strip())
        parts.append("")

    parts.append("## 参考资料")
    parts.append("")
    for it in src_items:
        parts.append(f"- [{it['name']}]({it['url']})")
    parts.append("")

    return "\n".join(parts)