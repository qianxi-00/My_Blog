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
        # 不硬失败——把问题回灌让规划层修一次（避免因为规划小瑕疵浪费整条管线）
        plan = await _repair_plan(plan, errs)
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
    """把校验问题回灌给 LLM 修一次规划（比直接 failed 划算）。"""
    try:
        resp = await _llm(temperature=0).ainvoke([
            SystemMessage(content="你是技术主编。修下面这份写作计划里被程序校验挑出的问题，只输出修好的完整 JSON 计划。"),
            HumanMessage(content=f"问题清单:\n- " + "\n- ".join(errs) + f"\n\n原计划:\n{yaml.safe_dump(plan, allow_unicode=True)[:4000]}"),
        ])
        text = resp.content if isinstance(resp.content, str) else str(resp.content)
        from .graph import _extract_json

        fixed = _extract_json(text)  # 带中文引号修复的健壮解析
        fixed["_paper_material"] = plan.get("_paper_material", "")
        return fixed
    except Exception as exc:
        _log(f"规划修复失败，保留原计划: {exc}")
        return plan


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

    sources = _plan_sources(plan)
    draft = assemble(plan, results, sources, topic_date, generated_at)

    # 配图占位替换：把 <!-- FIGURE: xxx --> 换成真实 markdown 图（推图在宿主做，先用 raw URL）
    draft, figure_note = await _inject_figures(draft, plan)

    return {
        "draft_md": draft,
        "mermaid_errors": [],
        "log": [f"汇总成稿: {len(results)} 节" + (f"，{figure_note}" if figure_note else "")],
    }


def _plan_sources(plan: dict) -> list[dict]:
    """从计划里凑来源（主锚 + 辅助论文的 arXiv 页）。"""
    src = []
    ap = plan.get("anchor_paper") or {}
    aid = ap.get("arxiv_id")
    if aid:
        src.append({"name": f"主锚论文 {aid}", "url": f"https://arxiv.org/abs/{aid}"})
    for s in (plan.get("support_papers") or [])[:4]:
        src.append({"name": f"辅助论文 {s}", "url": f"https://arxiv.org/abs/{s}"})
    return src


async def _inject_figures(draft: str, plan: dict) -> tuple[str, str]:
    """把规划里的 paper 图占位替换成 markdown 图片（下载暂存，宿主推图后 URL 即生效）。"""
    from .paper_tools import stage_figures

    paper_figs = []
    for s in plan.get("sections") or []:
        f = s.get("figure") or {}
        if f.get("kind") == "paper" and f.get("source_url"):
            paper_figs.append({"url": f["source_url"], "name": f.get("name") or "fig",
                               "caption": f.get("caption", "")})
    if not paper_figs:
        return draft, ""

    import json as _json
    manifest = stage_figures(plan.get("slug") or "fig", _json.dumps(paper_figs))
    try:
        data = _json.loads(manifest)
    except Exception:
        return draft, ""

    staged = data.get("staged") or []
    for item in staged:
        cap = item.get("caption", "")
        img_md = f"![{cap}]({item['raw_url']})\n\n*{cap}*" if cap else f"![]({item['raw_url']})"
        draft = draft.replace(f"<!-- FIGURE: {cap} -->", img_md)
        # 占位 caption 不完全匹配时，兜底插到该章节末尾之前太复杂——先全局兜底替换
        if f"<!-- FIGURE:" in draft:
            import re as _re
            draft = _re.sub(r"<!-- FIGURE:[^>]*-->", img_md, draft, count=1)

    # 提醒宿主推图（推完 raw URL 即 200；未推时图片 404，读者看到破图——先记 log）
    return draft, f"论文原图 {len(staged)} 张已暂存（待宿主推图床）"


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