"""热点流水线 API：手动/定时触发一次「选题→检索→写作→审稿→发布」。

设计约定：
- POST /hotspot-pipeline/run：super_admin 专属（管线写库、调外部 API）
- body: {"mode": "hot|curriculum", "track_slot": "1900", "publish": false}
  - publish=false（默认）：只入队 /data/blog/pipeline/hotspot_queue/pending/，人工看过再发
  - publish=true：审稿 pass 后直接发布成正式热点
- 管线一次跑 3-10 分钟（多轮 LLM），放 FastAPI 后台任务（asyncio.create_task），
  响应立即返回 run_id；配 GET /hotspot-pipeline/runs 查最近结果。
- 单飞：同一时刻只允许一条管线（1G 内存服务器 + grok 成本控制）。
"""

from __future__ import annotations

import asyncio
import datetime as dt
import uuid

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field

from ...core.config import settings
from ...core.deps import get_super_admin

try:
    from ...services.hotspot_pipeline import run_pipeline
except ImportError as exc:  # langgraph 未装时（本地开发环境）不炸整个 app
    run_pipeline = None  # type: ignore
    _PIPELINE_IMPORT_ERROR = str(exc)

router = APIRouter(prefix="/hotspot-pipeline", tags=["hotspot-pipeline"])

# 运行簿（进程内单例；单实例部署够用，run 过程细节本就走 stdout 日志）
_RUNS: dict[str, dict] = {}


class PipelineRunRequest(BaseModel):
    mode: str = Field(default="hot", description="hot=AIHOT 热点选题；curriculum=知识体系课程")
    track_slot: str = Field(default="1900", description="curriculum 模式的知识线（1800/1900/2000/2100/2200）")
    publish: bool = Field(default=False, description="true=审稿通过后直接发布；false=只入队 pending")


class PipelineRunResponse(BaseModel):
    run_id: str
    status: str
    detail: str


def _prune_runs(keep: int = 10) -> None:
    if len(_RUNS) > keep:
        for k in sorted(_RUNS, key=lambda x: _RUNS[x]["started_at"])[: len(_RUNS) - keep]:
            _RUNS.pop(k, None)


async def _execute(run_id: str, req: PipelineRunRequest) -> None:
    record = _RUNS[run_id]
    try:
        result = await run_pipeline(mode=req.mode, track_slot=req.track_slot, publish=req.publish)
        record["status"] = "failed" if result.get("failed_reason") else "success"
        record["log"] = result.get("log") or []
        record["hotspot_id"] = result.get("hotspot_id")
        record["detail"] = result.get("failed_reason") or (
            f"已发布 hot_topic#{result.get('hotspot_id')}" if req.publish else "已入队 pending，人工发布"
        )
    except Exception as exc:
        import traceback
        traceback.print_exc()
        record["status"] = "failed"
        record["detail"] = f"管线异常: {exc}"
    finally:
        record["finished_at"] = dt.datetime.now().isoformat(timespec="seconds")


@router.post("/run", response_model=PipelineRunResponse)
async def trigger_run(
    req: PipelineRunRequest,
    admin=Depends(get_super_admin),
):
    if run_pipeline is None:
        raise HTTPException(503, f"流水线模块不可用（依赖未装）: {_PIPELINE_IMPORT_ERROR[:200]}")

    running = [r for r in _RUNS.values() if r.get("status") == "running"]
    if running:
        raise HTTPException(409, "已有一条流水线在跑，等它结束再触发（单飞）")

    run_id = uuid.uuid4().hex[:12]
    _RUNS[run_id] = {
        "run_id": run_id,
        "status": "running",
        "mode": req.mode,
        "publish": req.publish,
        "started_at": dt.datetime.now().isoformat(timespec="seconds"),
        "finished_at": "",
        "detail": "",
        "log": [],
        "hotspot_id": None,
    }
    _prune_runs()
    asyncio.create_task(_execute(run_id, req))
    return PipelineRunResponse(run_id=run_id, status="running", detail="管线已启动（约 3-10 分钟），用 run_id 查 GET /runs")


@router.get("/runs")
async def list_runs(admin=Depends(get_super_admin)):
    return [r for r in _RUNS.values() if r.get("run_id")]


@router.post("/cron", response_model=PipelineRunResponse)
async def cron_trigger(req: PipelineRunRequest, x_cron_key: str = Header(...)):
    """宿主 cron 专用触发口（二十期：每天 3 篇）。

    admin JWT 24h 过期不适合 cron，走 PIPELINE_CRON_KEY（runtime.env 注入，
    cron 现读不落 /etc/cron.d 文件）；除鉴权外与 /run 完全同逻辑。
    裸 str 参数 FastAPI 默认按 query 解析，必须显式 Header(...) 才绑定
    x-cron-key 请求头（convert_underscores 默认把 x_cron_key 映射为 x-cron-key）。
    """
    if not settings.PIPELINE_CRON_KEY or x_cron_key != settings.PIPELINE_CRON_KEY:
        raise HTTPException(401, "cron key 无效")
    # 与 trigger_run 同逻辑，但跳过 admin 依赖（cron 已用 key 鉴权）
    running = [r for r in _RUNS.values() if r.get("status") == "running"]
    if running:
        raise HTTPException(409, "已有一条流水线在跑，本触发放弃（cron 下个时间点再来）")
    run_id = uuid.uuid4().hex[:12]
    _RUNS[run_id] = {
        "run_id": run_id,
        "status": "running",
        "mode": req.mode,
        "publish": req.publish,
        "started_at": dt.datetime.now().isoformat(timespec="seconds"),
        "finished_at": "",
        "detail": "",
        "log": [],
        "hotspot_id": None,
        "trigger": "cron",
    }
    _prune_runs()
    asyncio.create_task(_execute(run_id, req))
    return PipelineRunResponse(run_id=run_id, status="running", detail="cron 触发成功（约 3-10 分钟）")
