"""
批量操作技能
覆盖：批量审核评论、批量处理举报、批量文章状态变更、批量删除

为什么需要：全站没有任何接受 `ids: List[int]` 的路由（settings/batch 和
subscribers/freeze-all 是全表操作，不算批量）。而 AI 最擅长的恰恰是
"把这 20 条待审评论一次过"——此前只能让它循环调单条接口：慢、中途失败会
留下半处理状态、token 烧得多。这里在 skill 层做循环 + 汇总，失败不中断，
最后统一报告哪些成功哪些失败，AI 再决定是否重试。
"""

from __future__ import annotations

from typing import Any, Dict, List

from sqlalchemy.ext.asyncio import AsyncSession

from ..tools.call_api import call_api


SKILL_SCHEMAS: List[Dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "batch_review_comments",
            "description": (
                "批量审核评论。通过(comment_ids)或拒绝(reject_ids)，一次最多 50 条。"
                "会逐条调用并汇总结果，失败的条目会在 failed 里列出（不中断整批）"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "comment_ids": {
                        "type": "array", "items": {"type": "integer"},
                        "description": "要**通过**的评论 ID 列表（最多 50 条）",
                    },
                    "reject_ids": {
                        "type": "array", "items": {"type": "integer"},
                        "description": "要**拒绝**的评论 ID 列表（最多 50 条）",
                    },
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "batch_handle_reports",
            "description": (
                "批量处理评论举报。dismiss_ids 驳回举报（保留评论）、"
                "confirm_ids 确认举报（删除被举报评论），一次最多 50 条"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "dismiss_ids": {
                        "type": "array", "items": {"type": "integer"},
                        "description": "要驳回举报的评论 ID 列表（最多 50 条）",
                    },
                    "confirm_ids": {
                        "type": "array", "items": {"type": "integer"},
                        "description": "要确认举报（删评论）的评论 ID 列表（最多 50 条）",
                    },
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "batch_update_articles",
            "description": (
                "批量修改文章状态或删除。publish_ids 发布、unpublish_ids 下架（退回草稿）、"
                "pin_ids 置顶、unpin_ids 取消置顶、delete_ids 删除，一次最多 50 条。"
                "⚠️ delete_ids 是不可逆操作，执行前务必先用 get_article_detail 逐个确认"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "publish_ids": {"type": "array", "items": {"type": "integer"}, "description": "要发布的文章 ID"},
                    "unpublish_ids": {"type": "array", "items": {"type": "integer"}, "description": "要下架的文章 ID"},
                    "pin_ids": {"type": "array", "items": {"type": "integer"}, "description": "要置顶的文章 ID"},
                    "unpin_ids": {"type": "array", "items": {"type": "integer"}, "description": "要取消置顶的文章 ID"},
                    "delete_ids": {"type": "array", "items": {"type": "integer"}, "description": "要删除的文章 ID（不可逆）"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "batch_review_prompts",
            "description": "批量审核提示词投稿。approve_ids 通过、reject_ids 拒绝，一次最多 50 条",
            "parameters": {
                "type": "object",
                "properties": {
                    "approve_ids": {"type": "array", "items": {"type": "integer"}, "description": "要通过的提示词 ID"},
                    "reject_ids": {"type": "array", "items": {"type": "integer"}, "description": "要拒绝的提示词 ID"},
                },
            },
        },
    },
]


# ------------------------------------------------------------------ #
#  批量执行
# ------------------------------------------------------------------ #

MAX_BATCH = 50


def _result(payload: Any) -> tuple[bool, str]:
    """从 call_api 的返回里判断这条是否成功，返回 (是否成功, 失败原因)。

    call_api 成功时返回 {"ok": True, "status_code": 200, "data": ...}；
    失败时返回 {"ok": False, ...}。两者都要认。
    """
    if isinstance(payload, dict):
        if payload.get("ok") is False:
            return False, str(payload.get("error") or payload.get("message") or "调用失败")
        code = payload.get("status_code")
        if isinstance(code, int) and not (200 <= code < 300):
            return False, f"HTTP {code}"
    return True, "ok"


async def _run_batch(
    items: List[int],
    make_call,
) -> Dict[str, Any]:
    """逐条执行并汇总；单条失败不中断整批。"""
    succeeded: List[int] = []
    failed: List[Dict[str, Any]] = []

    for item_id in items[:MAX_BATCH]:
        ok, detail = await make_call(item_id)
        if ok:
            succeeded.append(item_id)
        else:
            failed.append({"id": item_id, "error": detail})

    return {
        "requested": len(items[:MAX_BATCH]),
        "succeeded_count": len(succeeded),
        "failed_count": len(failed),
        "succeeded": succeeded,
        "failed": failed,
    }


async def _batch_review_comments(
    args: Dict[str, Any], token: str, db: AsyncSession,
) -> Dict[str, Any]:
    approve_ids = args.get("comment_ids") or []
    reject_ids = args.get("reject_ids") or []
    if not approve_ids and not reject_ids:
        return {"ok": False, "error": "请至少传 comment_ids 或 reject_ids"}

    async def approve(cid: int):
        return _result(await call_api(token, "PUT", f"/comments/{cid}/approve"))

    async def reject(cid: int):
        return _result(await call_api(token, "PUT", f"/comments/{cid}/reject"))

    out: Dict[str, Any] = {"ok": True}
    if approve_ids:
        out["approved"] = await _run_batch(approve_ids, approve)
    if reject_ids:
        out["rejected"] = await _run_batch(reject_ids, reject)
    return out


async def _batch_handle_reports(
    args: Dict[str, Any], token: str, db: AsyncSession,
) -> Dict[str, Any]:
    dismiss_ids = args.get("dismiss_ids") or []
    confirm_ids = args.get("confirm_ids") or []
    if not dismiss_ids and not confirm_ids:
        return {"ok": False, "error": "请至少传 dismiss_ids 或 confirm_ids"}

    out: Dict[str, Any] = {"ok": True}

    async def dismiss(cid: int):
        return _result(await call_api(token, "PUT", f"/comments/{cid}/dismiss-report"))

    async def confirm(cid: int):
        return _result(await call_api(token, "PUT", f"/comments/{cid}/confirm-report"))

    if dismiss_ids:
        out["dismissed"] = await _run_batch(dismiss_ids, dismiss)
    if confirm_ids:
        out["confirmed"] = await _run_batch(confirm_ids, confirm)
    return out


async def _batch_update_articles(
    args: Dict[str, Any], token: str, db: AsyncSession,
) -> Dict[str, Any]:
    buckets = {
        "published": args.get("publish_ids") or [],
        "unpublished": args.get("unpublish_ids") or [],
        "pinned": args.get("pin_ids") or [],
        "unpinned": args.get("unpin_ids") or [],
        "deleted": args.get("delete_ids") or [],
    }
    if not any(buckets.values()):
        return {"ok": False, "error": "没有要处理的文章 ID"}

    async def publish(aid: int):
        return _result(await call_api(token, "POST", f"/articles/{aid}/publish"))

    async def unpublish(aid: int):
        return _result(
            await call_api(token, "PUT", f"/articles/{aid}", body={"status": "draft"})
        )

    async def pin(aid: int):
        return _result(
            await call_api(token, "PUT", f"/articles/{aid}", body={"is_pinned": True})
        )

    async def unpin(aid: int):
        return _result(
            await call_api(token, "PUT", f"/articles/{aid}", body={"is_pinned": False})
        )

    async def delete(aid: int):
        return _result(await call_api(token, "DELETE", f"/articles/{aid}"))

    runners = {
        "published": publish, "unpublished": unpublish,
        "pinned": pin, "unpinned": unpin, "deleted": delete,
    }
    out: Dict[str, Any] = {"ok": True}
    for key, ids in buckets.items():
        if ids:
            out[key] = await _run_batch(ids, runners[key])
    return out


async def _batch_review_prompts(
    args: Dict[str, Any], token: str, db: AsyncSession,
) -> Dict[str, Any]:
    approve_ids = args.get("approve_ids") or []
    reject_ids = args.get("reject_ids") or []
    if not approve_ids and not reject_ids:
        return {"ok": False, "error": "请至少传 approve_ids 或 reject_ids"}

    async def approve(pid: int):
        return _result(await call_api(token, "PUT", f"/prompts/{pid}/approve"))

    async def reject(pid: int):
        return _result(await call_api(token, "PUT", f"/prompts/{pid}/reject"))

    out: Dict[str, Any] = {"ok": True}
    if approve_ids:
        out["approved"] = await _run_batch(approve_ids, approve)
    if reject_ids:
        out["rejected"] = await _run_batch(reject_ids, reject)
    return out


_HANDLERS = {
    "batch_review_comments": _batch_review_comments,
    "batch_handle_reports": _batch_handle_reports,
    "batch_update_articles": _batch_update_articles,
    "batch_review_prompts": _batch_review_prompts,
}

SKILL_NAMES = frozenset(_HANDLERS.keys())


async def execute(
    name: str,
    args: Dict[str, Any],
    token: str,
    db: AsyncSession,
) -> Dict[str, Any]:
    handler = _HANDLERS.get(name)
    if handler is None:
        return {"ok": False, "error": f"未实现的批量技能: {name}"}
    return await handler(args, token, db)
