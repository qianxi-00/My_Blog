"""二十三期 harness：LangGraph 主图——规划 → 章节并发 → 汇总 → 回检 → 入队/发布。

与老流水线的区别（千禧要求"做成真正的 agent harness 形式"）：
- 老：选题 → 一次性检索 → 一口气写整篇 → 闸 → 审稿（首稿常年 4000-5000 字，
  被字数闸打回 3 次才勉强够）
- 新：**规划层**（目标/todolist/章节大纲/配图计划）→ **执行层**（每章一个 agent
  并发写，各有词数预算与自检）→ **汇总层**（拼成整篇 + 插论文原图）→
  **回检层**（复用二十二期字数/标题/mermaid 闸）→ 入队/发布

保留二十一期 loop 闭环（超轮回炉一次）与二十二期质量闸，只是把"写作"从
一个巨型节点换成 harness 的三层。图拓扑：

  plan ─► write_sections ─► assemble ─► check ─► review ─► enqueue ─► publish
   ▲         (并发)                          │        │(revise)  │
   └───────── retry（超轮清盘重来）───────────┘        └────────┘
"""

from __future__ import annotations

import asyncio
import datetime as dt
import re
from pathlib import Path
from typing import Any, Literal

import yaml
from langchain_core.messages import HumanMessage, SystemMessage

from .graph import (
    _chinese_chars,
    _llm,
    _log,
    _parse_frontmatter,
    _route_after_enqueue,
    check_mermaid,
    enqueue,
    failed,
    publish,
    retry,
    review,
    _route_after_mermaid,
    _route_after_review,
    recent_titles_for_dedupe,
)
from .planner import plan_article, validate_plan
from .prompts import KNOWLEDGE_TRACKS
from .tools import search_aihot
from .writer import assemble, write_sections
from .paper_tools import fetch_paper, search_papers


async def plan_node(state: dict) -> dict:
    """规划层节点：定目标/todolist/章节/配图，选题=锚定主锚论文。"""
    mode = state.get("mode", "hot")
    track_slot = state.get("track_slot", "")
    # KNOWLEDGE_TRACKS 是 slot→线名 的 str 映射
    track_name = KNOWLEDGE_TRACKS.get(track_slot, "")

    if mode == "hot":
        # hot 模式：从 AIHOT 池取线索（但选题主体是论文）。
        # @tool 装饰后是 StructuredTool，必须 .invoke 不能直接调用
        hint = (await search_aihot.ainvoke({"category": "paper"}))[:1500]
    else:
        hist = _PLAN_CTX.get("lesson_history") or "（无）"
        hint = f"知识线: {track_name}。已讲过: {hist[:600]}"

    plan = await plan_article(
        topic_hint=hint,
        mode=mode,
        track_name=track_name,
        recent_titles=_PLAN_CTX.get("recent_titles", ""),
        lesson_history=_PLAN_CTX.get("lesson_history", ""),
    )
    errs = validate_plan(plan)
    if errs:
        _log(f"规划层校验不通过: {errs[:3]}")
        # 修一次 + 程序兜底。兜底后仍不合法（只有内容类问题）才继续往下走：
        # 让结构闸与审稿去判，而不是在这里浪费整条管线
        plan = await _repair_plan(plan, errs)
        remaining = validate_plan(plan)
        if remaining:
            _log(f"修复后仍有问题（交由后续闸/审稿）: {remaining[:3]}")
    materials = plan.get("_paper_material", "")
    return {
        "plan": plan,
        "topic": plan.get("goal", "")[:200],
        "direction": plan.get("summary", "")[:200],
        "topic_tag": plan.get("topic_tag", "技术"),
        "primary_category": plan.get("primary_category", "其他"),
        "structure_round": 0,
        "log": [f"规划完成: {plan.get('title', '?')[:40]}（{len(plan.get('sections') or [])} 节）"],
    }


