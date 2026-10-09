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
            # ⚠️ 这里**不要**加显式 rollback。
            # 2026-09-30 踩过：为了治一次 "database is locked"（事后查明那次其实是我
            # 自己的演练容器 DATABASE_URL 没隔离、连到了生产库，**不是产品缺陷**），
            # 在这里加了 `await session.rollback()`。结果 StreamingResponse 的依赖清理
            # 是在响应**开始发送后**就执行的、不等生成器跑完，于是 session 在 SSE
            # 生成器第一行之前就被 rollback+close，ORM 对象当场 detached，
            # agent / chat 两条流式接口全部报
            # "Instance <...> is not bound to a Session"（线上实踩两次才定位到）。
            # async with 的 __aexit__ 本来就会 close 并回滚，这里保持原样即可。
            await session.close()


async def init_db():
    """
    初始化数据库
    创建所有表（开发环境使用，生产环境应使用 Alembic 迁移）
    """
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # create_all 只建新表，不会给已存在的表补列，这里补齐后加的可空列。
    await ensure_schema_columns()


# 后加列清单：表名 -> [(列名, 列定义)]
# 每加一个"给已有表补的列"就往这里加一条，别再写一次性迁移脚本。
_ADDED_COLUMNS: dict[str, list[tuple[str, str]]] = {
    # 2026-09-30：chat_sessions 补归属，修"任何人可删任意会话 / 往他人会话写消息"
    "chat_sessions": [
        ("user_id", "INTEGER"),
        ("owner_ip", "VARCHAR(64)"),
    ],
    # 2026-10-08 十期 B3「可追问导读卡」：LLM 生成、站长采纳后才对访客可见。
    # ai_intro 存 JSON 字符串 {summary, questions[], generated_at}；adopted 由
    # 管理员（或 AI 助手走 ArticleUpdate）置 true，文章页只渲染已采纳的。
    "articles": [
        ("ai_intro", "TEXT"),
        ("ai_intro_adopted", "BOOLEAN DEFAULT 0"),
    ],
}


async def ensure_schema_columns() -> None:
    """
    幂等补齐"后加的可空列"。

    注意：这个函数在 lifespan 里**无条件**调用（不挂在 settings.DEBUG 门控下）——
    生产是 DEBUG=false，只挂 init_db 的话新代码上线会直接 500（列不存在）。
    """
    from sqlalchemy import text

    # ---- 十一期修复：无条件补建缺失的表（create_all 幂等 checkfirst）----
    # init_db 此前只在 DEBUG 模式跑，生产从不执行；项目也从不用 Alembic
    # （表结构演进一直靠本函数补列 + 种子函数）。结果：新增模型（如
    # ChatQaCache）在生产永远建不出来——十一期实踩（启动后 no such table，
    # 删表重启的对照实验复现）。create_all 默认 checkfirst=True，对已存在的
    # 表零操作，生产多跑一次只是几十个 PRAGMA 检查，成本可忽略。
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    except Exception as e:
        print(f"❌ create_all 补建新表失败: {e}")
        raise

    async with engine.begin() as conn:
        for table, columns in _ADDED_COLUMNS.items():
            existing = {
                row[1]
                for row in (await conn.execute(text(f"PRAGMA table_info({table})"))).fetchall()
            }
            if not existing:
                # 表还不存在（全新库）：上面 create_all 已按模型建好带列的表
                continue
            for name, ddl in columns:
                if name in existing:
                    continue
                await conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}"))
                # 补索引（IF NOT EXISTS 保证幂等）
                await conn.execute(
                    text(f"CREATE INDEX IF NOT EXISTS ix_{table}_{name} ON {table} ({name})")
                )


async def close_db():
    """
    关闭数据库连接
    应用关闭时调用
    """
    await engine.dispose()
