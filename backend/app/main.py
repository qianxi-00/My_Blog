"""
FastAPI 应用入口
"""

from contextlib import asynccontextmanager
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .api.v1.router import api_router
from .core.config import settings
from .core.database import close_db, ensure_schema_columns, init_db
from .core.redis import close_redis, init_redis
from .services.storage_service import ensure_upload_dirs, resolve_upload_root


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    应用生命周期管理
    启动时初始化数据库与默认配置，关闭时清理连接
    """
    print("🚀 正在启动应用...")

    # 创建持久化上传目录（images / avatars / forum）
    ensure_upload_dirs()
    print("✅ 上传目录已准备就绪")

    # 初始化数据库表（DEBUG 模式下自动初始化并建超管）
    if settings.DEBUG:
        try:
            await init_db()
            print("✅ 数据库表已初始化")

            from .services.init_data import init_super_admin
            await init_super_admin()
        except Exception as e:
            print(f"⚠️ 初始化数据库时出错: {e}")
            print("提示：请确保数据库配置正确，或者手动运行 Alembic 迁移")

    # 无条件补齐新表与新增列（含 DEBUG=false 的生产环境）
    try:
        await ensure_schema_columns()
    except Exception as e:
        print(f"❌ schema 补列失败，服务可能不可用: {e}")
        raise

    # 生产/开发无条件执行幂等配置补齐、老白名单迁移与默认社区版块初始化
    try:
        from .services.init_data import ensure_default_data
        await ensure_default_data()
    except Exception as e:
        print(f"⚠️ 初始化默认数据出错: {e}")

    print("✅ 应用启动完成")
    print(f"📖 API 文档地址: http://{settings.APP_HOST}:{settings.APP_PORT}/docs")

    # 初始化 Redis
    await init_redis()

    yield

    print("🔄 正在关闭应用...")
    await close_redis()
    await close_db()
    print("✅ 应用已关闭")


# 创建 FastAPI 应用
app = FastAPI(
    title="DevLog API",
    description="个人技术博客后端 API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
    redirect_slashes=False,  # 禁用自动斜杠重定向，避免 307
)

# 配置 CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册 API 路由
app.include_router(api_router, prefix="/api/v1")

# 兼容开发期本地直接访问 /uploads（线上持久化读取主要走 /api/v1/upload/files/）
upload_path = resolve_upload_root()
if os.path.exists(upload_path):
    app.mount("/uploads", StaticFiles(directory=upload_path), name="uploads")


@app.get("/", tags=["Root"])
async def root():
    """根路径"""
    return {
        "message": "欢迎访问 DevLog API",
        "docs": "/docs",
        "version": "1.0.0"
    }


@app.get("/health", tags=["Health"])
async def health_check():
    """健康检查"""
    return {"status": "healthy"}
