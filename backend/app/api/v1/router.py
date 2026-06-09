"""
API v1 路由聚合
"""

from fastapi import APIRouter

from .auth import router as auth_router
from .admins import router as admins_router
from .articles import router as articles_router
from .comments import router as comments_router
from .prompts import router as prompts_router
from .chat import router as chat_router
from .upload import router as upload_router
from .stats import router as stats_router
from .settings import router as settings_router
from .subscribe import router as subscribe_router
from .agent import router as agent_router
from .forum import router as forum_router
from .hotspots import router as hotspots_router

api_router = APIRouter()

# 注册所有子路由
api_router.include_router(auth_router, prefix="/auth", tags=["认证"])
api_router.include_router(admins_router, prefix="/admins", tags=["管理员"])
api_router.include_router(articles_router, prefix="/articles", tags=["文章"])
api_router.include_router(comments_router, prefix="/comments", tags=["评论"])
api_router.include_router(prompts_router, prefix="/prompts", tags=["Prompt"])
api_router.include_router(chat_router, prefix="/chat", tags=["AI 聊天"])
api_router.include_router(upload_router, prefix="/upload", tags=["文件上传"])
api_router.include_router(stats_router, prefix="/stats", tags=["统计"])
api_router.include_router(settings_router, prefix="/settings", tags=["站点配置"])
api_router.include_router(subscribe_router, tags=["订阅"])
api_router.include_router(agent_router, prefix="/agent", tags=["AI Agent"])
api_router.include_router(forum_router, prefix="/forum", tags=["论坛"])
api_router.include_router(hotspots_router, prefix="/hotspots", tags=["每日热点"])
