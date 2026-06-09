"""
初始化数据服务
创建初始超级管理员和站点配置
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import settings
from ..core.database import async_session_maker
from ..core.security import get_password_hash
from ..models.admin import Admin
from ..models.settings import SiteSetting, DEFAULT_SETTINGS


async def init_super_admin():
    """
    初始化超级管理员
    如果不存在则创建
    """
    async with async_session_maker() as session:
        # 检查是否已存在超级管理员
        result = await session.execute(
            select(Admin).where(Admin.username == settings.SUPER_ADMIN_USERNAME)
        )
        existing_admin = result.scalar_one_or_none()
        
        if existing_admin:
            print(f"✅ 超级管理员 '{settings.SUPER_ADMIN_USERNAME}' 已存在")
            return
        
        # 创建超级管理员
        admin = Admin(
            username=settings.SUPER_ADMIN_USERNAME,
            password_hash=get_password_hash(settings.SUPER_ADMIN_PASSWORD),
            display_name="超级管理员",
            role="super_admin",
            is_active=True
        )
        
        session.add(admin)
        await session.commit()
        print(f"✅ 已创建超级管理员 '{settings.SUPER_ADMIN_USERNAME}'")


async def init_site_settings():
    """
    初始化站点配置
    如果配置项不存在则创建默认值
    """
    async with async_session_maker() as session:
        for setting_data in DEFAULT_SETTINGS:
            # 检查配置项是否存在
            result = await session.execute(
                select(SiteSetting).where(SiteSetting.key == setting_data["key"])
            )
            existing_setting = result.scalar_one_or_none()
            
            if not existing_setting:
                setting = SiteSetting(
                    key=setting_data["key"],
                    value=setting_data["value"],
                    type=setting_data["type"],
                    description=setting_data["description"]
                )
                session.add(setting)
        
        await session.commit()
        print("✅ 站点配置已初始化")
