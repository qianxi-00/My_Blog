"""
文章 API
"""

from typing import List, Optional
from datetime import datetime
import asyncio
import hashlib

from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File, BackgroundTasks, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from sqlalchemy.orm import selectinload

from ...core.database import get_db
from ...core.deps import get_current_admin, get_current_admin_optional
from ...core.config import settings
from ...core.redis import cache_get, cache_set, cache_delete, cache_delete_pattern, CacheKeys
from ...models.admin import Admin
from ...models.article import Article, Tag, ArticleTag, ArticleLike
from ...models.subscriber import Subscriber
from ...schemas.article import (
    ArticleCreate, ArticleUpdate, ArticlePublish,
    ArticleResponse, ArticleListResponse, TagResponse,
    ArchiveGroup, ArchiveItem, CategoryCount,
    SummaryGenerateRequest, SummaryGenerateResponse,
    ArticleSeriesItem
)
from ...schemas.common import PaginatedResponse
from ...services.markdown_service import parse_markdown, extract_frontmatter, estimate_read_time
from ...services.email_service import email_service
from ...services.openai_service import OpenAIService
from ...core.prompt import SYSTEM_PROMPT_ARTICLE_SUMMARY

router = APIRouter()


async def _invalidate_article_caches(article_id: int = None):
    """清除文章相关缓存"""
    await cache_delete_pattern("articles:list:*")
    await cache_delete_pattern("articles:series:*")
    await cache_delete(CacheKeys.ARTICLES_TAGS)
    await cache_delete(CacheKeys.ARTICLES_CATEGORIES)
    await cache_delete(CacheKeys.ARTICLES_ARCHIVES)
    if article_id:
        await cache_delete(CacheKeys.article_detail(article_id))


def get_user_identifier(request: Request) -> str:
    """获取用户唯一标识（IP + User-Agent 的 hash）"""
    ip = request.client.host if request.client else "unknown"
    ua = request.headers.get("user-agent", "")
    raw = f"{ip}:{ua}"
    return hashlib.md5(raw.encode()).hexdigest()[:32]


@router.get("", response_model=PaginatedResponse[ArticleListResponse])
async def get_articles(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    category: Optional[str] = None,
    tag: Optional[str] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    search: Optional[str] = None,
    sort_by: Optional[str] = Query(None, description="排序方式: time(默认按时间), views(按浏览量), likes(按点赞量)"),
    sort_order: Optional[str] = Query(None, description="排序方向: desc(降序,默认), asc(升序)"),
    db: AsyncSession = Depends(get_db),
    admin: Optional[Admin] = Depends(get_current_admin_optional)
):
    """
    获取文章列表（分页）
    公开访问只能看到已发布的文章，管理员可以看到所有文章
    """
    # 仅对公开访问缓存
    cache_key = None
    if admin is None:
        cache_key = CacheKeys.articles_list(
            page=page, page_size=page_size, category=category,
            tag=tag, search=search, sort_by=sort_by, sort_order=sort_order
        )
        cached = await cache_get(cache_key)
        if cached:
            return cached

    query = select(Article).options(
        selectinload(Article.author),
        selectinload(Article.tags)
    )
    
    # 权限过滤：非管理员只能看已发布的文章
    if admin is None:
        query = query.where(Article.status == "published")
    elif status_filter:
        query = query.where(Article.status == status_filter)
    
    # 分类过滤
    if category:
        query = query.where(Article.category == category)
    
    # 标签过滤
    if tag:
        query = query.join(ArticleTag).join(Tag).where(Tag.name == tag)
    
    # 搜索
    if search:
        query = query.where(
            or_(
                Article.title.ilike(f"%{search}%"),
                Article.summary.ilike(f"%{search}%")
            )
        )
    
    # 排序
    is_asc = sort_order == "asc"
    if sort_by == "views":
        query = query.order_by(Article.view_count.asc() if is_asc else Article.view_count.desc())
    elif sort_by == "likes":
        query = query.order_by(Article.like_count.asc() if is_asc else Article.like_count.desc())
    else:
        # 默认按发布时间/创建时间
        if is_asc:
            query = query.order_by(Article.published_at.asc(), Article.created_at.asc())
        else:
            query = query.order_by(Article.published_at.desc(), Article.created_at.desc())
    
    # 统计总数
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0
    
    # 分页
    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size)
    
    result = await db.execute(query)
    articles = result.scalars().all()
    
    resp = PaginatedResponse(
        data=[ArticleListResponse.model_validate(a) for a in articles],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=(total + page_size - 1) // page_size
    )
    if cache_key:
        await cache_set(cache_key, resp.model_dump(), ttl=120)
    return resp


