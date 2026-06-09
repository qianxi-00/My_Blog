"""
管理后台 Agent 服务（模块化版本）
支持 Skill（高层技能）+ Tool（通用工具）混合调用
"""

from .service import AgentService

__all__ = ["AgentService"]
