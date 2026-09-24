"""
数据库连接模块
使用 SQLAlchemy 2.0 异步引擎
"""

from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

from .config import settings


# 创建异步数据库引擎
db_url = settings.database_url
engine_kwargs = {}

# SQLite 不走 MySQL 风格的池参数默认值太少，这里显式放大：
# aiosqlite 每个连接占一个后台线程，20+30 足够个人博客的并发读，不会压爆内存。
if not db_url.startswith("sqlite"):
    engine_kwargs.update({
        "pool_pre_ping": True,
        "pool_size": 10,
        "max_overflow": 20,
    })
else:
    # aiosqlite 方言默认 NullPool（无池）；显式启用有界异步池
    from sqlalchemy.pool import AsyncAdaptedQueuePool

    # SQLite 需要设置 check_same_thread=False；timeout 是驱动层锁等待秒数
    engine_kwargs["connect_args"] = {"check_same_thread": False, "timeout": 30}
    engine_kwargs["poolclass"] = AsyncAdaptedQueuePool
    engine_kwargs.update({
        "pool_pre_ping": True,
        "pool_size": 20,
        "max_overflow": 30,
    })

engine = create_async_engine(
    db_url,
    echo=settings.DEBUG,
    **engine_kwargs,
)


if db_url.startswith("sqlite"):
    @event.listens_for(engine.sync_engine, "connect")
    def _set_sqlite_pragma(dbapi_conn, _record):
        """WAL 模式：写不再阻塞读（默认 delete 模式下每次 view_count+1 都会锁全库）。

        journal_mode=WAL 是文件级持久设置；busy_timeout 兜底写冲突时的快速失败。
        synchronous=NORMAL 是 WAL 下的常规性能档，掉电最多丢最后一次事务。
        """
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.execute("PRAGMA busy_timeout=5000")
        cursor.close()

# 创建异步会话工厂
async_session_maker = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


async def dispose_engine() -> None:
    """显式释放连接池。

    一些 MySQL 异步驱动在解释器退出 / 事件循环关闭时，如果仍有连接未释放，
    可能会出现 "Event loop is closed" 的噪声日志。

    FastAPI 正常运行时会在 lifespan 中调用 close_db()，此处主要用于脚本/测试。
    """

    await engine.dispose()


class Base(DeclarativeBase):
    """
    ORM 模型基类
    所有模型类都应继承此类
    """
    pass


async def get_db() -> AsyncSession:
    """
    获取数据库会话的依赖注入函数
    用于 FastAPI 的 Depends
    """
    async with async_session_maker() as session:
        try:
            yield session
        finally:
            await session.close()


async def init_db():
    """
    初始化数据库
    创建所有表（开发环境使用，生产环境应使用 Alembic 迁移）
    """
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def close_db():
    """
    关闭数据库连接
    应用关闭时调用
    """
    await engine.dispose()
