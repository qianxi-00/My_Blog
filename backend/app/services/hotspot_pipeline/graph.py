"""热点文章流水线（LangGraph StateGraph 版）——openclaw cron 的博客内重建。

流程（千禧拍板：分细、先检索后写作、审稿不过回修、mermaid 当配图）：

    选题 ──► 资料检索(工具循环) ──► 写作 ──► mermaid校验 ──► 审稿 ──► 入队 ──► 发布
                search_github/       ▲         ▲           │
                search_arxiv/        │(语法错误回修)        ├─ revise 且轮次<2 → 回写作
                fetch_url/aihot     └─────────┘           └─ fail/超轮 → failed 落盘，不发布

回修轮次：mermaid 校验失败与审稿 revise 都会把稿件送回 write；
revision_round 在 **审稿节点** 递增（每过一次 review 计一轮），上限 2 轮
防死循环——第 3 次审稿仍不 pass 即落 failed/ 留人工，绝不带病发布。

模型：grok-4.7 经 NewAPI（容器 env OPENAI_API_BASE/KEY/MODEL，与 A-RAG 同链路）。
发布：SQLAlchemy service 层直建 hot_topics + sources + topic_tag（tag_hotspots 词表）。
"""

from __future__ import annotations

import datetime as dt
import json
import operator
import re
from pathlib import Path
from typing import Annotated, Any, Literal, TypedDict

import yaml
from langchain_core.messages import HumanMessage, SystemMessage, ToolMessage
from langchain_openai import ChatOpenAI
from langgraph.graph import END, START, StateGraph
from sqlalchemy import select

from ...core.config import settings
from ...core.database import async_session_maker
from ...models.hot_topic import HotTopic, HotTopicSource
from .prompts import (
    GROK_DEFAULT_MAX_TOKENS,
    KNOWLEDGE_TRACKS,
    MERMAID_FIX_INSTRUCTION,
    RESEARCH_SYSTEM_PROMPT,
    REVIEWER_SYSTEM_PROMPT,
    REVISION_INSTRUCTION,
    TOPIC_PICK_CURRICULUM_PROMPT,
    TOPIC_PICK_PROMPT,
    WRITER_SYSTEM_PROMPT,
)
from .tools import RESEARCH_TOOLS, RESEARCH_TOOLS_BY_NAME, search_aihot, validate_mermaid_blocks

# 队列根：容器内 /data = 宿主 /data/blog/data（数据卷挂载）——落这里宿主可直接查稿。
# 宿主实际路径：/data/blog/data/pipeline/hotspot_queue/
QUEUE_ROOT = Path("/data/pipeline/hotspot_queue")
# 二十一期 loop 闭环（千禧拍板"failed 之后要返工，不能就这么没了"）：
# - 字数线 6500 → 6000 下限（上下浮动 500；prompt 锚 6500，6000-7000 均可）
#   实测 step-5-preview 首稿 4500-6300 字、每轮回修只涨 500-1500，6500 硬线
#   超轮 failed 率过高——6336/5823 这类稿子在新线下直接达标或一轮回修即过
# - 结构闸 3 → 4 轮
# - failed 自动重试一次（retry_used 防无限循环）：超轮不再落盘等人工，
#   清空状态自动回选题重跑；重试再失败才落盘
MAX_STRUCTURE_ROUNDS = 4
MAX_REVISION_ROUNDS = 2    # 审稿：内容性修订
MAX_RESEARCH_TOOL_CALLS = 10
MIN_BODY_CHARS = 6000
MAX_RETRY = 1
# 二十期质量门槛：审稿 pass 但分数低于此线强制 revise（每天 3 篇自动发布，
# 千禧要求"确保写作质量"——发布线交给程序判定）
MIN_REVIEW_SCORE = 85


# ---------------------------------------------------------------------------
# State
# ---------------------------------------------------------------------------


