"""二十三期 harness：规划层——把"写一篇文章"拆成可执行的工程计划。

千禧的要求（原话）："先确认整体的工作目标、todolist，然后搜索资料确认
选题，确认标题，然后分章节，确认要写多少个章节，每个章节写什么，应该要搞
哪些配图，资料中哪些图片可以直接搬过来用，哪些是需要自己生成 mermaid，
然后再具体去实现每一个章节"。

这一层产出 Plan（纯数据，可落盘可复查），执行层照着它并行写章节：
- 目标确认（读者是谁/要解决什么问题/技术落点）
- todolist（研究/结构/写作/配图/回检的显式步骤）
- 章节大纲（数量由规划定，不是拍脑袋 8 段）
- 配图计划（每张图：论文原图搬 or 自己 mermaid，各有理由）
- 标题（≤28 字硬约束在 prompt 与闸里已经双保险）
"""

from __future__ import annotations

from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.tools import tool

from .graph import _extract_json, _llm, _log
from .paper_tools import fetch_paper as _fetch_paper_impl, search_papers


@tool
def fetch_paper(arxiv_id_or_url: str) -> str:
    """读一篇 arXiv 论文的 HTML 全文版，返回章节结构与候选配图清单。

    规划层用它读主锚论文：先看章节结构，再决定每节配什么图——论文原图（从
    返回的候选 source_url 里挑）还是自己画 mermaid。返回的 source_url 才是
    合法图片来源，不许编造。
    """
    return _fetch_paper_impl(arxiv_id_or_url)

PLANNER_SYSTEM_PROMPT = """你是《千禧 DevLog》的技术主编，负责在动笔前把一篇文章拆成可执行的写作计划。

读者画像：AI 从业者与深度学习者——他们要技术深度，不要资讯转述。
你的产物是一份 JSON 计划，会驱动后续多个写作 agent 并行执行，所以字段要具体、可执行。

# 输出 JSON 结构（严格，不要任何其他文字）
{
  "goal": "这篇文章要帮读者解决什么问题/理解什么机制（一句话，要具体，不能是'介绍X'这种空话）",
  "todolist": ["步骤1", "步骤2", ...],          // 5-9 条，每条是一个可验证的动作
  "title": "文章标题",                          // ≤28 字，见下方约束
  "slug": "kebab-case-english-slug",            // 从标题生成，全小写连字符
  "summary": "一段摘要（80-120 字）",
  "primary_category": "AI基础设施|AI模型|AI产品|AI应用|AI安全|其他",
  "topic_tag": "一个精准的标签（如 推理优化 / 训练技巧 / 安全）",
  "anchor_paper": {
    "arxiv_id": "2501.12345",                    // 主锚论文（必须有）
    "why": "为什么这篇论文值得作为主锚（一句话）"
  },
  "support_papers": ["2502.xxxxx", ...],        // 0-4 篇辅助论文 arXiv ID
  "sections": [                                  // 4-8 节，按阅读顺序
    {
      "heading": "章节标题（不含 ## 前缀）",
      "purpose": "这一节要讲清什么（一句话）",
      "target_chars": 900,                       // 目标字数（中文），全篇加总 ≥ 6000
      "key_points": ["要点1", "要点2"],          // 2-5 条
      "figure": {
        "kind": "paper|mermaid|none",            // 搬论文原图 / 自己画 mermaid / 无图
        "source_url": "论文图直链（kind=paper 时必填，来自 fetch_paper 的候选配图）",
        "caption": "图注",
        "mermaid_draft": "kind=mermaid 时给出图型与节点（如 flowchart TD: A[\"注意力计算\"] --> B[\"KV Cache\"]）"
      }
    }
  ]
}

# 硬约束
1. 标题 ≤28 字，禁止"主标题：副标题补充说明"式双段结构，禁止排比修饰堆砌
2. slug 全小写 kebab-case，禁 auto/占位符
3. sections 全篇 target_chars 加总必须 ≥6000（程序会校验，低于会被打回）
4. 每节最多 1 张图（paper 或 mermaid 二选一）；整篇 mermaid 图 2-3 张为上限
5. figure.kind=paper 时 source_url 必须来自 fetch_paper 返回的真实候选图（不许编 URL）
6. 内容要能支撑"原理拆解 + 机制对比 + 工程含义"，纯资讯/发布动态不配做主题

# 工作方法
1. 先看给你的论文全文材料（fetch_paper 输出：章节结构 + 候选配图）
2. 论文原图只在"确实是机制/架构/结果图"时搬（那是最有权威感的部分）
3. 论文没图或图不够表达的地方（自己的理解、跨论文对比、流程拆解）用 mermaid 画
4. 章节划分按"读者认知路径"来：背景 → 机制 → 细节 → 对比 → 工程 → 边界，
   不要机械套固定 8 段，节数由主题复杂度决定
"""