async def _repair_plan(plan: dict, errs: list[str]) -> dict:
    """把校验问题回灌给 LLM 修一次规划；修不动就用程序兜底裁剪。

    二十三期实测：修复轮 LLM 常把论文材料原文吐回来当"修复结果"（JSON 解析
    直接炸）。此时不能"保留原计划"带病往下走——超 32 字标题和 9 节都会一路
    带到审稿扣分。程序裁剪是更可靠的最后一道。
    """
    try:
        resp = await _llm(temperature=0).ainvoke([
            SystemMessage(
                content=(
                    "你是技术主编。修下面这份写作计划里被程序校验挑出的问题，"
                    "只输出修好的完整 JSON 计划，不要输出任何论文原文或解释。"
                )
            ),
            HumanMessage(
                content=f"问题清单:\n- " + "\n- ".join(errs)
                + f"\n\n原计划（只含 JSON 字段）:\n{yaml.safe_dump(_plan_without_material(plan), allow_unicode=True)[:4000]}"
            ),
        ])
        text = resp.content if isinstance(resp.content, str) else str(resp.content)
        from .graph import _extract_json

        fixed = _extract_json(text)  # 带中文引号修复的健壮解析
        fixed["_paper_material"] = plan.get("_paper_material", "")
        return fixed
    except Exception as exc:
        _log(f"规划修复失败，程序兜底裁剪: {exc}")
        return _coerce_plan(plan, errs)


def _plan_without_material(plan: dict) -> dict:
    """去掉论文材料（几万字符，会把 LLM 带偏成"复述论文"）。"""
    return {k: v for k, v in plan.items() if k != "_paper_material"}


def _coerce_plan(plan: dict, errs: list[str]) -> dict:
    """程序化把计划掰回合规形状（LLM 修不动时的兜底）。

    可程序判定的违规直接改：标题截到 32 字、章节合并到 ≤8、slug 兜底。
    不可程序判定的（内容质量）保持原样，交给后续闸与审稿。
    """
    out = dict(plan)
    fixed: list[str] = []

    title = str(out.get("title") or "")
    if len(title) > 32:
        # 截到第一个冒号前（"主标题：副标题"式双段结构正是被截的对象）
        head = title.split("：")[0].split(":")[0].strip()
        out["title"] = head if head and len(head) <= 32 else title[:32]
        fixed.append(f"标题截到 {len(out['title'])} 字")

    secs = out.get("sections") or []
    if isinstance(secs, list) and len(secs) > 8:
        # 超出部分并进最后一节，保持阅读顺序且不丢内容
        extra = secs[8:]
        keep = secs[:7]
        tail = dict(keep[-1])
        merged_pts = list(tail.get("key_points") or [])
        for e in extra:
            merged_pts += list(e.get("key_points") or [])
            tail["target_chars"] = int(tail.get("target_chars") or 0) + int(e.get("target_chars") or 0)
        tail["key_points"] = merged_pts[:8]
        keep.append(tail)
        out["sections"] = keep
        fixed.append(f"章节 {len(secs)} → {len(keep)}（尾部并入末节）")

    if not re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", str(out.get("slug") or "")):
        base = re.sub(r"[^a-z0-9]+", "-", str(out.get("title") or "post").lower()).strip("-")[:40] or "post"
        out["slug"] = base or "post"
        fixed.append("slug 兜底")

    out["_paper_material"] = plan.get("_paper_material", "")
    if fixed:
        _log("程序兜底: " + "；".join(fixed))
    return out


async def write_sections_node(state: dict) -> dict:
    """执行层节点：并发写所有章节（每章一个 agent，信号量限流）。

    每次重写章节都重置 structure_round —— 结构闸的"轮次"指的是"第几稿"，
    章节重写就是新一稿；不重置会让第二稿直接撞超轮上限（老图每次 write 都是
    整篇重写所以看不出来）。
    """
    plan = state.get("plan") or {}
    materials = plan.get("_paper_material", "")
    # 回修时带上闸/审稿意见：让章节 agent 知道这轮要修什么（老图靠 prompt
    # 拼接，harness 直接把问题贴进每节的 human message）
    fixes = "\n".join(f"- {e}" for e in (state.get("mermaid_errors") or []))[:1500]
    notes = str(state.get("review_notes") or "")[:800]
    results = await write_sections(plan, materials, fix_hint=f"{fixes}\n{notes}".strip())
    return {
        "section_results": results,
        "structure_round": 0,
        "log": [f"章节并发写作完成: {len([r for r in results if r.get('md')])}/{len(results)} 节"],
    }


