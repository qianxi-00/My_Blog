"""
站内通知服务
"""

from __future__ import annotations

from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from ..models.notification import Notification
from ..models.user import User


async def create_notification(
    db: AsyncSession,
    *,
    user_id: Optional[int],
    type: str,
    title: str,
    snippet: Optional[str] = None,
    link: Optional[str] = None,
    actor: Optional[User] = None,
    actor_name: Optional[str] = None,
    actor_avatar: Optional[str] = None,
    target_type: Optional[str] = None,
    target_id: Optional[int] = None,
) -> Optional[Notification]:
    """
    创建站内通知记录（不自动 commit，跟随调用方事务；自己触发自己的动作不发通知）。
    """
    if not user_id:
        return None
    if actor is not None and actor.id == user_id:
        return None

    resolved_actor_name = actor_name or (
        (actor.display_name or actor.username) if actor is not None else None
    )
    resolved_actor_avatar = actor_avatar or (actor.avatar_url if actor is not None else None)
    clean_snippet = snippet.strip()[:280] if snippet else None

    item = Notification(
        user_id=user_id,
        actor_id=actor.id if actor is not None else None,
        actor_name=resolved_actor_name[:100] if resolved_actor_name else None,
        actor_avatar=resolved_actor_avatar[:500] if resolved_actor_avatar else None,
        type=type,
        target_type=target_type,
        target_id=target_id,
        title=title.strip()[:200],
        snippet=clean_snippet,
        link=link[:500] if link else None,
        is_read=False,
    )
    db.add(item)
    return item
