"""
Skill / Tool 统一注册中心
自动汇总所有模块的 schema 和 handler，供 AgentService 使用
"""

from __future__ import annotations

from typing import Any, Dict, FrozenSet, List, Tuple

from sqlalchemy.ext.asyncio import AsyncSession

from .skills import articles, comments, stats, subscribers, prompts, settings, admins
from .tools import call_api as call_api_tool
from .tools import execute_sql as execute_sql_tool


# ------------------------------------------------------------------ #
#  汇总所有 Skill 名称
# ------------------------------------------------------------------ #

ALL_SKILL_NAMES: FrozenSet[str] = frozenset().union(
    articles.SKILL_NAMES,
    comments.SKILL_NAMES,
    stats.SKILL_NAMES,
    subscribers.SKILL_NAMES,
    prompts.SKILL_NAMES,
    settings.SKILL_NAMES,
    admins.SKILL_NAMES,
)

# Skill 名称 → 所属模块的映射
_SKILL_MODULE_MAP: Dict[str, Any] = {}
for _module in (articles, comments, stats, subscribers, prompts, settings, admins):
    for _name in _module.SKILL_NAMES:
        _SKILL_MODULE_MAP[_name] = _module

# Tool 名称 → 执行器的映射
_TOOL_MAP: Dict[str, Any] = {
    "call_api": call_api_tool,
    "execute_sql": execute_sql_tool,
}


# ------------------------------------------------------------------ #
#  构建完整的工具列表（供 OpenAI function-calling 使用）
# ------------------------------------------------------------------ #

def build_all_tools() -> List[Dict[str, Any]]:
    """
    返回所有 Skill + Tool 的 OpenAI function-calling schema
    顺序：Skill 在前（AI 优先选择），Tool 在后（兜底）
    """
    schemas: List[Dict[str, Any]] = []

    # 按业务域顺序添加 Skill
    for module in (stats, articles, comments, prompts, subscribers, settings, admins):
        schemas.extend(module.SKILL_SCHEMAS)

    # 添加兜底 Tool
    schemas.extend(call_api_tool.TOOL_SCHEMAS)
    schemas.extend(execute_sql_tool.TOOL_SCHEMAS)

    return schemas


# ------------------------------------------------------------------ #
#  统一执行分派
# ------------------------------------------------------------------ #

async def dispatch(
    name: str,
    args: Dict[str, Any],
    token: str,
    db: AsyncSession,
) -> Tuple[Dict[str, Any], str]:
    """
    根据名称分派到对应 Skill 或 Tool 执行

    Returns:
        (result_dict, kind) — kind 为 "skill" 或 "tool"
    """
    # 优先匹配 Skill
    skill_module = _SKILL_MODULE_MAP.get(name)
    if skill_module is not None:
        result = await skill_module.execute(name, args, token, db)
        return result, "skill"

    # 退化到 Tool
    tool_module = _TOOL_MAP.get(name)
    if tool_module is not None:
        result = await tool_module.execute(args=args, token=token, db=db)
        return result, "tool"

    return {"ok": False, "error": f"未知工具: {name}"}, "tool"
