"""
订阅 API
"""

from typing import List

from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from ...core.database import get_db
from ...core.deps import get_current_admin
from ...models.admin import Admin
from ...models.subscriber import Subscriber
from ...schemas.subscriber import SubscribeRequest, SubscribeResponse, SubscriberResponse
from ...services.email_service import email_service

router = APIRouter()


@router.put("/subscribers/freeze-all")
async def freeze_all_subscribers(
    frozen: bool,
    db: AsyncSession = Depends(get_db),
    admin: Admin = Depends(get_current_admin)
):
    """
    批量冻结/解冻所有活跃订阅者（管理员）
    
    - frozen=True: 冻结所有活跃订阅者
    - frozen=False: 解冻所有已冻结的订阅者
    """
    from datetime import datetime
    
    if frozen:
        # 冻结所有活跃且未冻结的订阅者
        result = await db.execute(
            select(Subscriber).where(
                Subscriber.is_active == True,
                Subscriber.is_frozen == False
            )
        )
    else:
        # 解冻所有已冻结的订阅者
        result = await db.execute(
            select(Subscriber).where(Subscriber.is_frozen == True)
        )
    
    subscribers = result.scalars().all()
    count = len(subscribers)
    
    for subscriber in subscribers:
        subscriber.is_frozen = frozen
        subscriber.frozen_at = datetime.now() if frozen else None
    
    await db.commit()
    
    action = "冻结" if frozen else "解冻"
    return {"message": f"已{action} {count} 个订阅者", "count": count}


@router.post("/subscribe", response_model=SubscribeResponse)
async def subscribe(
    request: SubscribeRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db)
):
    """
    订阅邮件通知
    """
    email = request.email.lower().strip()
    
    # 检查是否已订阅
    result = await db.execute(
        select(Subscriber).where(Subscriber.email == email)
    )
    existing = result.scalar_one_or_none()
    
    if existing:
        if existing.is_active:
            return SubscribeResponse(
                success=True,
                message="你已经订阅过了，感谢你的关注！"
            )
        else:
            # 重新激活订阅
            existing.is_active = True
            existing.unsubscribed_at = None
            await db.commit()
            
            # 后台发送欢迎邮件
            background_tasks.add_task(
                email_service.send_welcome_email,
                email,
                existing.unsubscribe_token
            )
            
            return SubscribeResponse(
                success=True,
                message="欢迎回来！已重新激活订阅。"
            )
    
    # 创建新订阅
    subscriber = Subscriber(email=email)
    db.add(subscriber)
    await db.commit()
    await db.refresh(subscriber)
    
    # 后台发送欢迎邮件
    background_tasks.add_task(
        email_service.send_welcome_email,
        email,
        subscriber.unsubscribe_token
    )
    
    return SubscribeResponse(
        success=True,
        message="订阅成功！确认邮件已发送，请查收。"
    )


@router.get("/unsubscribe/{token}", response_model=SubscribeResponse)
async def unsubscribe(
    token: str,
    db: AsyncSession = Depends(get_db)
):
    """
    取消订阅
    """
    result = await db.execute(
        select(Subscriber).where(Subscriber.unsubscribe_token == token)
    )
    subscriber = result.scalar_one_or_none()
    
    if not subscriber:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="无效的取消订阅链接"
        )
    
    if not subscriber.is_active:
        return SubscribeResponse(
            success=True,
            message="你已经取消订阅了"
        )
    
    from datetime import datetime
    subscriber.is_active = False
    subscriber.unsubscribed_at = datetime.now()
    await db.commit()
    
    return SubscribeResponse(
        success=True,
        message="已成功取消订阅，期待与你再次相遇！"
    )


@router.get("/subscribers", response_model=List[SubscriberResponse])
async def get_subscribers(
    db: AsyncSession = Depends(get_db),
    admin: Admin = Depends(get_current_admin)
):
    """
    获取所有订阅者（管理员）
    """
    result = await db.execute(
        select(Subscriber).order_by(Subscriber.subscribed_at.desc())
    )
    subscribers = result.scalars().all()
    return [SubscriberResponse.model_validate(s) for s in subscribers]


@router.delete("/subscribers/{subscriber_id}")
async def delete_subscriber(
    subscriber_id: int,
    db: AsyncSession = Depends(get_db),
    admin: Admin = Depends(get_current_admin)
):
    """
    删除订阅者（管理员）
    """
    result = await db.execute(
        select(Subscriber).where(Subscriber.id == subscriber_id)
    )
    subscriber = result.scalar_one_or_none()
    
    if not subscriber:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="订阅者不存在"
        )
    
    await db.delete(subscriber)
    await db.commit()
    
    return {"message": "删除成功"}


@router.get("/subscribers/count")
async def get_subscriber_count(
    db: AsyncSession = Depends(get_db),
    admin: Admin = Depends(get_current_admin)
):
    """
    获取活跃订阅者数量（管理员）
    """
    result = await db.execute(
        select(func.count()).select_from(Subscriber).where(Subscriber.is_active == True)
    )
    count = result.scalar() or 0
    return {"count": count}


@router.put("/subscribers/{subscriber_id}/freeze", response_model=SubscriberResponse)
async def freeze_subscriber(
    subscriber_id: int,
    frozen: bool,
    db: AsyncSession = Depends(get_db),
    admin: Admin = Depends(get_current_admin)
):
    """
    冻结/解冻订阅者（管理员）
    
    冻结后的订阅者不会收到邮件通知
    """
    result = await db.execute(
        select(Subscriber).where(Subscriber.id == subscriber_id)
    )
    subscriber = result.scalar_one_or_none()
    
    if not subscriber:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="订阅者不存在"
        )
    
    from datetime import datetime
    subscriber.is_frozen = frozen
    subscriber.frozen_at = datetime.now() if frozen else None
    
    await db.commit()
    await db.refresh(subscriber)
    
    return SubscriberResponse.model_validate(subscriber)