async def assemble_node(state: dict) -> dict:
    """汇总层节点：拼成整篇 + 插入论文原图（下载暂存，给宿主推）。"""
    plan = state.get("plan") or {}
    results = state.get("section_results") or []
    topic_date = state.get("topic_date") or dt.date.today().isoformat()
    generated_at = dt.datetime.now().isoformat(timespec="seconds")

    # 先拼正文（不含参考资料），据此判定哪些辅助论文真被引用，再定 sources
    body_md = assemble(plan, results, [], topic_date, generated_at, queue_slot=state.get("queue_slot") or "pipeline")
    sources = _plan_sources(plan, draft=body_md)
    draft = assemble(plan, results, sources, topic_date, generated_at, queue_slot=state.get("queue_slot") or "pipeline")

    # 配图占位替换：把 <!-- FIGURE: xxx --> 换成真实 markdown 图（推图在宿主做，先用 raw URL）
    draft, figure_note = await _inject_figures(draft, plan)

    return {
        "draft_md": draft,
        "mermaid_errors": [],
        "log": [f"汇总成稿: {len(results)} 节" + (f"，{figure_note}" if figure_note else "")],
    }


def _plan_sources(plan: dict, draft: str = "") -> list[dict]:
    """从计划里凑来源（主锚 + 辅助论文的 arXiv 页）。

    draft 非空时只保留正文真的引用过的论文：二十三期实测审稿连续扣分
    "sources 里列的辅助论文正文完全未引用"——列了不引用比不列更糟。
    """
    src = []
    ap = plan.get("anchor_paper") or {}
    aid = str(ap.get("arxiv_id") or "").strip()
    body = draft or ""

    def _cited(pid: str) -> bool:
        # 正文里出现论文号（去点）或标题片段即视为已引用
        plain = pid.replace(".", "")
        return pid in body or plain in body

    if aid:
        # 主锚永远列：它定义了本文主题，没引用也必须在来源里（审稿认它）
        src.append({"name": f"主锚论文 {aid}", "url": f"https://arxiv.org/abs/{aid}"})
    for s in (plan.get("support_papers") or [])[:4]:
        sid = str(s or "").strip()
        if not sid:
            continue
        if draft and not _cited(sid):
            continue  # 未引用就不列，保持来源与正文一致
        src.append({"name": f"辅助论文 {sid}", "url": f"https://arxiv.org/abs/{sid}"})
    return src