@router.get("/tags", response_model=List[TagResponse])
async def get_tags(
    db: AsyncSession = Depends(get_db)
):
    """
    获取所有标签（仅返回至少有一篇已发布文章的标签）
    """
    cached = await cache_get(CacheKeys.ARTICLES_TAGS)
    if cached:
        return cached

    # NOTE: 使用纯 ORM 查询过滤掉没有已发布文章的标签
    from sqlalchemy import column, table
    article_tags = table("article_tags", column("article_id"), column("tag_id"))
    
    subquery = (
        select(article_tags.c.tag_id)
        .join(Article, Article.id == article_tags.c.article_id)
        .where(Article.status == "published")
        .distinct()
    )
    
    result = await db.execute(
        select(Tag).where(Tag.id.in_(subquery)).order_by(Tag.name)
    )
    tags = result.scalars().all()
    resp = [TagResponse.model_validate(t).model_dump() for t in tags]
    await cache_set(CacheKeys.ARTICLES_TAGS, resp, ttl=300)
    return resp


@router.get("/categories", response_model=List[CategoryCount])
async def get_categories(
    db: AsyncSession = Depends(get_db)
):
    """
    获取所有分类及文章数
    """
    cached = await cache_get(CacheKeys.ARTICLES_CATEGORIES)
    if cached:
        return cached

    result = await db.execute(
        select(Article.category, func.count(Article.id))
        .where(Article.status == "published")
        .where(Article.category.isnot(None))
        .group_by(Article.category)
    )
    categories = result.all()
    resp = [CategoryCount(category=c[0], count=c[1]).model_dump() for c in categories]
    await cache_set(CacheKeys.ARTICLES_CATEGORIES, resp, ttl=300)
    return resp


@router.get("/archives", response_model=List[ArchiveGroup])
async def get_archives(
    db: AsyncSession = Depends(get_db)
):
    """
    获取归档数据（按年月分组）
    """
    cached = await cache_get(CacheKeys.ARTICLES_ARCHIVES)
    if cached:
        return cached

    result = await db.execute(
        select(Article)
        .where(Article.status == "published")
        .order_by(Article.published_at.desc())
    )
    articles = result.scalars().all()
    
    # 按年月分组
    archives_dict = {}
    for article in articles:
        if article.published_at:
            year = article.published_at.year
            month = article.published_at.month
            key = (year, month)
            
            if key not in archives_dict:
                archives_dict[key] = []
            
            archives_dict[key].append(ArchiveItem(
                id=article.id,
                title=article.title,
                slug=article.slug,
                published_at=article.published_at,
                category=article.category
            ))
    
    resp = [
        ArchiveGroup(year=key[0], month=key[1], articles=items).model_dump()
        for key, items in sorted(archives_dict.items(), reverse=True)
    ]
    await cache_set(CacheKeys.ARTICLES_ARCHIVES, resp, ttl=600)
    return resp


@router.get("/series/{category}", response_model=List[ArticleSeriesItem])
async def get_series_articles(
    category: str,
    db: AsyncSession = Depends(get_db)
):
    """
    获取指定分类下的系列文章列表
    """
    cache_key = f"articles:series:{category}"
    cached = await cache_get(cache_key)
    if cached:
        return cached

    result = await db.execute(
        select(Article.id, Article.title, Article.slug, Article.published_at, Article.category)
        .where(Article.status == "published")
        .where(Article.category == category)
        .order_by(Article.published_at.asc())
    )
    articles = result.all()
    
    resp = [
        ArticleSeriesItem(
            id=a.id,
            title=a.title,
            slug=a.slug,
            published_at=a.published_at,
            category=a.category
        ).model_dump()
        for a in articles
    ]
    
    await cache_set(cache_key, resp, ttl=600)
    return resp