class PipelineState(TypedDict):
    # 输入
    mode: str  # "hot" | "curriculum"
    track_slot: str  # curriculum 模式的知识线 slot（1800~2200）
    queue_slot: str  # 原版槽位语义，默认 "pipeline"
    publish: bool  # True=审稿通过后真发布；False=只入队 pending
    # 流程产物
    topic: str
    direction: str
    primary_category: str
    sources: list[dict]
    draft_md: str
    mermaid_errors: list[str]
    review_verdict: str
    review_score: int  # 审稿分数（0-100）；pass 且 >= MIN_REVIEW_SCORE 才放行发布
    review_notes: str
    topic_tag: str
    revision_round: int  # 审稿回修轮次（内容性，上限 MAX_REVISION_ROUNDS）
    structure_round: int  # 结构闸回修轮次（字数/表格/mermaid，上限 MAX_STRUCTURE_ROUNDS）
    retry_used: bool  # failed 自动重试是否已用（二十一期 loop 闭环：超轮先回炉重跑一次）
    rework_file: str  # 非空 = 回炉模式：拿该文件做底稿，跳过选题/检索直进结构闸
    hotspot_id: int | None
    failed_reason: str
    log: Annotated[list[str], operator.add]


# ---------------------------------------------------------------------------
# 基础设施
# ---------------------------------------------------------------------------


def _llm(temperature: float = 0.0, max_tokens: int = GROK_DEFAULT_MAX_TOKENS) -> ChatOpenAI:
    """流水线专用模型链路：step-5-preview @ stepfun step_plan 渠道。

    独立 PIPELINE_* 配置（runtime.env 注入），不占 A-RAG 的 OPENAI_*（grok）链路。
    显式断言：key 缺失直接炸——ChatOpenAI 在 api_key=None 时会静默 fallback 到
    环境变量 OPENAI_API_KEY（那是 grok 的 key），拿 grok key 打 stepfun 必 401，
    错误信息还非常有误导性。宁可启动即失败，不带病跑。
    """
    if not settings.PIPELINE_API_KEY:
        raise RuntimeError(
            "PIPELINE_API_KEY 未配置（runtime.env）——拒绝静默 fallback 到 OPENAI_API_KEY"
        )
    return ChatOpenAI(
        base_url=settings.PIPELINE_API_BASE,
        api_key=settings.PIPELINE_API_KEY,
        model=settings.PIPELINE_MODEL,
        temperature=temperature,
        max_tokens=max_tokens,
        timeout=900,  # 6500+ 汉字长文生成，step-5-preview 预览渠道放宽到 15 分钟
        max_retries=2,
    )


def _extract_json(text: str) -> dict:
    """从 LLM 输出里抠第一个 JSON 对象（容忍代码块包裹与前后说明）。"""
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.S)
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError(f"LLM 输出无 JSON: {text[:200]}")
    return json.loads(text[start : end + 1])


def _now_bj() -> dt.datetime:
    return dt.datetime.now(dt.timezone(dt.timedelta(hours=8)))


def _log(msg: str) -> None:
    print(f"[hotspot-pipeline] {msg}", flush=True)


def _parse_frontmatter(markdown: str) -> tuple[dict, str]:
    """切分 frontmatter 与正文；返回 (fm, body)。"""
    stripped = markdown.lstrip()
    if not stripped.startswith("---"):
        return {}, markdown
    end = stripped.find("\n---", 3)
    if end == -1:
        return {}, markdown
    try:
        fm = yaml.safe_load(stripped[4:end]) or {}
    except Exception:
        return {}, markdown
    return fm, stripped[end + 4 :]


def _chinese_chars(text: str) -> int:
    return len(re.findall(r"[\u4e00-\u9fff]", text))


# ---------------------------------------------------------------------------
# 节点 1：选题
# ---------------------------------------------------------------------------


def _queue_titles() -> list[str]:
    """队列里的稿件标题（pending + failed）——查重第二数据源（二十一期）。

    只查 published 不够：ExploitGym 同题 5 变体堆积的教训——已写未发的稿
    也是"写过了"。从 frontmatter title 行抽（文件量小，直接读）。
    """
    titles: list[str] = []
    for sub in ("pending", "failed"):
        base = QUEUE_ROOT / sub
        if not base.exists():
            continue
        for md in sorted(base.rglob("*.md"))[:40]:
            try:
                head = md.read_text(encoding="utf-8")[:800]
                m = re.search(r'^title:\s*["\']?(.+?)["\']?\s*$', head, re.M)
                if m:
                    titles.append(m.group(1).strip())
            except OSError:
                continue
    return titles


