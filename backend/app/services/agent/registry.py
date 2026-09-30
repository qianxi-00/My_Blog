"""
Skill / Tool 统一注册中心
自动汇总所有模块的 schema 和 handler，供 AgentService 使用
"""

from __future__ import annotations

from typing import Any, Dict, FrozenSet, List, Tuple

from sqlalchemy.ext.asyncio import AsyncSession

from .skills import (
    articles, batch, comments, forum, hotspots,
    stats, subscribers, prompts, settings, admins, users,
)
from .tools import call_api as call_api_tool
from .tools import execute_sql as execute_sql_tool

# 业务域模块，新增 skill 模块时三处都要登记
_MODULES = (
    stats, articles, comments, hotspots, prompts, subscribers,
    settings, admins, users, forum, batch,
)


# ------------------------------------------------------------------ #
#  汇总所有 Skill 名称
# ------------------------------------------------------------------ #

ALL_SKILL_NAMES: FrozenSet[str] = frozenset().union(
    *(module.SKILL_NAMES for module in _MODULES)
)

# Skill 名称 → 所属模块的映射
_SKILL_MODULE_MAP: Dict[str, Any] = {}
for _module in _MODULES:
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

def build_all_tools(role: str = "admin") -> List[Dict[str, Any]]:
    """
    返回所有 Skill + Tool 的 OpenAI function-calling schema
    顺序：Skill 在前（AI 优先选择），Tool 在后（兜底）

    execute_sql 直接读写数据库（绕过所有接口层权限），只对 super_admin 暴露；
    普通 admin 连 schema 都拿不到，模型不会生成该调用。
    """
    schemas: List[Dict[str, Any]] = []

    # 按业务域顺序添加 Skill
    for module in (
        stats, articles, comments, hotspots, prompts, subscribers,
        settings, admins, users, forum, batch,
    ):
        schemas.extend(module.SKILL_SCHEMAS)

    # 添加兜底 Tool
    schemas.extend(call_api_tool.TOOL_SCHEMAS)
    if role == "super_admin":
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
    role: str = "admin",
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
        # 双保险：即使模型给出了未注册的调用（手改历史/旧的会话记录），也拦在这里
        if name == "execute_sql" and role != "super_admin":
            return {"ok": False, "error": "execute_sql 仅超级管理员可用"}, "tool"
        result = await tool_module.execute(
            args=args, token=token, db=db,
            allow_write_allowed=(role == "super_admin"),
        )
        return result, "tool"

    return {"ok": False, "error": f"未知工具: {name}"}, "tool"
