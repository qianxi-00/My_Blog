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
import os
import time
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

try:
    # 二十三期：agent harness 入口（规划→章节并发→汇总→回检）
    from ...services.hotspot_pipeline import run_harness
except ImportError as exc:
    run_harness = None  # type: ignore
    _HARNESS_IMPORT_ERROR = str(exc)

router = APIRouter(prefix="/hotspot-pipeline", tags=["hotspot-pipeline"])

# 运行簿（进程内单例；单实例部署够用，run 过程细节本就走 stdout 日志）
_RUNS: dict[str, dict] = {}

# 二十一期：文件锁替代内存单飞——uvicorn 2 workers 各持 _RUNS，内存检查
# 打到错的 worker 就失效（实测 cron 与手动 run 并发双跑）。锁文件落数据卷
# （/data/pipeline/.run.lock）两 worker 都看得见；30 分钟未释放视为死锁豁免。
LOCK_PATH = "/data/pipeline/.run.lock"
LOCK_STALE_SECONDS = 1800


class PipelineRunRequest(BaseModel):
    mode: str = Field(default="hot", description="hot=AIHOT 热点选题；curriculum=知识体系课程")
    track_slot: str = Field(default="1900", description="curriculum 模式的知识线（1800/1900/2000/2100/2200）")
    publish: bool = Field(default=False, description="true=审稿通过后直接发布；false=只入队 pending")
    rework_file: str = Field(
        default="",
        description="回炉模式：服务器/容器内绝对路径的存量稿件（.md）——跳过选题/检索直进结构闸，过审即发布",
    )
    use_harness: bool = Field(
        default=False,
        description="true=走二十三期 agent harness（规划层→章节并发写作→汇总→回检）；false=老流水线",
    )


class PipelineRunResponse(BaseModel):
    run_id: str
    status: str
    detail: str


def _try_acquire_lock() -> bool:
    try:
        fd = os.open(LOCK_PATH, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        os.write(fd, f"{os.getpid()} {dt.datetime.now().isoformat()}".encode())
        os.close(fd)
        return True
    except FileExistsError:
        try:
            # 死锁豁免：管线一次 3-15 分钟；超 30 分钟的锁必然是残留（容器重启/进程被杀）
            if time.time() - os.path.getmtime(LOCK_PATH) > LOCK_STALE_SECONDS:
                os.unlink(LOCK_PATH)
                return _try_acquire_lock()
        except FileNotFoundError:
            return _try_acquire_lock()
        return False
    except OSError:
        # /data/pipeline 目录不存在（冷启动）——建目录重试一次
        os.makedirs("/data/pipeline", exist_ok=True)
        try:
            fd = os.open(LOCK_PATH, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            os.write(fd, f"{os.getpid()} {dt.datetime.now().isoformat()}".encode())
            os.close(fd)
            return True
        except OSError:
            return False


def _release_lock() -> None:
    try:
        os.unlink(LOCK_PATH)
    except OSError:
        pass


def _prune_runs(keep: int = 10) -> None:
    if len(_RUNS) > keep:
        for k in sorted(_RUNS, key=lambda x: _RUNS[x]["started_at"])[: len(_RUNS) - keep]:
            _RUNS.pop(k, None)


async def _execute(run_id: str, req: PipelineRunRequest) -> None:
    record = _RUNS[run_id]
    try:
        if req.use_harness:
            # 二十三期 agent harness：自己管选题/检索（论文为主），查重上下文
            # 由 harness 内部构造——它直接查 DB 与队列
            result = await run_harness(
                mode=req.mode,
                track_slot=req.track_slot,
                publish_flag=req.publish,
            )
        else:
            result = await run_pipeline(
                mode=req.mode,
                track_slot=req.track_slot,
                publish=req.publish,
                rework_file=req.rework_file,
            )
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
        _release_lock()


@router.post("/run", response_model=PipelineRunResponse)
async def trigger_run(
    req: PipelineRunRequest,
    admin=Depends(get_super_admin),
):
    if run_pipeline is None:
        raise HTTPException(503, f"流水线模块不可用（依赖未装）: {_PIPELINE_IMPORT_ERROR[:200]}")
    if req.use_harness and run_harness is None:
        raise HTTPException(503, f"harness 模块不可用: {_HARNESS_IMPORT_ERROR[:200]}")

    # 二十一期：文件锁真单飞（跨 worker 可见）；内存 _RUNS 在 2 workers 下失效
    if not _try_acquire_lock():
        raise HTTPException(409, "已有一条流水线在跑（文件锁），等它结束再触发")

    run_id = uuid.uuid4().hex[:12]
    _RUNS[run_id] = {
        "run_id": run_id,
        "status": "running",
        "mode": req.mode,
        "publish": req.publish,
        "rework_file": req.rework_file,
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
    if req.use_harness and run_harness is None:
        raise HTTPException(503, f"harness 模块不可用: {_HARNESS_IMPORT_ERROR[:200]}")
    # 与 trigger_run 同逻辑，但跳过 admin 依赖（cron 已用 key 鉴权）；
    # 文件锁单飞（二十一期）：跨 worker 真单飞
    if not _try_acquire_lock():
        raise HTTPException(409, "已有一条流水线在跑（文件锁），本触发放弃（cron 下个时间点再来）")
    run_id = uuid.uuid4().hex[:12]
    _RUNS[run_id] = {
        "run_id": run_id,
        "status": "running",
        "mode": req.mode,
        "publish": req.publish,
        "rework_file": req.rework_file,
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