async def pick_topic(state: PipelineState) -> dict:
    async with async_session_maker() as db:
        rows = (
            (
                await db.execute(
                    select(HotTopic.title)
                    .where(HotTopic.status == "published")
                    .order_by(HotTopic.id.desc())
                    .limit(10)
                )
            ).scalars().all()
        )
    # 查重双源：已发布（DB）+ 队列存稿（pending/failed）——同题绝不二写
    queued = _queue_titles()
    recent_titles = (
        "\n".join(f"- {t}" for t in rows + queued) or "（暂无）"
    )
    if queued:
        _log(f"查重清单含 {len(queued)} 篇队列存稿标题")

    if state["mode"] == "curriculum":
        track = KNOWLEDGE_TRACKS.get(state.get("track_slot") or "1900", KNOWLEDGE_TRACKS["1900"])
        prompt = TOPIC_PICK_CURRICULUM_PROMPT.format(track_name=track, lesson_history=recent_titles)
    else:
        candidates_raw = await search_aihot.ainvoke({"category": ""})
        prompt = TOPIC_PICK_PROMPT.format(candidates=candidates_raw, recent_titles=recent_titles)

    result = _extract_json(_llm(temperature=0.3).invoke(prompt).content)
    topic = result.get("topic", "")
    _log(f"选题: {topic}（{result.get('primary_category', '?')}）")
    return {
        "topic": topic,
        "direction": result.get("direction", ""),
        "primary_category": result.get("primary_category", "其他"),
        "log": [f"选题: {topic}"],
    }


# ---------------------------------------------------------------------------
# 节点 2：资料检索（LLM + 工具循环）
# ---------------------------------------------------------------------------


async def research(state: PipelineState) -> dict:
    system = RESEARCH_SYSTEM_PROMPT.format(topic=state["topic"], direction=state["direction"])
    model_with_tools = _llm(temperature=0.2).bind_tools(RESEARCH_TOOLS)
    messages: list[Any] = [SystemMessage(content=system), HumanMessage(content="开始收集资料。")]

    tool_calls_made = 0
    while tool_calls_made < MAX_RESEARCH_TOOL_CALLS:
        resp = await model_with_tools.ainvoke(messages)
        messages.append(resp)
        if not getattr(resp, "tool_calls", None):
            break
        for call in resp.tool_calls:
            tool = RESEARCH_TOOLS_BY_NAME[call["name"]]
            observation = await tool.ainvoke(call["args"])
            messages.append(ToolMessage(content=str(observation), tool_call_id=call["id"]))
            tool_calls_made += 1
            _log(f"research tool #{tool_calls_made}: {call['name']}({str(call['args'])[:80]})")

    # 兜底总结：并行 tool_calls 会很快烧完上限，此时循环退出 messages[-1] 是
    # ToolMessage（工具文本），直接 _extract_json 必炸——用无工具 LLM 强制汇总一次。
    last = messages[-1]
    needs_summary = getattr(last, "type", "") == "tool" or "{" not in str(
        getattr(last, "content", "")
    )
    if needs_summary:
        summary = await _llm(temperature=0.2).ainvoke(
            messages
            + [
                HumanMessage(
                    content="资料收集阶段到此为止（工具调用已达上限或尚未汇总）。"
                    "请立即基于以上材料输出 sources JSON，禁止再调用任何工具。"
                )
            ]
        )
        messages.append(summary)

    result = _extract_json(messages[-1].content)
    sources = result.get("sources") or []

    # 空资料防线（dry-run 实测：14 次工具调用后总结 LLM 偷懒输出空数组，
    # write 拿 0 份资料先天营养不良）：先重罚一次强约束总结；
    # 仍空则程序化从 ToolMessage 里抽 URL 兜底——绝不给 write 空手。
    if not sources:
        _log("检索汇总为空，触发强约束二次总结")
        retry = await _llm(temperature=0.0).ainvoke(
            messages
            + [
                HumanMessage(
                    content="刚才的汇总漏了所有资料。重新输出 sources JSON——"
                    "必须包含你在工具结果里实际见过的每一份来源（至少 3 份），"
                    "每份含 name/url/kind/facts。sources 为空数组=任务失败。"
                )
            ]
        )
        sources = _extract_json(retry.content).get("sources") or []

    if not sources:
        # 程序化兜底：从工具消息文本里抽 URL 和首行标题
        _log("二次总结仍空，程序化抽取工具消息")
        import urllib.parse

        seen: set[str] = set()
        for m in messages:
            content = str(getattr(m, "content", ""))
            if getattr(m, "type", "") != "tool":
                continue
            for url in re.findall(r"https?://[^\s)>\]}\"']+", content)[:3]:
                if url in seen:
                    continue
                seen.add(url)
                domain = urllib.parse.urlparse(url).netloc
                facts = [ln.strip() for ln in content.splitlines() if len(ln.strip()) > 30][:3]
                sources.append({"name": domain, "url": url, "kind": "community", "facts": facts})
            if len(sources) >= 5:
                break

    _log(f"检索完成: {len(sources)} 份资料")
    return {"sources": sources, "log": [f"检索完成: {len(sources)} 份资料"]}


