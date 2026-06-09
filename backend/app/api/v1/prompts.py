"""
Prompt API
"""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from ...core.database import get_db
from ...core.deps import get_current_admin, get_current_admin_optional
from ...models.admin import Admin
from ...models.prompt import Prompt
from ...schemas.prompt import (
    PromptCreate, PromptUserSubmit, PromptUpdate,
    PromptResponse, PromptListResponse
)
from ...schemas.common import PaginatedResponse

router = APIRouter()


@router.get("", response_model=PaginatedResponse[PromptListResponse])
async def get_prompts(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
    category: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    """
    获取 Prompt 列表（仅已审核）
    """
    query = select(Prompt).where(Prompt.status == "approved")
    
    # 分类过滤
    if category:
        query = query.where(Prompt.category == category)
    
    # 排序
    query = query.order_by(Prompt.use_count.desc(), Prompt.created_at.desc())
    
    # 统计总数
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0
    
    # 分页
    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size)
    
    result = await db.execute(query)
    prompts = result.scalars().all()
    
    return PaginatedResponse(
        data=[PromptListResponse.model_validate(p) for p in prompts],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=(total + page_size - 1) // page_size
    )


@router.get("/pending", response_model=PaginatedResponse[PromptResponse])
async def get_pending_prompts(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    admin: Admin = Depends(get_current_admin)
):
    """
    获取待审核 Prompt（管理员）
    """
    query = select(Prompt).options(selectinload(Prompt.author)).where(Prompt.status == "pending")
    
    # 统计总数
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0
    
    # 分页
    offset = (page - 1) * page_size
    query = query.order_by(Prompt.created_at.desc()).offset(offset).limit(page_size)
    
    result = await db.execute(query)
    prompts = result.scalars().all()
    
    return PaginatedResponse(
        data=[PromptResponse.model_validate(p) for p in prompts],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=(total + page_size - 1) // page_size
    )


@router.get("/{prompt_id}", response_model=PromptResponse)
async def get_prompt(
    prompt_id: int,
    db: AsyncSession = Depends(get_db)
):
    """
    获取 Prompt 详情
    """
    result = await db.execute(
        select(Prompt)
        .options(selectinload(Prompt.author))
        .where(Prompt.id == prompt_id)
    )
    prompt = result.scalar_one_or_none()
    
    if not prompt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Prompt 不存在"
        )
    
    return PromptResponse.model_validate(prompt)


@router.post("", response_model=PromptResponse)
async def create_prompt(
    prompt_data: PromptCreate,
    db: AsyncSession = Depends(get_db),
    admin: Admin = Depends(get_current_admin)
):
    """
    创建 Prompt（管理员，直接发布）
    """
    prompt = Prompt(
        title=prompt_data.title,
        description=prompt_data.description,
        content=prompt_data.content,
        category=prompt_data.category,
        author_id=admin.id,
        status="approved"  # 管理员创建直接通过
    )
    
    db.add(prompt)
    await db.commit()
    await db.refresh(prompt)
    
    # 重新加载关联
    result = await db.execute(
        select(Prompt)
        .options(selectinload(Prompt.author))
        .where(Prompt.id == prompt.id)
    )
    prompt = result.scalar_one()
    
    return PromptResponse.model_validate(prompt)


@router.post("/submit", response_model=PromptResponse)
async def submit_prompt(
    prompt_data: PromptUserSubmit,
    db: AsyncSession = Depends(get_db)
):
    """
    用户提交 Prompt（需审核）
    """
    prompt = Prompt(
        title=prompt_data.title,
        description=prompt_data.description,
        content=prompt_data.content,
        category=prompt_data.category,
        submitted_by=prompt_data.submitted_by,
        status="pending"
    )
    
    db.add(prompt)
    await db.commit()
    await db.refresh(prompt)
    
    return PromptResponse.model_validate(prompt)


