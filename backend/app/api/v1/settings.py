"""
站点配置 API
"""

from typing import List, Dict

from fastapi import APIRouter, Depends, HTTPException, status, Body
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ...core.database import get_db
from ...core.deps import get_current_admin, get_super_admin
from ...core.redis import cache_get, cache_set, cache_delete, CacheKeys
from ...models.admin import Admin
from ...models.settings import SiteSetting
from ...schemas.stats import (
    SiteSettingResponse, SiteSettingUpdate,
    PublicSiteSettings, ContactInfo
)

router = APIRouter()


async def _invalidate_settings_cache():
    """清除站点设置缓存"""
    await cache_delete(CacheKeys.SETTINGS_PUBLIC)
    await cache_delete(CacheKeys.SETTINGS_ALL)


@router.get("/public", response_model=PublicSiteSettings)
async def get_public_settings(
    db: AsyncSession = Depends(get_db)
):
    """
    获取公开配置（联系方式等）
    优先从超级管理员个人资料获取，如果没有则使用配置表
    """
    cached = await cache_get(CacheKeys.SETTINGS_PUBLIC)
    if cached:
        return cached

    # 获取站点配置
    result = await db.execute(select(SiteSetting))
    settings_list = result.scalars().all()
    settings_dict = {s.key: s.value for s in settings_list}
    
    # 获取超级管理员资料
    result_admin = await db.execute(
        select(Admin).where(Admin.role == "super_admin").order_by(Admin.id)
    )
    super_admin = result_admin.scalars().first()
    
    resp = PublicSiteSettings(
        site_title=settings_dict.get("site_title", "DevLog"),
        site_description=settings_dict.get("site_description", ""),
        admin_avatar=super_admin.avatar_url if super_admin and super_admin.avatar_url else settings_dict.get("admin_avatar", ""),
        admin_bio=super_admin.bio if super_admin and super_admin.bio else settings_dict.get("admin_bio", ""),
        contact=ContactInfo(
            email=super_admin.email if super_admin and super_admin.email else settings_dict.get("contact_email"),
            wechat=super_admin.wechat if super_admin and super_admin.wechat else settings_dict.get("contact_wechat"),
            github=super_admin.github if super_admin and super_admin.github else settings_dict.get("contact_github"),
            qq=super_admin.qq if super_admin and super_admin.qq else settings_dict.get("contact_qq"),
            bilibili=super_admin.bilibili if super_admin and super_admin.bilibili else settings_dict.get("contact_bilibili")
        )
    )
    await cache_set(CacheKeys.SETTINGS_PUBLIC, resp.model_dump(), ttl=600)
    return resp


@router.get("", response_model=List[SiteSettingResponse])
async def get_all_settings(
    db: AsyncSession = Depends(get_db),
    admin: Admin = Depends(get_super_admin)
):
    """
    获取所有配置（超级管理员）
    """
    cached = await cache_get(CacheKeys.SETTINGS_ALL)
    if cached:
        return cached

    result = await db.execute(select(SiteSetting).order_by(SiteSetting.key))
    settings = result.scalars().all()
    
    resp = [SiteSettingResponse.model_validate(s).model_dump() for s in settings]
    await cache_set(CacheKeys.SETTINGS_ALL, resp, ttl=300)
    return resp


# ⚠️ /batch 必须在 /{key} 之前注册，否则 "batch" 会被当成 {key} 参数匹配
@router.put("/batch")
async def update_settings_batch(
    settings_data: Dict[str, str] = Body(...),
    db: AsyncSession = Depends(get_db),
    admin: Admin = Depends(get_super_admin)
):
    """
    批量更新配置（超级管理员）
    """
    for key, value in settings_data.items():
        result = await db.execute(
            select(SiteSetting).where(SiteSetting.key == key)
        )
        setting = result.scalar_one_or_none()
        
        if not setting:
            setting = SiteSetting(
                key=key,
                value=str(value),
                type="string"
            )
            db.add(setting)
        else:
            setting.value = str(value)
    
    await db.commit()
    
    await _invalidate_settings_cache()
    return {"message": "批量更新成功", "updated_keys": list(settings_data.keys())}


@router.put("/{key}")
async def update_setting(
    key: str,
    setting_data: SiteSettingUpdate,
    db: AsyncSession = Depends(get_db),
    admin: Admin = Depends(get_super_admin)
):
    """
    更新配置项（超级管理员）
    """
    result = await db.execute(
        select(SiteSetting).where(SiteSetting.key == key)
    )
    setting = result.scalar_one_or_none()
    
    if not setting:
        # 如果配置项不存在，创建新的
        setting = SiteSetting(
            key=key,
            value=setting_data.value,
            type="string"
        )
        db.add(setting)
    else:
        setting.value = setting_data.value
    
    await db.commit()
    
    await _invalidate_settings_cache()
    return {"message": "更新成功", "key": key, "value": setting_data.value}