@router.get("/{article_id}", response_model=ArticleResponse)
async def get_article(
    article_id: int,
    db: AsyncSession = Depends(get_db),
    admin: Optional[Admin] = Depends(get_current_admin_optional)
):
    """
    获取文章详情
    """
    result = await db.execute(
        select(Article)
        .options(selectinload(Article.author), selectinload(Article.tags))
        .where(Article.id == article_id)
    )
    article = result.scalar_one_or_none()
    
    if not article:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="文章不存在"
        )
    
    # 非管理员只能查看已发布的文章
    if admin is None and article.status != "published":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="文章不存在"
        )
    
    # 增加浏览次数
    if article.status == "published":
        article.view_count += 1
        await db.commit()
        await db.refresh(article)
    
    return ArticleResponse.model_validate(article)


@router.post("/{article_id}/like")
async def like_article(
    article_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """点赞文章"""
    # 检查文章是否存在且已发布
    result = await db.execute(
        select(Article).where(Article.id == article_id).where(Article.status == "published")
    )
    article = result.scalar_one_or_none()
    
    if not article:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="文章不存在"
        )
    
    user_id = get_user_identifier(request)
    
    # 检查是否已经点赞
    result = await db.execute(
        select(ArticleLike)
        .where(ArticleLike.article_id == article_id)
        .where(ArticleLike.user_identifier == user_id)
    )
    existing_like = result.scalar_one_or_none()
    
    if existing_like:
        # 取消点赞
        await db.delete(existing_like)
        article.like_count = max(0, article.like_count - 1)
        await db.commit()
        return {"message": "已取消点赞", "like_count": article.like_count, "liked": False}
    else:
        # 添加点赞
        like = ArticleLike(article_id=article_id, user_identifier=user_id)
        db.add(like)
        article.like_count += 1
        await db.commit()
        return {"message": "点赞成功", "like_count": article.like_count, "liked": True}