async def _inject_figures(draft: str, plan: dict) -> tuple[str, str]:
    """把规划里的 paper 图占位替换成真实 markdown 图片。

    流程（容器内做不了 git）：stage_figures 下载到共享卷 → manifest 落
    _pending/ → 宿主 cron push_figures_watch.sh 推 My_image → raw URL 变 200。
    推送失败时 raw URL 404，宿主侧 _failed/ 留档可人工重推。
    """
    import json as _json

    from .paper_tools import stage_figures

    # 按章节顺序建占位符映射：slug 相同，同 caption 出现在多节时按序消耗
    by_cap: dict[str, list[dict]] = {}
    for s in plan.get("sections") or []:
        f = s.get("figure") or {}
        if f.get("kind") == "paper" and f.get("source_url"):
            cap = str(f.get("caption") or "")
            by_cap.setdefault(cap, []).append(
                {"url": f["source_url"], "name": f.get("name") or f"fig{len(by_cap)}", "caption": cap}
            )
    if not by_cap:
        return draft, ""

    items = [it for group in by_cap.values() for it in group]
    manifest = stage_figures(plan.get("slug") or "fig", _json.dumps(items))
    try:
        data = _json.loads(manifest)
    except Exception as exc:
        _log(f"配图清单解析失败，跳过论文原图: {exc}")
        return draft, ""

    staged = data.get("staged") or []
    failed = data.get("failed") or []
    if not staged:
        return draft, (f"论文原图全部下载失败（{len(failed)}）" if failed else "")

    # 逐张替换占位符：先精确匹配 caption，再用该图所属章节标题定位兜底
    used: set[int] = set()
    for item in staged:
        cap = str(item.get("caption") or "")
        img_md = f"![{cap}]({item['raw_url']})\n\n*{cap}*" if cap else f"![]({item['raw_url']})"
        placeholder = f"<!-- FIGURE: {cap} -->" if cap else "<!-- FIGURE: -->"
        if placeholder in draft:
            draft = draft.replace(placeholder, img_md, 1)
            used.add(id(item))
            continue
        # 兜底：本图所属章节的正文末尾插入（占位符被 agent 改写/漏写时不丢图）
        hit = False
        for s in plan.get("sections") or []:
            f = s.get("figure") or {}
            if f.get("kind") != "paper" or f.get("source_url") != item.get("raw_url"):
                continue
            head = str(s.get("heading") or "")
            m = re.search(rf"^## {re.escape(head)}\s*$(.*?)(?=^## |\Z)", draft, re.M | re.S)
            if m:
                draft = draft[: m.end(1)] + img_md + "\n\n" + draft[m.end(1) :]
                hit = True
            break
        if not hit:
            _log(f"配图未找到插入位置（可能被后续回修改掉）：{cap[:40]}")

    # 排队待宿主推图床：容器里没有 git，宿主脚本也不在容器挂载内
    # （容器只挂 /data/blog/data → /data），所以容器侧只负责把 manifest
    # 落进共享卷的 _pending/，宿主 cron（push_figures_watch.sh，每 2 分钟）
    # 逐个推送并移到 _done/。推送与出稿解耦，不再依赖容器能看到钩子。
    import time as _time

    pend = Path("/data/pipeline/figures/_pending")
    pend.mkdir(parents=True, exist_ok=True)
    mf = pend / f"{plan.get('slug') or 'fig'}-{_time.strftime('%Y%m%d-%H%M%S')}.json"
    mf.write_text(manifest, encoding="utf-8")
    note = f"论文原图 {len(staged)} 张已排队待推图床（宿主 cron 2 分钟内处理）"

    if failed:
        _log(f"{len(failed)} 张论文图下载失败")
    return draft, note


# ---------------------------------------------------------------------------
# 回检层：超字数/超轮 → 回规划重来（复用 retry）；review 不过 → 回重写
# ---------------------------------------------------------------------------


def _route_harness_check(state: dict) -> Literal["sections", "review", "retry", "failed"]:
    """把老图的结构闸路由适配到 harness（老图返回 "write"，harness 里是 "sections"）。"""
    r = _route_after_mermaid(state)
    return "sections" if r == "write" else r  # type: ignore[return-value]


def _route_harness_review(state: dict) -> Literal["sections", "enqueue", "retry", "failed"]:
    """审稿 revise 适配：老图返回 "write" → harness 重写章节。"""
    r = _route_after_review(state)
    return "sections" if r == "write" else r  # type: ignore[return-value]


