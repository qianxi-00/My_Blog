"""
Redis 缓存服务
提供异步 Redis 连接池管理 + JSON 缓存工具
"""

import json
import logging
from typing import Optional, Any

import redis.asyncio as aioredis

from .config import settings

logger = logging.getLogger(__name__)

# ---- 全局 Redis 连接池 ----
_redis_pool: Optional[aioredis.Redis] = None


async def init_redis() -> aioredis.Redis | None:
    """初始化 Redis 连接池（应用启动时调用）"""
    global _redis_pool

    if not getattr(settings, 'REDIS_ENABLED', True):
        logger.info("ℹ️ Redis 已禁用（REDIS_ENABLED=false），跳过缓存初始化")
        _redis_pool = None
        return None

    try:
        _redis_pool = aioredis.Redis(
            host=settings.REDIS_HOST,
            port=settings.REDIS_PORT,
            password=settings.REDIS_PASSWORD or None,
            db=settings.REDIS_DB,
            decode_responses=True,
            socket_connect_timeout=max(1, int(getattr(settings, 'REDIS_CONNECT_TIMEOUT', 1) or 1)),
            socket_timeout=max(1, int(getattr(settings, 'REDIS_SOCKET_TIMEOUT', 1) or 1)),
            retry_on_timeout=False,
            health_check_interval=30,
        )
        await _redis_pool.ping()
        logger.info("✅ Redis 连接成功 (%s:%s)", settings.REDIS_HOST, settings.REDIS_PORT)
        return _redis_pool
    except Exception as e:
        logger.warning("⚠️ Redis 连接失败，缓存将被禁用: %s", e)
        _redis_pool = None
        return None


async def close_redis():
    """关闭 Redis 连接（应用关闭时调用）"""
    global _redis_pool
    if _redis_pool:
        await _redis_pool.close()
        _redis_pool = None
        logger.info("✅ Redis 连接已关闭")


def get_redis() -> Optional[aioredis.Redis]:
    """获取 Redis 实例（可能为 None）"""
    return _redis_pool


async def cache_get(key: str) -> Optional[Any]:
    """从缓存获取 JSON 数据，未命中或 Redis 不可用返回 None"""
    if not _redis_pool:
        return None
    try:
        raw = await _redis_pool.get(key)
        if raw is not None:
            return json.loads(raw)
    except Exception as e:
        logger.warning("cache_get(%s) 失败: %s", key, e)
    return None


async def cache_set(key: str, value: Any, ttl: int = 60):
    """写入 JSON 缓存，ttl 单位秒；Redis 不可用时静默跳过"""
    if not _redis_pool:
        return
    try:
        await _redis_pool.set(key, json.dumps(value, default=str), ex=ttl)
    except Exception as e:
        logger.warning("cache_set(%s) 失败: %s", key, e)


async def cache_delete(key: str):
    """删除单个缓存键"""
    if not _redis_pool:
        return
    try:
        await _redis_pool.delete(key)
    except Exception as e:
        logger.warning("cache_delete(%s) 失败: %s", key, e)


async def cache_delete_pattern(pattern: str):
    """按模式批量删除缓存键（如 articles:*）"""
    if not _redis_pool:
        return
    try:
        cursor = 0
        while True:
            cursor, keys = await _redis_pool.scan(cursor=cursor, match=pattern, count=100)
            if keys:
                await _redis_pool.delete(*keys)
            if cursor == 0:
                break
    except Exception as e:
        logger.warning("cache_delete_pattern(%s) 失败: %s", pattern, e)


class CacheKeys:
    """缓存键名称空间"""

    ARTICLES_LIST = "articles:list"
    ARTICLE_DETAIL = "articles:detail"
    ARTICLES_TAGS = "articles:tags"
    ARTICLES_CATEGORIES = "articles:categories"
    ARTICLES_ARCHIVES = "articles:archives"

    SETTINGS_PUBLIC = "settings:public"
    SETTINGS_ALL = "settings:all"

    STATS_OVERVIEW = "stats:overview"
    STATS_DAILY = "stats:daily"
    STATS_POPULAR = "stats:popular"

    COMMENTS_ARTICLE = "comments:article"

    @staticmethod
    def article_detail(article_id: int) -> str:
        return f"articles:detail:{article_id}"

    @staticmethod
    def articles_list(**params) -> str:
        import hashlib
        param_str = "&".join(f"{k}={v}" for k, v in sorted(params.items()) if v is not None)
        h = hashlib.md5(param_str.encode()).hexdigest()[:12]
        return f"articles:list:{h}"

    @staticmethod
    def stats_daily(days: int) -> str:
        return f"stats:daily:{days}"

    @staticmethod
    def comments_article(article_id: int) -> str:
        return f"comments:article:{article_id}"