@router.get("/{article_id}/like-status")
async def get_article_like_status(
    article_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """获取文章点赞状态"""
    user_id = get_user_identifier(request)
    
    result = await db.execute(
        select(ArticleLike)
        .where(ArticleLike.article_id == article_id)
        .where(ArticleLike.user_identifier == user_id)
    )
    existing_like = result.scalar_one_or_none()
    
    # 获取当前点赞数
    result = await db.execute(
        select(Article.like_count).where(Article.id == article_id)
    )
    like_count = result.scalar() or 0
    
    return {"liked": existing_like is not None, "like_count": like_count}


@router.post("", response_model=ArticleResponse)
async def create_article(
    article_data: ArticleCreate,
    db: AsyncSession = Depends(get_db),
    admin: Admin = Depends(get_current_admin)
):
    """
    创建文章
    """
    # 解析 Markdown
    content_html, toc_html = parse_markdown(article_data.content_md)
    
    # 计算阅读时间（使用梯队式计算）
    read_time = estimate_read_time(article_data.content_md)
    
    # 创建文章
    article = Article(
        title=article_data.title,
        summary=article_data.summary,
        content_md=article_data.content_md,
        content_html=content_html,
        toc_html=toc_html,
        cover_image=article_data.cover_image,
        category=article_data.category,
        author_id=admin.id,
        status=article_data.status,
        is_pinned=article_data.is_pinned,
        scheduled_at=article_data.scheduled_at,
        read_time_minutes=read_time
    )
    
    # 如果直接发布
    if article_data.status == "published":
        article.published_at = datetime.now()
    
    db.add(article)
    await db.flush()  # 获取 article.id
    
    # 处理标签
    # NOTE: 必须先预加载 tags 关系，否则在异步环境中访问 article.tags 会触发懒加载
    # 导致 MissingGreenlet 错误 (https://sqlalche.me/e/20/xd2s)
    if article_data.tags:
        # 重新查询文章并预加载 tags 关系（此时 tags 为空列表）
        result = await db.execute(
            select(Article)
            .options(selectinload(Article.tags))
            .where(Article.id == article.id)
        )
        article = result.scalar_one()
        
        for tag_name in article_data.tags:
            # 查找或创建标签
            result = await db.execute(select(Tag).where(Tag.name == tag_name))
            tag = result.scalar_one_or_none()
            
            if not tag:
                tag = Tag(name=tag_name)
                db.add(tag)
                await db.flush()
            
            article.tags.append(tag)
    
    await db.commit()
    await db.refresh(article)
    
    # 重新加载关联
    result = await db.execute(
        select(Article)
        .options(selectinload(Article.author), selectinload(Article.tags))
        .where(Article.id == article.id)
    )
    article = result.scalar_one()
    
    await _invalidate_article_caches(article.id)
    return ArticleResponse.model_validate(article)


@router.put("/{article_id}", response_model=ArticleResponse)
async def update_article(
    article_id: int,
    article_data: ArticleUpdate,
    db: AsyncSession = Depends(get_db),
    admin: Admin = Depends(get_current_admin)
):
    """
    更新文章（作者或超级管理员）
    """
    result = await db.execute(
        select(Article)
        .options(selectinload(Article.tags))
        .where(Article.id == article_id)
    )
    article = result.scalar_one_or_none()
    
    if not article:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="文章不存在"
        )
    
    # 权限检查
    if admin.role != "super_admin" and article.author_id != admin.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="权限不足"
        )
    
    # 更新字段
    update_data = article_data.model_dump(exclude_unset=True)
    
    # 处理 Markdown 更新
    if "content_md" in update_data:
        content_html, toc_html = parse_markdown(update_data["content_md"])
        article.content_html = content_html
        article.toc_html = toc_html
        article.read_time_minutes = estimate_read_time(update_data["content_md"])
    
    # 处理标签
    if "tags" in update_data:
        # 清除现有标签
        article.tags.clear()
        
        # 添加新标签
        for tag_name in update_data.pop("tags"):
            result = await db.execute(select(Tag).where(Tag.name == tag_name))
            tag = result.scalar_one_or_none()
            
            if not tag:
                tag = Tag(name=tag_name)
                db.add(tag)
                await db.flush()
            
            article.tags.append(tag)
    
    # 更新其他字段
    for field, value in update_data.items():
        setattr(article, field, value)
    
    await db.commit()
    await db.refresh(article)
    
    # 重新加载关联
    result = await db.execute(
        select(Article)
        .options(selectinload(Article.author), selectinload(Article.tags))
        .where(Article.id == article.id)
    )
    article = result.scalar_one()
    
    await _invalidate_article_caches(article.id)
    return ArticleResponse.model_validate(article)


@router.delete("/{article_id}")
async def delete_article(
    article_id: int,
    db: AsyncSession = Depends(get_db),
    admin: Admin = Depends(get_current_admin)
):
    """
    删除文章（作者或超级管理员）
    """
    result = await db.execute(select(Article).where(Article.id == article_id))
    article = result.scalar_one_or_none()
    
    if not article:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="文章不存在"
        )
    
    # 权限检查
    if admin.role != "super_admin" and article.author_id != admin.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="权限不足"
        )
    
    await db.delete(article)
    await db.commit()
    
    await _invalidate_article_caches(article_id)
    return {"message": "删除成功"}