# ---------------------------------------------------------------------------
# 节点 3：写作（初稿 / 修订稿共用）
# ---------------------------------------------------------------------------


async def write(state: PipelineState) -> dict:
    sources_block = (
        "\n".join(
            f"- [{s.get('kind', 'other')}] {s.get('name', '?')} ({s.get('url', '?')}):\n"
            + "\n".join(f"  · {f}" for f in (s.get("facts") or []))
            for s in state.get("sources") or []
        )
        or "（无检索资料——选题阶段的热点线索为唯一输入，写作时按社区观察标注）"
    )

    base = WRITER_SYSTEM_PROMPT.format(
        topic=state["topic"],
        direction=state["direction"],
        sources_block=sources_block,
        topic_date=_now_bj().date().isoformat(),
        queue_slot=state.get("queue_slot", "pipeline"),
        generated_at=_now_bj().isoformat(),
    )

    # 修订判定看双池：审稿 revise（revision_round）或结构闸回修（structure_round）
    # 任一 >0 都走修订分支——结构闸回修时 revision_round 可能为 0，
    # 只看单池会走初稿分支丢掉修订指令（dry-run 教训）
    round_ = state.get("revision_round", 0) + state.get("structure_round", 0)
    if round_ > 0:
        # 回修指令优先级：mermaid 语法错误 > 审稿意见
        instruction = state.get("review_notes", "")
        if state.get("mermaid_errors"):
            instruction = MERMAID_FIX_INSTRUCTION.format(mermaid_errors="\n".join(state["mermaid_errors"]))
        base = (
            base
            + "\n\n# 本轮任务：修订\n"
            + REVISION_INSTRUCTION.format(review_notes=instruction, draft_md=state.get("draft_md", ""))
        )

    draft = _llm(temperature=0.7).invoke(
        [SystemMessage(content=base), HumanMessage(content="请输出完整文章。")]
    ).content
    _log(f"稿件产出: {_chinese_chars(_parse_frontmatter(draft)[1])} 汉字（第 {round_ + 1} 稿）")
    return {"draft_md": draft, "log": [f"写作产出第 {round_ + 1} 稿"]}


# ---------------------------------------------------------------------------
# 节点 4：结构校验（mermaid / 表格 / 字数三重程序闸——硬指标不靠审稿员自觉）
# ---------------------------------------------------------------------------


async def check_mermaid(state: PipelineState) -> dict:
    draft = state["draft_md"]
    fm, body = _parse_frontmatter(draft)
    errors: list[str] = []

    # 闸 1：mermaid 白名单结构校验
    errors += validate_mermaid_blocks(draft)

    # 闸 2：至少 1 个 Markdown 表格
    has_table = ("| ---" in draft) or ("|---" in draft)
    if not has_table:
        errors.append("未找到 Markdown 表格（需至少 1 个 `| --- |` 分隔的表格）")

    # 闸 3：正文字数程序化硬闸（审稿 LLM 实测放水：5368 字打 93 分——
    # 字数这种可计算指标必须代码判，不依赖 LLM 自觉）
    chars = _chinese_chars(body)
    if chars < MIN_BODY_CHARS:
        errors.append(
            f"正文中文字数 {chars} < 硬指标 {MIN_BODY_CHARS}（不含 frontmatter/表格/代码块），"
            f"需扩写约 {MIN_BODY_CHARS - chars} 字——在保持结构的前提下加深核心拆解与横向对比"
        )

    status = "通过" if not errors else f"失败 {len(errors)} 处"
    _log(f"结构校验（mermaid/表格/字数 {chars}）: {status}")
    update: dict = {"mermaid_errors": errors, "log": [f"结构校验 {status}（字数 {chars}）"]}
    # 结构闸失败计入 structure_round 独立预算（与审稿 revision_round 分池——
    # 共池时字数扩写吃光预算，审稿 revise 直接超轮冤杀稿件，dry-run 实测教训）
    if errors:
        update["structure_round"] = state.get("structure_round", 0) + 1
    return update


