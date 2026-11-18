"""
初始化数据服务
创建初始超级管理员、站点配置与默认社区版块（含生产环境无条件幂等引导）
"""

from sqlalchemy import select

from ..core.config import settings
from ..core.database import async_session_maker
from ..core.redis import CacheKeys, cache_delete
from ..core.security import get_password_hash
from ..models.forum import ForumCategory
from ..models.settings import DEFAULT_SETTINGS, LEGACY_DOMAIN_WHITELIST, SiteSetting
from ..models.user import User

DEFAULT_FORUM_CATEGORIES = [
    {
        "name": "问千禧",
        "slug": "ask-qianxi",
        "description": "向博主提问、反馈博客建议或承接看板娘转人工的问题求助",
        "icon": "MessageCircleQuestion",
        "color": "sky",
        "is_default": True,
        "sort_order": 1,
    },
    {
        "name": "技术讨论",
        "slug": "tech-talk",
        "description": "分享工程架构、AI 应用实践、开发工具链与深度阅读体会",
        "icon": "Code2",
        "color": "indigo",
        "is_default": False,
        "sort_order": 2,
    },
    {
        "name": "问题求助",
        "slug": "help-wanted",
        "description": "遇到报错、环境配置难题或代码疑惑？贴出上下文一起排查",
        "icon": "LifeBuoy",
        "color": "amber",
        "is_default": False,
        "sort_order": 3,
    },
    {
        "name": "分享交流",
        "slug": "showcase",
        "description": "展示个人作品、效率工作流、学习笔记或日常随想",
        "icon": "Sparkles",
        "color": "emerald",
        "is_default": False,
        "sort_order": 4,
    },
]

WHITELIST_MIGRATED_KEY = "email_domain_whitelist_migrated_v1"


async def init_super_admin():
    """
    初始化超级管理员（users 表，2026-09-24 用户系统改造后管理员与用户同表）
    如果不存在则创建
    """
    async with async_session_maker() as session:
        result = await session.execute(
            select(User).where(User.username == settings.SUPER_ADMIN_USERNAME)
        )
        existing_admin = result.scalar_one_or_none()

        if existing_admin:
            print(f"✅ 超级管理员 '{settings.SUPER_ADMIN_USERNAME}' 已存在")
            return

        admin = User(
            username=settings.SUPER_ADMIN_USERNAME,
            password_hash=await get_password_hash(settings.SUPER_ADMIN_PASSWORD),
            display_name="超级管理员",
            role="super_admin",
            status="active",
            has_password=True,
            username_customized=True,
        )

        session.add(admin)
        await session.commit()
        print(f"✅ 已创建超级管理员 '{settings.SUPER_ADMIN_USERNAME}'")


async def init_site_settings():
    """
    初始化站点配置（缺失项补齐）
    """
    await ensure_default_data()


async def ensure_default_data():
    """
    生产/开发通用的无条件幂等初始化：
    1. 补齐 DEFAULT_SETTINGS 中新增的站点配置键
    2. 一次性迁移历史写死的 6 域名白名单，释放任意常见合法邮箱注册能力
    3. 幂等种子化 4 个预设社区版块（含默认「问千禧」）
    """
    changed_settings = False

    async with async_session_maker() as session:
        # 1. 补齐 DEFAULT_SETTINGS
        for setting_data in DEFAULT_SETTINGS:
            existing_setting = (
                await session.execute(
                    select(SiteSetting).where(SiteSetting.key == setting_data["key"])
                )
            ).scalar_one_or_none()
            if not existing_setting:
                session.add(
                    SiteSetting(
                        key=setting_data["key"],
                        value=setting_data["value"],
                        type=setting_data["type"],
                        description=setting_data["description"],
                    )
                )
                changed_settings = True

        await session.flush()

        # 2. 一次性清理旧版默认 6 域名白名单
        migrated_flag = (
            await session.execute(
                select(SiteSetting).where(SiteSetting.key == WHITELIST_MIGRATED_KEY)
            )
        ).scalar_one_or_none()

        if migrated_flag is None or str(migrated_flag.value).strip().lower() != "true":
            whitelist_row = (
                await session.execute(
                    select(SiteSetting).where(SiteSetting.key == "email_domain_whitelist")
                )
            ).scalar_one_or_none()
            if whitelist_row is not None and whitelist_row.value is not None:
                normalized_cur = ",".join(
                    sorted(d.strip().lower() for d in whitelist_row.value.split(",") if d.strip())
                )
                normalized_legacy = ",".join(
                    sorted(d.strip().lower() for d in LEGACY_DOMAIN_WHITELIST.split(",") if d.strip())
                )
                if normalized_cur == normalized_legacy:
                    whitelist_row.value = ""
                    changed_settings = True

            if migrated_flag is None:
                session.add(
                    SiteSetting(
                        key=WHITELIST_MIGRATED_KEY,
                        value="true",
                        type="boolean",
                        description="内部标记：旧版 6 域名白名单已完成一次放开迁移",
                    )
                )
            else:
                migrated_flag.value = "true"

        # 3. 幂等初始化默认社区版块
        has_any_default = bool(
            (
                await session.execute(
                    select(ForumCategory.id).where(ForumCategory.is_default == True)
                )
            ).scalar_one_or_none()
        )

        for cat_data in DEFAULT_FORUM_CATEGORIES:
            existing_cat = (
                await session.execute(
                    select(ForumCategory).where(
                        (ForumCategory.slug == cat_data["slug"])
                        | (ForumCategory.name == cat_data["name"])
                    )
                )
            ).scalar_one_or_none()

            if existing_cat is None:
                should_default = bool(cat_data["is_default"] and not has_any_default)
                session.add(
                    ForumCategory(
                        name=cat_data["name"],
                        slug=cat_data["slug"],
                        description=cat_data["description"],
                        icon=cat_data["icon"],
                        color=cat_data["color"],
                        is_default=should_default,
                        sort_order=cat_data["sort_order"],
                        is_active=True,
                    )
                )
                if should_default:
                    has_any_default = True
            else:
                # 若是既有老版块缺扩展信息，温和补齐而不覆盖管理员主动改过的值
                if not existing_cat.slug:
                    existing_cat.slug = cat_data["slug"]
                if not existing_cat.description:
                    existing_cat.description = cat_data["description"]
                if not existing_cat.icon:
                    existing_cat.icon = cat_data["icon"]
                if not existing_cat.color:
                    existing_cat.color = cat_data["color"]
                if cat_data["is_default"] and not has_any_default:
                    existing_cat.is_default = True
                    has_any_default = True

        await session.commit()

    if changed_settings:
        await cache_delete(CacheKeys.SETTINGS_ALL)
        await cache_delete(CacheKeys.SETTINGS_PUBLIC)
    print("✅ 站点默认配置与社区版块检查完成")