@router.post("/{article_id}/publish", response_model=ArticleResponse)
async def publish_article(
    article_id: int,
    publish_data: ArticlePublish,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    admin: Admin = Depends(get_current_admin)
):
    """
    发布文章（作者或超级管理员）
    """
    result = await db.execute(
        select(Article)
        .options(selectinload(Article.author), selectinload(Article.tags))
        .where(Article.id == article_id)
    )
    article = result.scalar_one_or_none()
    
    if not article:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="文章不存在"
        )
    
    # 权限检查
    if admin.role != "super_admin" and article.author_id != admin.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="权限不足"
        )
    
    # 检查是否是首次发布（用于决定是否发送通知）
    is_first_publish = article.status != "published"
    
    if publish_data.scheduled_at:
        # 定时发布
        article.status = "scheduled"
        article.scheduled_at = publish_data.scheduled_at
    else:
        # 立即发布
        article.status = "published"
        article.published_at = datetime.now()
        
        # 首次发布时，向订阅者发送邮件通知
        if is_first_publish and email_service.is_configured():
            # 获取所有活跃且未被冻结的订阅者
            subscribers_result = await db.execute(
                select(Subscriber).where(
                    Subscriber.is_active == True,
                    Subscriber.is_frozen == False
                )
            )
            subscribers = subscribers_result.scalars().all()
            
            if subscribers:
                # 构建文章 URL
                article_url = f"{settings.SITE_URL}/#/articles/{article.id}"
                article_summary = article.summary or (article.content_md[:200] + "..." if article.content_md else "")
                
                # 使用后台任务异步发送邮件
                for subscriber in subscribers:
                    background_tasks.add_task(
                        email_service.send_new_article_notification,
                        subscriber.email,
                        subscriber.unsubscribe_token,
                        article.title,
                        article_summary,
                        article_url
                    )
                print(f"📧 已安排向 {len(subscribers)} 位订阅者发送新文章通知")
    
    await db.commit()
    await db.refresh(article)
    
    await _invalidate_article_caches(article.id)
    return ArticleResponse.model_validate(article)


@router.post("/upload-markdown", response_model=ArticleResponse)
async def upload_markdown(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    admin: Admin = Depends(get_current_admin)
):
    """
    上传 Markdown 文件创建文章
    """
    if not file.filename.endswith(".md"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="请上传 .md 文件"
        )
    
    # 读取文件内容
    content = await file.read()
    content_md = content.decode("utf-8")
    
    # 提取 frontmatter
    frontmatter, body = extract_frontmatter(content_md)
    
    # 获取分类和标题，用于构建保存路径
    category = frontmatter.get("category")
    title = frontmatter.get("title", file.filename.replace(".md", ""))
    
    # ---------------------------------------------------------
    # 新增：保存原始 Markdown 文件到本地 Articles 目录
    # ---------------------------------------------------------
    import os
    import re
    
    # 1. 构建目录路径
    # 如果有分类，存入 Articles/{Category}/，否则存入 Articles/Uncategorized/
    save_dir_name = category if category else "Uncategorized"
    # 清理目录名非法字符
    save_dir_name = re.sub(r'[\\/*?:"<>|]', "", save_dir_name).strip()
    if not save_dir_name:
        save_dir_name = "Uncategorized"
        
    # APP所在路径 `f:\My_Blog\backend\app\api\v1`
    # 项目根目录 `f:\My_Blog` -> 向后退 4 层
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
    articles_dir = os.path.join(base_dir, "Articles", save_dir_name)
    
    # 确保目录存在
    os.makedirs(articles_dir, exist_ok=True)
    
    # 2. 构建文件名
    # 清理文件名非法字符
    safe_title = re.sub(r'[\\/*?:"<>|]', "", title).strip()
    if not safe_title:
        safe_title = "Untitled"
    file_name = f"{safe_title}.md"
    file_path = os.path.join(articles_dir, file_name)
    
    # 3. 写入文件（覆盖模式，确保是最新上传的原始内容）
    try:
        with open(file_path, "wb") as f:
            f.write(content) # 直接写入原始二进制内容，保持完全一致
        print(f"✅ 已保存原文归档: {file_path}")
    except Exception as e:
        print(f"❌ 保存原文归档失败: {e}")
        # 仅打印错误，不阻断文章创建流程
        
    # ---------------------------------------------------------
    
    # 解析 Markdown
    content_html, toc_html = parse_markdown(body)
    
    # 创建文章
    article = Article(
        title=title,
        summary=frontmatter.get("summary") or frontmatter.get("description"),
        content_md=body,
        content_html=content_html,
        toc_html=toc_html,
        cover_image=frontmatter.get("cover") or frontmatter.get("cover_image"),
        category=category,
        author_id=admin.id,
        status="draft",
        read_time_minutes=estimate_read_time(body)
    )
    
    db.add(article)
    await db.flush()
    
    # 处理标签
    tags = frontmatter.get("tags", [])
    if isinstance(tags, str):
        tags = [t.strip() for t in tags.split(",")]
    
    for tag_name in tags:
        if not tag_name:
            continue
        result = await db.execute(select(Tag).where(Tag.name == tag_name))
        tag = result.scalar_one_or_none()
        
        if not tag:
            tag = Tag(name=tag_name)
            db.add(tag)
            await db.flush()
        
        article.tags.append(tag)
    
    await db.commit()
    await db.refresh(article)
    
    # 重新加载关联
    result = await db.execute(
        select(Article)
        .options(selectinload(Article.author), selectinload(Article.tags))
        .where(Article.id == article.id)
    )
    article = result.scalar_one()
    
    await _invalidate_article_caches(article.id)
    return ArticleResponse.model_validate(article)