async def plan_article(
    topic_hint: str,
    mode: str,
    track_name: str,
    recent_titles: str,
    lesson_history: str = "",
) -> dict[str, Any]:
    """规划层：检索论文 → 读全文 → 产出可执行写作计划。

    topic_hint: hot 模式=AIHOT 候选池提示；curriculum=知识线名
    """
    # 1) 论文检索（千禧拍板"检索主要要是论文"）：从 hint 抽英文检索词
    query = _search_query(topic_hint, track_name)
    _log(f"规划层·论文检索: query={query!r}")
    papers = search_papers(query, months_back=3, max_results=6)

    # 2) 选题：让 LLM 从论文清单里锚定主论文 + 出计划（一次调用完成，减少 token）
    _log("规划层：生成写作计划（目标/todolist/章节/配图）…")
    human = f"""模式: {mode}
主题线索: {topic_hint}
{'知识线: ' + track_name if track_name else ''}
已发布主题（严禁重复）: {recent_titles}
{'已讲过的课（严禁重复）: ' + lesson_history if lesson_history else ''}

论文检索结果:
{papers}

请完成：1) 从上面的论文里锚定 1 篇主锚论文；2) 用 fetch_paper 工具读它的全文
（拿章节结构与候选配图）；3) 输出完整 JSON 计划。

注意 fetch_paper 需要你主动调用工具读全文——不要只凭摘要写计划。"""

    llm = _llm(temperature=0).bind_tools([fetch_paper], tool_choice="auto")
    msgs: list = [SystemMessage(content=PLANNER_SYSTEM_PROMPT), HumanMessage(content=human)]
    paper_digest = ""
    plan: dict[str, Any] | None = None
    last_err = ""
    # 最多 2 轮完整尝试（每轮内最多 4 次工具调用）——JSON 解析失败也给机会重来
    for _round in range(2):
        for _ in range(4):  # 每轮最多 4 次工具调用（读主锚 + 最多 2 篇辅助）
            try:
                resp = await llm.ainvoke(msgs)
            except Exception as exc:
                msg = str(exc)
                if "429" in msg or "rate_limit" in msg or "concurrency" in msg.lower():
                    _log(f"规划层限流（{msg[:50]}）——15s 后重试")
                    await asyncio.sleep(15)
                    continue
                raise
            msgs.append(resp)
            if not getattr(resp, "tool_calls", None):
                text = resp.content if isinstance(resp.content, str) else str(resp.content)
                try:
                    plan = _extract_json(text)
                except ValueError as exc:
                    last_err = str(exc)
                    _log(f"规划层 JSON 解析失败（第 {_round + 1} 轮）——重试")
                    # 让模型重来：明确告知上次输出坏了
                    msgs.append(
                        HumanMessage(content=f"上次输出不是合法 JSON（{exc}）。请只输出一个合法 JSON 对象，不要在字符串里用中文引号。")
                    )
                    break
                break
            for tc in resp.tool_calls:
                if tc["name"] == "fetch_paper":
                    out = _fetch_paper_impl(str(tc["args"].get("arxiv_id_or_url") or ""))
                    paper_digest += out[:6000] + "\n\n"
                else:
                    out = "（未知工具）"
                msgs.append(HumanMessage(content=f"[工具结果 {tc['name']}]\n{out[:6000]}"))
        if plan is not None:
            break
        msgs = msgs[:2]  # 整轮重来，清掉中间消息

    if plan is None:
        raise ValueError(f"规划层未产出合法计划（{last_err or '工具循环超限'}）")

    plan["_paper_material"] = paper_digest
    return plan