def _route_after_mermaid(state: PipelineState) -> Literal["write", "review", "retry", "failed"]:
    errors = state.get("mermaid_errors")
    if not errors:
        return "review"
    if state.get("structure_round", 0) < MAX_STRUCTURE_ROUNDS:
        return "write"
    if not state.get("retry_used", False) and not state.get("rework_file"):
        return "retry"  # 二十一期 loop 闭环：超轮先自动回炉重跑一次（rework 模式除外）
    return "failed"  # 重试已用 / 回炉模式：真终态，落 failed 不发布


# ---------------------------------------------------------------------------
# 节点 5：审稿（revision_round 在此递增——每过一次审稿计一轮）
# ---------------------------------------------------------------------------


async def review(state: PipelineState) -> dict:
    result = _extract_json(
        _llm(temperature=0).invoke(
            [
                SystemMessage(content=REVIEWER_SYSTEM_PROMPT),
                HumanMessage(content=state["draft_md"]),
            ]
        ).content
    )
    verdict = result.get("verdict", "revise")
    score = int(result.get("score") or 0)
    notes = list(result.get("notes") or [])

    # 二十期质量加固：分数程序门槛。verdict 是 LLM 主观判定（dry-run 实测
    # 5368 字的稿子都能拿 pass 93 分），pass 但 score<MIN_REVIEW_SCORE 的
    # 一律强制转 revise——发布权交给可计算门槛，不交给 LLM 自觉。
    if verdict == "pass" and score < MIN_REVIEW_SCORE:
        verdict = "revise"
        notes.insert(0, f"【程序门槛】审稿分 {score} < 发布线 {MIN_REVIEW_SCORE}——按下列意见润色提质后重交")

    _log(f"审稿: {verdict} score={score} tag={result.get('topic_tag', '?')}")
    return {
        "review_verdict": verdict,
        "review_score": score,
        "review_notes": "\n".join(f"- {n}" for n in notes),
        "topic_tag": result.get("topic_tag", "其他"),
        "revision_round": state.get("revision_round", 0) + 1,
        "log": [f"审稿 {verdict} {score}分: {'; '.join(notes)[:150]}"],
    }


def _route_after_review(state: PipelineState) -> Literal["write", "enqueue", "retry", "failed"]:
    verdict = state.get("review_verdict", "revise")
    if verdict == "pass":
        return "enqueue"
    if state.get("revision_round", 0) < MAX_REVISION_ROUNDS:
        return "write"
    if not state.get("retry_used", False) and not state.get("rework_file"):
        return "retry"  # 二十一期 loop 闭环：审稿超轮先自动回炉重跑一次（rework 模式除外）
    return "failed"


async def retry(state: PipelineState) -> dict:
    """二十一期 loop 闭环：超轮/超预算不清盘——清空本轮产物自动回选题重跑。

    千禧拍板"failed 之后要返工，不能就这么没了"。重跑走全新链
    （重新选题+查重（含队列存稿）+检索+写作），而非拿死稿硬磨——
    实测同一稿反复扩写每轮只涨 500-1500 字，换思路比重写更有救。
    retry_used 防无限循环：只有一次自动重试机会。
    """
    _log(
        f"超轮自动回炉（结构 {state.get('structure_round', 0)}/{MAX_STRUCTURE_ROUNDS}，"
        f"审稿 {state.get('revision_round', 0)}/{MAX_REVISION_ROUNDS}）——清盘重跑"
    )
    return {
        "topic": "",
        "direction": "",
        "primary_category": "其他",
        "sources": [],
        "draft_md": "",
        "mermaid_errors": [],
        "review_verdict": "",
        "review_score": 0,
        "review_notes": "",
        "revision_round": 0,
        "structure_round": 0,
        "retry_used": True,
        "log": ["自动回炉：清盘重新选题"],
    }