@router.post("/generate-summary", response_model=SummaryGenerateResponse)
async def generate_summary(
    request: SummaryGenerateRequest,
    admin: Admin = Depends(get_current_admin)
):
    """
    使用 LLM 生成文章摘要
    
    需要管理员权限
    """
    # 预处理内容：移除图片、链接、代码块等干扰因素，有助于 LLM 更好地把握核心内容
    import re
    content = request.content_md
    
    # 1. 移除代码块 (fenced code blocks)
    content = re.sub(r'```[\s\S]*?```', '', content)
    # 2. 移除行内代码
    content = re.sub(r'`[^`]+`', '', content)
    # 3. 移除 Markdown 图片
    content = re.sub(r'!\[.*?\]\(.*?\)', '', content)
    # 4. 移除 Markdown 链接（只保留链接文本）
    content = re.sub(r'\[(.*?)\]\(.*?\)', r'\1', content)
    # 5. 移除 HTML 标签
    content = re.sub(r'<[^>]+>', '', content)
    # 6. 合并多余换行
    content = re.sub(r'\n{2,}', '\n\n', content).strip()
    
    # 构建 prompt
    system_prompt = SYSTEM_PROMPT_ARTICLE_SUMMARY
    
    # 调用 OpenAI API
    openai_service = OpenAIService()
    
    try:
        summary = await openai_service.chat(
            messages=[{"role": "user", "content": f"请为以下文章内容生成摘要：\n\n{content}"}],
            system_prompt=system_prompt,
            max_tokens=150,  # 减少 token 数以限制输出长度
            temperature=0.5,  # 适中的温度，平衡创意与准确度
            model=settings.ZHAIYAO_MODEL  # 使用专用模型
        )
        
        # 清理可能的多余内容
        summary = summary.strip()
        # 移除可能的首尾引号
        if summary.startswith('"') and summary.endswith('"'):
            summary = summary[1:-1]
        
        return SummaryGenerateResponse(summary=summary)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"摘要生成失败: {str(e)}"
        )
        return SummaryGenerateResponse(summary=summary)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"摘要生成失败: {str(e)}"
        )


@router.post("/fix-read-time", dependencies=[Depends(get_current_admin)])
async def fix_read_time(db: AsyncSession = Depends(get_db)):
    """
    [维护] 重新计算所有文章的阅读时间
    """
    result = await db.execute(select(Article))
    articles = result.scalars().all()
    
    count = 0
    updated_titles = []
    
    for article in articles:
        if article.content_md:
            old_time = article.read_time_minutes
            new_time = estimate_read_time(article.content_md)
            
            if old_time != new_time:
                article.read_time_minutes = new_time
                count += 1
                updated_titles.append(f"{article.title} ({old_time}->{new_time})")
    
    if count > 0:
        await db.commit()
    
    return {
        "message": f"已更新 {count} 篇文章的阅读时间",
        "updated": updated_titles
    }