def _search_query(topic_hint: str, track_name: str) -> str:
    """把中文/混合提示词转成 arXiv 友好的英文检索词（简单规则，不引额外依赖）。"""
    # 知识线模式有现成英文关键词表；hot 模式先原样试英文词
    if track_name:
        m = {
            "注意力与 KV Cache 机制": "attention mechanism kv cache long context",
            "大模型推理优化与部署": "llm inference optimization serving deployment",
            "大模型训练技巧与工程化": "llm training optimization distributed training",
            "智能体与工具使用": "llm agent tool use planning",
            "RAG 与知识检索增强": "retrieval augmented generation knowledge",
        }
        return m.get(track_name, track_name)
    # hot 模式：抽出可能的英文词（连续拉丁字母 ≥4 的片段），没有就用通用词
    import re as _re

    en = _re.findall(r"[A-Za-z][A-Za-z0-9\-]{3,}", topic_hint)
    return " ".join(dict.fromkeys(en[:4])) if en else "large language model"


# ---------------------------------------------------------------------------
# 计划校验（程序闸：规划不可信就当场打回，不浪费执行层 token）
# ---------------------------------------------------------------------------


def validate_plan(plan: dict[str, Any]) -> list[str]:
    """校验规划产出，返回问题列表（空=可执行）。"""
    errs: list[str] = []

    title = str(plan.get("title") or "").strip()
    if not title:
        errs.append("缺 title")
    elif len(title) > 32:
        errs.append(f"标题 {len(title)} 字 >32（规划层就要压住，别等写作层）")
    if not re_slug_ok(str(plan.get("slug") or "")):
        errs.append(f"slug 非法: {plan.get('slug')!r}（要 kebab-case，禁 auto）")

    secs = plan.get("sections") or []
    if not isinstance(secs, list) or len(secs) < 4:
        errs.append(f"章节数 {len(secs) if isinstance(secs, list) else 0} <4（内容不够拆）")
    elif len(secs) > 8:
        errs.append(f"章节数 {len(secs)} >8（拆太碎，读起来散）")

    total = 0
    mermaid_n = 0
    for i, s in enumerate(secs if isinstance(secs, list) else []):
        if not isinstance(s, dict):
            errs.append(f"第 {i + 1} 节不是对象")
            continue
        if not str(s.get("heading") or "").strip():
            errs.append(f"第 {i + 1} 节缺 heading")
        tc = int(s.get("target_chars") or 0)
        if tc < 500:
            errs.append(f"第 {i + 1} 节 target_chars={tc} <500（太碎）")
        total += tc
        fig = s.get("figure") or {}
        kind = str(fig.get("kind") or "none")
        if kind == "mermaid":
            mermaid_n += 1
        elif kind == "paper":
            if not str(fig.get("source_url") or "").startswith("http"):
                errs.append(f"第 {i + 1} 节 kind=paper 但 source_url 无效（不许编 URL）")
    if total < 6000:
        errs.append(f"全篇 target_chars 合计 {total} <6000（字数闸会打回）")
    if mermaid_n > 4:
        errs.append(f"mermaid 图 {mermaid_n} 张 >4（页面太碎）")

    if not (plan.get("anchor_paper") or {}).get("arxiv_id"):
        errs.append("缺 anchor_paper.arxiv_id（必须有主锚论文）")

    return errs


def re_slug_ok(slug: str) -> bool:
    import re as _re

    return bool(_re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", slug or ""))