async def failed(state: PipelineState) -> dict:
    """重试也救不回来才落盘 failed 目录，绝不带病发布。"""
    fm, _ = _parse_frontmatter(state.get("draft_md", ""))
    slug = str(fm.get("slug") or f"failed-{int(_now_bj().timestamp())}")
    failed_dir = QUEUE_ROOT / "failed" / _now_bj().date().isoformat()
    failed_dir.mkdir(parents=True, exist_ok=True)
    (failed_dir / f"{slug}.md").write_text(state.get("draft_md", ""), encoding="utf-8")
    (failed_dir / f"{slug}.error.txt").write_text(
        state.get("review_notes", "") + "\n\nmermaid: " + "\n".join(state.get("mermaid_errors") or []),
        encoding="utf-8",
    )
    retried = "（已自动重试一次）" if state.get("retry_used") else ""
    reason = f"超预算{retried}仍未达标，稿件留 {failed_dir / slug}.md 待人工"
    _log(reason)
    return {"failed_reason": reason, "log": [reason]}


# ---------------------------------------------------------------------------
# 节点 6：入队（沿用 openclaw 时代的 .md + .meta.json 双文件结构）
# ---------------------------------------------------------------------------


async def enqueue(state: PipelineState) -> dict:
    fm, body = _parse_frontmatter(state["draft_md"])
    slug = str(fm.get("slug") or f"draft-{int(_now_bj().timestamp())}")
    pending_dir = QUEUE_ROOT / "pending"
    pending_dir.mkdir(parents=True, exist_ok=True)
    md_path = pending_dir / f"{slug}.md"
    meta_path = pending_dir / f"{slug}.meta.json"
    md_path.write_text(state["draft_md"], encoding="utf-8")

    meta = {
        "title": fm.get("title"),
        "slug": slug,
        "summary": fm.get("summary"),
        "topic_date": fm.get("topic_date"),
        "primary_category": state.get("primary_category") or fm.get("primary_category"),
        "topic_tag": state.get("topic_tag"),
        "tags": fm.get("tags") or [],
        "queue_slot": fm.get("queue_slot", "pipeline"),
        "generated_at": fm.get("generated_at"),
        "word_count_estimate": _chinese_chars(body),
        "has_mermaid": not state.get("mermaid_errors"),
        "has_table": ("| ---" in state["draft_md"]) or ("|---" in state["draft_md"]),
        "publish_pending": not state.get("publish", False),
        "pipeline_state": "draft_ready",
        "queue_file": str(md_path),
        "queue_meta_file": str(meta_path),
        "sources": fm.get("sources") or state.get("sources") or [],
    }
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    _log(f"已入队: {md_path.name}（{meta['word_count_estimate']} 汉字）")
    return {"log": [f"入队 {md_path.name}"]}


# ---------------------------------------------------------------------------
# 节点 7：发布（service 层直建，status=published）
# ---------------------------------------------------------------------------


async def publish(state: PipelineState) -> dict:
    fm, body = _parse_frontmatter(state["draft_md"])
    try:
        async with async_session_maker() as db:
            topic = HotTopic(
                topic_date=dt.date.fromisoformat(str(fm.get("topic_date") or _now_bj().date())),
                title=str(fm.get("title") or state["topic"])[:220],
                slug=str(fm.get("slug") or f"pipeline-{int(_now_bj().timestamp())}")[:220],
                summary=str(fm.get("summary") or "")[:2000],
                analysis_md=state["draft_md"],
                heat_score=60.0,
                status="published",
                primary_category=state.get("primary_category") or fm.get("primary_category") or "其他",
                topic_tag=state.get("topic_tag") or None,
                published_at=_now_bj().replace(tzinfo=None),
                created_by=1,  # 历史流水线同款：admin#1 名义发布
            )
            db.add(topic)
            await db.flush()
            for s in (fm.get("sources") or state.get("sources") or [])[:8]:
                url = str(s.get("url") or "")
                if not url:
                    continue
                db.add(
                    HotTopicSource(
                        topic_id=topic.id,
                        source_type="manual",
                        source_name=str(s.get("name") or url)[:100],
                        source_domain=url.split("/")[2][:120] if "://" in url else None,
                        source_url=url[:1000],
                        quality_score=1.0,
                    )
                )
            await db.commit()
            _log(f"已发布 hot_topic id={topic.id}: {topic.title}")
            return {"hotspot_id": topic.id, "log": [f"发布成功 hot_topic#{topic.id}"]}
    except Exception as exc:
        reason = f"发布失败（数据库）: {exc}"
        _log(reason)
        return {"failed_reason": reason, "log": [reason]}


