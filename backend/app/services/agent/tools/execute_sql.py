"""
通用 SQL 执行工具
当 Skill 无法覆盖时，用于执行任意 SQL 查询
"""

from __future__ import annotations

import re
from typing import Any, Dict, List

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


# ------------------------------------------------------------------ #
#  Tool Schema
# ------------------------------------------------------------------ #

TOOL_SCHEMAS: List[Dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "execute_sql",
            "description": "【通用兜底】执行任意 SQL 查询（默认只读），当 Skill 无法覆盖时使用",
            "parameters": {
                "type": "object",
                "properties": {
                    "sql": {
                        "type": "string",
                        "description": "要执行的 SQL 语句",
                    },
                    "allow_write": {
                        "type": "boolean",
                        "description": "是否允许写入语句，默认 false",
                        "default": False,
                    },
                },
                "required": ["sql"],
            },
        },
    },
]


# ------------------------------------------------------------------ #
#  执行器
# ------------------------------------------------------------------ #

async def execute(
    args: Dict[str, Any],
    db: AsyncSession,
    **_kwargs: Any,
) -> Dict[str, Any]:
    """执行任意 SQL 语句"""
    sql = args.get("sql", "")
    allow_write = bool(args.get("allow_write", False))
    return await execute_sql(db, sql, allow_write)


async def execute_sql(
    db: AsyncSession,
    sql: str,
    allow_write: bool = False,
) -> Dict[str, Any]:
    """
    实际的 SQL 执行逻辑
    NOTE: 此函数同时被 Skill 层内部复用（如 update_daily_stats 等直接操作数据库）
    """
    raw_sql = sql.strip()
    normalized = re.sub(r"\s+", " ", raw_sql.lower())
    read_only_prefixes = ("select ", "show ", "describe ", "desc ", "explain ", "with ")

    if not allow_write and not normalized.startswith(read_only_prefixes):
        return {
            "ok": False,
            "error": "只读模式下仅允许 SELECT/SHOW/DESCRIBE/EXPLAIN/WITH 查询。",
        }

    try:
        result = await db.execute(text(raw_sql))
        if result.returns_rows:
            from datetime import date, datetime
            rows = []
            for row in result.fetchall():
                d = {}
                for k, v in dict(row._mapping).items():
                    if isinstance(v, (datetime, date)):
                        d[k] = v.isoformat()
                    else:
                        d[k] = v
                rows.append(d)
                
            return {
                "ok": True,
                "row_count": len(rows),
                "rows": rows,
            }

        await db.commit()
        return {
            "ok": True,
            "row_count": result.rowcount,
            "message": "SQL 执行成功",
        }
    except Exception as exc:
        await db.rollback()
        return {
            "ok": False,
            "error": str(exc),
        }
