"""
站点配置 API
"""

import asyncio
from typing import List, Dict

from fastapi import APIRouter, Depends, HTTPException, status, Body
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ...core.database import get_db
from ...core.deps import get_current_admin, get_super_admin
from ...core.redis import cache_get, cache_set, cache_delete, CacheKeys
from ...models.admin import Admin
from ...models.settings import SiteSetting
from ...models.user import User
from ...schemas.stats import (
    SiteSettingResponse, SiteSettingUpdate,
    PublicSiteSettings, ContactInfo,
    EmailStatusResponse, EmailTestRequest,
)
from ...services.email_service import email_service
from ...services.init_data import WHITELIST_MIGRATED_KEY

router = APIRouter()


async def _invalidate_settings_cache():
    """清除站点设置缓存"""
    await cache_delete(CacheKeys.SETTINGS_PUBLIC)
    await cache_delete(CacheKeys.SETTINGS_ALL)


def _as_bool(raw: str | None, default: bool = True) -> bool:
    if raw is None:
        return default
    return str(raw).strip().lower() not in ("false", "0", "no", "off")


@router.get("/public", response_model=PublicSiteSettings)
async def get_public_settings(
    db: AsyncSession = Depends(get_db)
):
    """
    获取公开配置（联系方式、注册开关等）
    优先从活跃超级管理员账号资料获取（users 表），无记录时兜底 admins 表与配置表
    """
    cached = await cache_get(CacheKeys.SETTINGS_PUBLIC)
    if cached:
        return cached

    # 获取站点配置
    result = await db.execute(select(SiteSetting))
    settings_list = result.scalars().all()
    settings_dict = {s.key: s.value for s in settings_list}

    # 获取活跃超级管理员资料（users 表优先，admins 表兼容兜底）
    super_user = (
        await db.execute(
            select(User)
            .where(User.role == "super_admin", User.status == "active")
            .order_by(User.id)
        )
    ).scalars().first()
    legacy_admin = (
        await db.execute(select(Admin).where(Admin.role == "super_admin").order_by(Admin.id))
    ).scalars().first()
    owner = super_user or legacy_admin

    resp = PublicSiteSettings(
        site_title=settings_dict.get("site_title") or "DevLog",
        site_description=settings_dict.get("site_description") or "",
        admin_avatar=(owner.avatar_url if owner and owner.avatar_url else settings_dict.get("admin_avatar", "")) or "",
        admin_bio=(owner.bio if owner and owner.bio else settings_dict.get("admin_bio", "")) or "",
        contact=ContactInfo(
            email=(owner.email if owner and owner.email else settings_dict.get("contact_email")),
            wechat=(owner.wechat if owner and owner.wechat else settings_dict.get("contact_wechat")),
            github=(owner.github if owner and owner.github else settings_dict.get("contact_github")),
            qq=(owner.qq if owner and owner.qq else settings_dict.get("contact_qq")),
            bilibili=(owner.bilibili if owner and owner.bilibili else settings_dict.get("contact_bilibili")),
        ),
        registration_enabled=_as_bool(settings_dict.get("user_registration_enabled"), True),
        email_verification_required=_as_bool(settings_dict.get("email_verification_required"), True),
    )
    await cache_set(CacheKeys.SETTINGS_PUBLIC, resp.model_dump(), ttl=600)
    return resp


@router.get("", response_model=List[SiteSettingResponse])
async def get_all_settings(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_super_admin)
):
    """
    获取所有配置（超级管理员）
    """
    cached = await cache_get(CacheKeys.SETTINGS_ALL)
    if cached:
        return cached

    result = await db.execute(
        select(SiteSetting)
        .where(SiteSetting.key != WHITELIST_MIGRATED_KEY)
        .order_by(SiteSetting.key)
    )
    settings = result.scalars().all()

    resp = [SiteSettingResponse.model_validate(s).model_dump() for s in settings]
    await cache_set(CacheKeys.SETTINGS_ALL, resp, ttl=300)
    return resp


@router.get("/email/status", response_model=EmailStatusResponse)
async def get_email_status(
    admin: User = Depends(get_super_admin)
):
    """获取当前运行容器 SMTP 配置状态（不含密钥，仅超级管理员）"""
    return email_service.get_status_summary()


@router.post("/email/test")
async def test_email_delivery(
    data: EmailTestRequest,
    admin: User = Depends(get_super_admin)
):
    """发送测试邮件验证 SMTP 通道连通性（仅超级管理员）"""
    ok, err = await asyncio.to_thread(email_service.send_test_email, str(data.to_email))
    if not ok:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"测试邮件发送失败：{err or '请检查容器 SMTP_* 环境变量及网络连通性'}",
        )
    return {"message": f"测试邮件已发送至 {data.to_email}，请查收（如未见请检查垃圾箱）"}


# ⚠️ /batch 必须在 /{key} 之前注册，否则 "batch" 会被当成 {key} 参数匹配
@router.put("/batch")
async def update_settings_batch(
    settings_data: Dict[str, str] = Body(...),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_super_admin)
):
    """
    批量更新配置（超级管理员）
    """
    updated_keys: List[str] = []
    for key, value in settings_data.items():
        if key == WHITELIST_MIGRATED_KEY:
            continue
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
        updated_keys.append(key)

    await db.commit()

    await _invalidate_settings_cache()
    return {"message": "批量更新成功", "updated_keys": updated_keys}


@router.put("/{key}")
async def update_setting(
    key: str,
    setting_data: SiteSettingUpdate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_super_admin)
):
    """
    更新配置项（超级管理员）
    """
    if key == WHITELIST_MIGRATED_KEY:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="内部迁移标记不允许修改")

    result = await db.execute(
        select(SiteSetting).where(SiteSetting.key == key)
    )
    setting = result.scalar_one_or_none()

    if not setting:
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