@router.put("/{prompt_id}", response_model=PromptResponse)
async def update_prompt(
    prompt_id: int,
    prompt_data: PromptUpdate,
    db: AsyncSession = Depends(get_db),
    admin: Admin = Depends(get_current_admin)
):
    """
    更新 Prompt（作者或超级管理员）
    """
    result = await db.execute(
        select(Prompt)
        .options(selectinload(Prompt.author))
        .where(Prompt.id == prompt_id)
    )
    prompt = result.scalar_one_or_none()
    
    if not prompt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Prompt 不存在"
        )
    
    # 权限检查
    if admin.role != "super_admin" and prompt.author_id != admin.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="权限不足"
        )
    
    # 更新字段
    update_data = prompt_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(prompt, field, value)
    
    await db.commit()
    await db.refresh(prompt)
    
    return PromptResponse.model_validate(prompt)


@router.delete("/{prompt_id}")
async def delete_prompt(
    prompt_id: int,
    db: AsyncSession = Depends(get_db),
    admin: Admin = Depends(get_current_admin)
):
    """
    删除 Prompt（作者或超级管理员）
    """
    result = await db.execute(select(Prompt).where(Prompt.id == prompt_id))
    prompt = result.scalar_one_or_none()
    
    if not prompt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Prompt 不存在"
        )
    
    # 权限检查
    if admin.role != "super_admin" and prompt.author_id != admin.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="权限不足"
        )
    
    await db.delete(prompt)
    await db.commit()
    
    return {"message": "删除成功"}


@router.put("/{prompt_id}/approve")
async def approve_prompt(
    prompt_id: int,
    db: AsyncSession = Depends(get_db),
    admin: Admin = Depends(get_current_admin)
):
    """
    审核通过 Prompt（管理员）
    """
    result = await db.execute(select(Prompt).where(Prompt.id == prompt_id))
    prompt = result.scalar_one_or_none()
    
    if not prompt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Prompt 不存在"
        )
    
    prompt.status = "approved"
    await db.commit()
    
    return {"message": "审核通过"}


@router.put("/{prompt_id}/reject")
async def reject_prompt(
    prompt_id: int,
    db: AsyncSession = Depends(get_db),
    admin: Admin = Depends(get_current_admin)
):
    """
    拒绝 Prompt（管理员）
    """
    result = await db.execute(select(Prompt).where(Prompt.id == prompt_id))
    prompt = result.scalar_one_or_none()
    
    if not prompt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Prompt 不存在"
        )
    
    prompt.status = "rejected"
    await db.commit()
    
    return {"message": "已拒绝"}


@router.post("/{prompt_id}/use")
async def record_prompt_use(
    prompt_id: int,
    db: AsyncSession = Depends(get_db)
):
    """
    记录 Prompt 使用次数
    """
    result = await db.execute(select(Prompt).where(Prompt.id == prompt_id))
    prompt = result.scalar_one_or_none()
    
    if not prompt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Prompt 不存在"
        )
    
    prompt.use_count += 1
    await db.commit()
    
    return {"message": "已记录", "use_count": prompt.use_count}


@router.post("/{prompt_id}/like")
async def like_prompt(
    prompt_id: int,
    db: AsyncSession = Depends(get_db)
):
    """
    点赞 Prompt（公开访问）
    """
    result = await db.execute(select(Prompt).where(Prompt.id == prompt_id))
    prompt = result.scalar_one_or_none()
    
    if not prompt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Prompt 不存在"
        )
    
    prompt.like_count += 1
    await db.commit()
    
    return {"message": "点赞成功", "like_count": prompt.like_count}


@router.post("/{prompt_id}/unlike")
async def unlike_prompt(
    prompt_id: int,
    db: AsyncSession = Depends(get_db)
):
    """
    取消点赞 Prompt（公开访问）
    """
    result = await db.execute(select(Prompt).where(Prompt.id == prompt_id))
    prompt = result.scalar_one_or_none()
    
    if not prompt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Prompt 不存在"
        )
    
    if prompt.like_count > 0:
        prompt.like_count -= 1
        await db.commit()
    
    return {"message": "取消点赞成功", "like_count": prompt.like_count}