def _route_after_enqueue(state: PipelineState) -> Literal["publish", Literal["__end__"]]:
    return "publish" if state.get("publish", False) else "__end__"


# ---------------------------------------------------------------------------
# 图装配
# ---------------------------------------------------------------------------


def _route_entry(state: PipelineState) -> Literal["pick_topic", "check_mermaid"]:
    """二十一期 rework 模式：拿存量稿直接进结构闸（闸→审→发短链）。

    闸过 → 审稿 → 发布；闸不过（如字数 5823<6000）→ write 修订分支带
    缺口指令扩写 → 回闸——存量稿回炉的标准动线。
    """
    if state.get("rework_file"):
        return "check_mermaid"
    return "pick_topic"


def build_graph():
    builder = StateGraph(PipelineState)
    builder.add_node("pick_topic", pick_topic)
    builder.add_node("research", research)
    builder.add_node("write", write)
    builder.add_node("check_mermaid", check_mermaid)
    builder.add_node("review", review)
    builder.add_node("retry", retry)
    builder.add_node("failed", failed)
    builder.add_node("enqueue", enqueue)
    builder.add_node("publish", publish)

    builder.add_conditional_edges(START, _route_entry, {"pick_topic": "pick_topic", "check_mermaid": "check_mermaid"})
    builder.add_edge("pick_topic", "research")
    builder.add_edge("research", "write")
    builder.add_edge("write", "check_mermaid")
    builder.add_conditional_edges(
        "check_mermaid",
        _route_after_mermaid,
        {"write": "write", "review": "review", "retry": "retry", "failed": "failed"},
    )
    builder.add_conditional_edges(
        "review",
        _route_after_review,
        {"write": "write", "enqueue": "enqueue", "retry": "retry", "failed": "failed"},
    )
    builder.add_edge("retry", "pick_topic")
    builder.add_edge("failed", END)
    builder.add_conditional_edges("enqueue", _route_after_enqueue, {"publish": "publish", "__end__": END})
    builder.add_edge("publish", END)

    return builder.compile()


_graph = None


def get_graph():
    global _graph
    if _graph is None:
        _graph = build_graph()
    return _graph


async def run_pipeline(
    mode: str = "hot",
    track_slot: str = "1900",
    publish: bool = False,
    rework_file: str = "",
) -> dict:
    """一次完整流水线。返回最终 state（含 log / hotspot_id / failed_reason）。

    rework_file 非空 = 回炉模式：拿该文件（服务器/容器内绝对路径）做底稿，
    跳过选题/检索直进结构闸——闸过审稿即发布；闸不过自动扩写回修。
    """
    graph = get_graph()
    initial: PipelineState = {
        "mode": mode,
        "track_slot": track_slot,
        "queue_slot": "pipeline",
        "publish": publish,
        "rework_file": rework_file,
        "topic": "",
        "direction": "",
        "primary_category": "其他",
        "sources": [],
        "draft_md": "",
        "mermaid_errors": [],
        "review_verdict": "",
        "review_score": 0,
        "review_notes": "",
        "topic_tag": "其他",
        "revision_round": 0,
        "structure_round": 0,
        "retry_used": False,
        "hotspot_id": None,
        "failed_reason": "",
        "log": [],
    }

    # 回炉模式：读底稿进 state（topic/direction 从 frontmatter 提取）
    if rework_file:
        p = Path(rework_file)
        if not p.is_file():
            raise FileNotFoundError(f"回炉文件不存在: {rework_file}")
        initial["draft_md"] = p.read_text(encoding="utf-8")
        fm, _ = _parse_frontmatter(initial["draft_md"])
        initial["topic"] = str(fm.get("title") or p.stem)
        initial["direction"] = str(fm.get("summary") or "")[:300]
        _log(f"回炉模式: {p.name}（{initial['topic'][:40]}）")

    return await graph.ainvoke(initial)
