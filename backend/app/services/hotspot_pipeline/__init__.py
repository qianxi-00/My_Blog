"""热点文章流水线（LangGraph）。

两个入口：
- `run_pipeline`：老流水线（选题→一次性写作→闸→审稿），cron 仍在用
- `run_harness`：二十三期 agent harness（规划层→章节并发→汇总→回检），
  结构化写作、章节级并行、配图可搬论文原图

harness 的 import 放在 graph 之后且包 try——langgraph 缺失时老流水线仍能报错
而不是整个模块 ImportError（本地开发环境无 langgraph）。
"""

from .graph import run_pipeline, get_graph, build_graph  # noqa: F401

try:
    from .harness import run_harness, build_harness_graph  # noqa: F401
except ImportError:  # harness 依赖缺失时不影响老流水线
    run_harness = None  # type: ignore
    build_harness_graph = None  # type: ignore

__all__ = [
    "run_pipeline",
    "get_graph",
    "build_graph",
    "run_harness",
    "build_harness_graph",
]