def build_harness_graph():
    """harness 版主图（在老图基础上把 write 拆成 plan/sections/assemble 三段）。"""
    from langgraph.graph import END, START, StateGraph

    from .graph import PipelineState

    builder = StateGraph(PipelineState)
    builder.add_node("plan", plan_node)
    builder.add_node("sections", write_sections_node)
    builder.add_node("assemble", assemble_node)
    builder.add_node("check", check_mermaid)      # 复用二十二期字数/标题/mermaid 闸
    builder.add_node("review", review)            # 复用二十期审稿（含 85 分门槛）
    builder.add_node("retry", retry)              # 复用二十一期回炉
    builder.add_node("failed", failed)
    builder.add_node("enqueue", enqueue)
    builder.add_node("publish", publish)

    builder.add_edge(START, "plan")
    builder.add_edge("plan", "sections")
    builder.add_edge("sections", "assemble")
    builder.add_edge("assemble", "check")
    builder.add_conditional_edges(
        "check", _route_harness_check,
        {"sections": "sections", "review": "review", "retry": "retry", "failed": "failed"},
    )
    builder.add_conditional_edges(
        "review", _route_harness_review,
        # 审稿 revise → 回章节重写（不是整篇重写！只重写被判不合格的章节更省）
        {"sections": "sections", "enqueue": "enqueue", "retry": "retry", "failed": "failed"},
    )
    builder.add_edge("retry", "plan")
    builder.add_edge("failed", END)
    builder.add_conditional_edges("enqueue", _route_after_enqueue, {"publish": "publish", "__end__": END})
    builder.add_edge("publish", END)

    return builder.compile()


async def run_harness(
    mode: str = "hot",
    track_slot: str = "1900",
    publish_flag: bool = False,
    recent_titles: str = "",
    lesson_history: str = "",
) -> dict:
    """跑一次 harness（返回最终 state）。recent_titles/lesson_history 供规划层查重。"""
    graph = build_harness_graph()
    initial: dict[str, Any] = {
        "mode": mode,
        "track_slot": track_slot,
        "queue_slot": "pipeline",
        "publish": publish_flag,
        "topic": "",
        "direction": "",
        "primary_category": "其他",
        "sources": [],
        "draft_md": "",
        "mermaid_errors": [],
        "review_verdict": "",
        "review_score": 0,
        "review_notes": "",
        "topic_tag": "技术",
        "revision_round": 0,
        "structure_round": 0,
        "retry_used": False,
        "rework_file": "",
        "hotspot_id": None,
        "failed_reason": "",
        "log": [],
        # harness 专用中间态
        "plan": {},
        "section_results": [],
    }
    # 查重清单自己查（已发布 DB + 队列存稿），不靠调用方传——二十一期修的
    # "同题 5 变体堆积"能力不能因为换了入口就丢
    global _PLAN_CTX
    _PLAN_CTX = {"recent_titles": recent_titles or await recent_titles_for_dedupe(),
                 "lesson_history": lesson_history or await recent_titles_for_dedupe(limit=30)}
    try:
        return await graph.ainvoke(initial)
    finally:
        _PLAN_CTX = {}


# 规划层的查重上下文（见 run_harness 注释）
_PLAN_CTX: dict[str, str] = {}


async def run_harness(
    mode: str = "hot",
    track_slot: str = "1900",
    publish_flag: bool = False,
    recent_titles: str = "",
    lesson_history: str = "",
) -> dict:
    """跑一次 harness（返回最终 state）。recent_titles/lesson_history 供规划层查重。"""
    graph = build_harness_graph()
    initial: dict[str, Any] = {
        "mode": mode,
        "track_slot": track_slot,
        "queue_slot": "pipeline",
        "publish": publish_flag,
        "topic": "",
        "direction": "",
        "primary_category": "其他",
        "sources": [],
        "draft_md": "",
        "mermaid_errors": [],
        "review_verdict": "",
        "review_score": 0,
        "review_notes": "",
        "topic_tag": "技术",
        "revision_round": 0,
        "structure_round": 0,
        "retry_used": False,
        "rework_file": "",
        "hotspot_id": None,
        "failed_reason": "",
        "log": [],
        # harness 专用中间态
        "plan": {},
        "section_results": [],
    }
    # 查重上下文不进 state（TypedDict 没这两个键会报错），走模块级旁路
    global _PLAN_CTX
    _PLAN_CTX = {"recent_titles": recent_titles, "lesson_history": lesson_history}
    try:
        return await graph.ainvoke(initial)
    finally:
        _PLAN_CTX = {}


# 规划层的查重上下文（模块级旁路：PipelineState 没这两个键，塞进去会触发
# LangGraph 的 unknown-key 警告/报错；单飞锁保证并发不会互相污染）
_PLAN_CTX: dict[str, str] = {}