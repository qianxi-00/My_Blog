"""
FastAPI 应用入口
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .core.config import settings
from .core.database import init_db, close_db
from .core.redis import init_redis, close_redis
from .api.v1.router import api_router

import os


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    应用生命周期管理
    启动时初始化数据库，关闭时清理连接
    """
    # 启动时
    print("🚀 正在启动应用...")
    
    # 创建上传目录
    upload_dir = os.path.join(os.path.dirname(__file__), "..", settings.UPLOAD_DIR)
    os.makedirs(upload_dir, exist_ok=True)
    os.makedirs(os.path.join(upload_dir, "images"), exist_ok=True)
    print("✅ 上传目录已创建")
    
    # 初始化数据库表（DEBUG 模式下自动创建表）
    if settings.DEBUG:
        try:
            await init_db()
            print("✅ 数据库表已初始化")
            
            # 延迟导入以避免循环导入
            from .services.init_data import init_super_admin, init_site_settings
            
            # 初始化超级管理员
            await init_super_admin()
            
            # 初始化站点配置
            await init_site_settings()
        except Exception as e:
            print(f"⚠️ 初始化数据库时出错: {e}")
            print("提示：请确保数据库配置正确，或者手动运行 Alembic 迁移")
    
    print("✅ 应用启动完成")
    print(f"📖 API 文档地址: http://{settings.APP_HOST}:{settings.APP_PORT}/docs")
    
    # 初始化 Redis
    await init_redis()
    
    yield
    
    # 关闭时
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
    allow_origins=["*"],  # 生产环境应该限制为具体域名
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册 API 路由
app.include_router(api_router, prefix="/api/v1")

# 挂载静态文件目录（用于上传的图片）
upload_path = os.path.join(os.path.dirname(__file__), "..", settings.UPLOAD_DIR)
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
