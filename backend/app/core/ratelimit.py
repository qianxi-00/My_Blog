"""
进程内限流依赖工厂（2026-09-24 用户系统改造）

滑动窗口计数实现：每个 (name, key) 维护一个窗口内的时间戳列表，超限抛 429。

精度说明（已知天花板，接受）：
- 生产 uvicorn 跑 2 workers，本模块是进程内 dict，每个 worker 各持一份桶，
  实际限流精度减半（limit=5 实际最多放行 ~2*5 次/窗口），对防刷场景够用。
  需要跨进程精确限流时再换 Redis（ponytail: 升级路径 = core/redis.py 的 cache_get/set 加计数原语）。
- 单事件循环内无 await 竞争点，dict 读写不需要锁；
  time.monotonic() 不受系统时钟回拨影响。
"""

import time

from fastapi import Depends, HTTPException, Request, status

from ..models.user import User
from .deps import get_current_user

# name -> key -> 窗口内命中时间戳列表
_buckets: dict[str, dict[str, list[float]]] = {}


def rate_limit(name: str, limit: int, window_seconds: int, key_scope: str = "ip"):
    """限流依赖工厂。

    Args:
        name: 限流规则名（隔离不同端点的桶）
        limit: 窗口内允许的次数
        window_seconds: 窗口长度（秒）
        key_scope: "ip" 按客户端 IP 维度（匿名请求也生效，不做认证）；
                   "user" 按当前登录用户 id 维度（需要有效 token，未认证会被 get_current_user 拦 401）
    """
    if key_scope not in ("ip", "user"):
        raise ValueError(f"key_scope 必须是 ip/user，收到: {key_scope!r}")

    def _consume(key: str) -> None:
        now = time.monotonic()
        store = _buckets.setdefault(name, {})

        # 惰性清理：顺手把整个规则里过期的 key 清掉，防止 dict 无限增长
        if len(store) > 1024:
            for k in [k for k, ts in store.items() if not ts or now - ts[-1] >= window_seconds]:
                store.pop(k, None)

        hits = [t for t in store.get(key, []) if now - t < window_seconds]
        if len(hits) >= limit:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="操作过于频繁，请稍后再试",
            )
        hits.append(now)
        store[key] = hits

    if key_scope == "user":
        # 只有 user 维度才解析认证：ip 维度绝不碰 get_current_user，
        # 否则匿名请求会被它的 401 拦住（访客评论/注册都必须能过）
        async def _check_user(user: User = Depends(get_current_user)) -> None:
            _consume(f"user:{user.id}")

        return _check_user

    async def _check_ip(request: Request) -> None:
        client = request.client
        _consume(f"ip:{client.host if client else 'unknown'}")

    return _check_ip
