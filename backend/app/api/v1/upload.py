"""
文件上传 API
"""

import os
import re
import uuid
import zipfile
import tempfile
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import aiofiles

from ...core.database import get_db
from ...core.config import settings
from ...core.deps import get_current_admin
from ...models.admin import Admin
from ...models.image import ArticleImage

router = APIRouter()

# 允许的图片类型
ALLOWED_IMAGE_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp"
}

# 图片扩展名映射
IMAGE_EXTENSIONS = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp"
}


def get_upload_dir() -> str:
    """获取上传目录"""
    upload_dir = os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
        "..",
        settings.UPLOAD_DIR,
        "images"
    )
    os.makedirs(upload_dir, exist_ok=True)
    return upload_dir


@router.post("/image")
async def upload_image(
    file: UploadFile = File(...),
    article_id: int = None,
    db: AsyncSession = Depends(get_db),
    admin: Admin = Depends(get_current_admin)
):
    """
    上传图片（管理员）
    """
    # 检查文件类型
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"不支持的文件类型：{file.content_type}"
        )
    
    # 检查文件大小
    content = await file.read()
    if len(content) > settings.max_upload_size_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"文件大小超过限制（最大 {settings.MAX_UPLOAD_SIZE_MB}MB）"
        )
    
    # 生成存储文件名
    ext = ALLOWED_IMAGE_TYPES[file.content_type]
    stored_name = f"{uuid.uuid4().hex}{ext}"
    
    # 保存文件
    upload_dir = get_upload_dir()
    file_path = os.path.join(upload_dir, stored_name)
    
    async with aiofiles.open(file_path, "wb") as f:
        await f.write(content)
    
    # 保存到数据库
    image = ArticleImage(
        article_id=article_id,
        filename=file.filename,
        stored_name=stored_name,
        file_path=f"/uploads/images/{stored_name}",
        file_size=len(content),
        mime_type=file.content_type,
        uploaded_by=admin.id
    )
    
    db.add(image)
    await db.commit()
    await db.refresh(image)
    
    return {
        "id": image.id,
        "url": image.file_path,
        "filename": image.filename,
        "size": image.file_size
    }


@router.get("/images")
async def get_images(
    db: AsyncSession = Depends(get_db),
    admin: Admin = Depends(get_current_admin)
):
    """
    获取图片列表（管理员）
    """
    result = await db.execute(
        select(ArticleImage)
        .order_by(ArticleImage.created_at.desc())
        .limit(100)
    )
    images = result.scalars().all()
    
    return [
        {
            "id": img.id,
            "url": img.file_path,
            "filename": img.filename,
            "size": img.file_size,
            "created_at": img.created_at
        }
        for img in images
    ]


@router.delete("/image/{image_id}")
async def delete_image(
    image_id: int,
    db: AsyncSession = Depends(get_db),
    admin: Admin = Depends(get_current_admin)
):
    """
    删除图片（管理员）
    """
    result = await db.execute(
        select(ArticleImage).where(ArticleImage.id == image_id)
    )
    image = result.scalar_one_or_none()
    
    if not image:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="图片不存在"
        )
    
    # 删除文件
    upload_dir = get_upload_dir()
    file_path = os.path.join(upload_dir, image.stored_name)
    if os.path.exists(file_path):
        os.remove(file_path)
    
    # 删除数据库记录
    await db.delete(image)
    await db.commit()
    
    return {"message": "删除成功"}


@router.post("/markdown")
async def upload_markdown(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    admin: Admin = Depends(get_current_admin)
):
    """
    上传 Markdown 文件，解析并返回内容
    """
    # 检查文件类型
    filename = file.filename or ""
    if not filename.lower().endswith('.md'):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="请上传 .md 格式的 Markdown 文件"
        )
    
    # 读取内容
    content = await file.read()
    try:
        markdown_content = content.decode('utf-8')
    except UnicodeDecodeError:
        try:
            markdown_content = content.decode('gbk')
        except UnicodeDecodeError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="无法解析文件编码，请使用 UTF-8 编码"
            )
    
    # 尝试从内容中提取标题（第一个 # 标题）
    title = ""
    lines = markdown_content.split('\n')
    for line in lines:
        if line.startswith('# '):
            title = line[2:].strip()
            break
    
    # 如果没有找到标题，使用文件名
    if not title:
        title = filename.rsplit('.', 1)[0]
    
    return {
        "title": title,
        "content": markdown_content,
        "filename": filename
    }


async def save_image_from_bytes(
    content: bytes,
    original_filename: str,
    admin_id: int,
    db: AsyncSession
) -> str:
    """
    保存图片字节内容并返回URL
    """
    # 获取扩展名和MIME类型
    ext = os.path.splitext(original_filename)[1].lower()
    if ext not in IMAGE_EXTENSIONS:
        return None
    
    mime_type = IMAGE_EXTENSIONS[ext]
    
    # 生成存储文件名
    stored_name = f"{uuid.uuid4().hex}{ext}"
    
    # 保存文件
    upload_dir = get_upload_dir()
    file_path = os.path.join(upload_dir, stored_name)
    
    async with aiofiles.open(file_path, "wb") as f:
        await f.write(content)
    
    # 保存到数据库
    image = ArticleImage(
        article_id=None,
        filename=original_filename,
        stored_name=stored_name,
        file_path=f"/uploads/images/{stored_name}",
        file_size=len(content),
        mime_type=mime_type,
        uploaded_by=admin_id
    )
    
    db.add(image)
    await db.flush()
    
    return image.file_path


@router.post("/markdown-zip")
async def upload_markdown_zip(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    admin: Admin = Depends(get_current_admin)
):
    """
    上传包含 Markdown 和图片的 ZIP 文件
    ZIP 结构支持：
    - 根目录下的 .md 文件
    - images/ 或 assets/ 或 img/ 文件夹中的图片
    - 或与 .md 同级的图片文件
    """
    filename = file.filename or ""
    if not filename.lower().endswith('.zip'):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="请上传 .zip 格式的压缩包"
        )
    
    # 读取 ZIP 内容
    content = await file.read()
    
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix='.zip') as tmp:
            tmp.write(content)
            tmp_path = tmp.name
        
        markdown_content = None
        markdown_filename = None
        image_map = {}  # 原始路径 -> 新URL 的映射
        
        with zipfile.ZipFile(tmp_path, 'r') as zip_file:
            # 获取所有文件
            file_list = zip_file.namelist()
            
            # 找到 Markdown 文件
            md_files = [f for f in file_list if f.lower().endswith('.md') and not f.startswith('__MACOSX')]
            if not md_files:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="ZIP 中没有找到 .md 文件"
                )
            
            # 使用第一个 .md 文件
            md_file = md_files[0]
            markdown_filename = os.path.basename(md_file)
            
            # 读取 Markdown 内容
            with zip_file.open(md_file) as f:
                raw_content = f.read()
                try:
                    markdown_content = raw_content.decode('utf-8')
                except UnicodeDecodeError:
                    try:
                        markdown_content = raw_content.decode('gbk')
                    except UnicodeDecodeError:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail="无法解析 Markdown 文件编码"
                        )
            
            # 找到并处理图片文件
            image_files = [f for f in file_list 
                          if any(f.lower().endswith(ext) for ext in IMAGE_EXTENSIONS.keys())
                          and not f.startswith('__MACOSX')]
            
            for img_path in image_files:
                with zip_file.open(img_path) as img_file:
                    img_content = img_file.read()
                    img_filename = os.path.basename(img_path)
                    
                    # 保存图片
                    new_url = await save_image_from_bytes(
                        img_content, img_filename, admin.id, db
                    )
                    
                    if new_url:
                        # 记录原始路径到新URL的映射
                        # 支持多种引用方式
                        image_map[img_path] = new_url
                        image_map[img_filename] = new_url
                        # 相对路径
                        image_map[f"./{img_path}"] = new_url
                        image_map[f"../{img_path}"] = new_url
        
        # 替换 Markdown 中的图片路径
        # 匹配 ![alt](path) 格式
        def replace_image_path(match):
            alt_text = match.group(1)
            img_path = match.group(2)
            
            # 尝试各种可能的路径匹配
            for original, new_url in image_map.items():
                if img_path == original or img_path.endswith(original) or original.endswith(os.path.basename(img_path)):
                    return f"![{alt_text}]({new_url})"
            
            # 如果没找到匹配，检查是否是文件名匹配
            img_basename = os.path.basename(img_path)
            if img_basename in image_map:
                return f"![{alt_text}]({image_map[img_basename]})"
            
            return match.group(0)  # 保持原样
        
        markdown_content = re.sub(
            r'!\[([^\]]*)\]\(([^)]+)\)',
            replace_image_path,
            markdown_content
        )
        
        # 提交数据库事务（保存图片记录）
        await db.commit()
        
        # 尝试从内容中提取标题
        title = ""
        lines = markdown_content.split('\n')
        for line in lines:
            if line.startswith('# '):
                title = line[2:].strip()
                break
        
        if not title:
            title = markdown_filename.rsplit('.', 1)[0]
            
        # ---------------------------------------------------------
        # 新增：保存原始 Markdown 文件到本地 Articles 目录 (同普通 md 上传)
        # ---------------------------------------------------------
        import os
        import re
        
        # 考虑到 ZIP 上传目前可能没有分类上下文，默认暂存 Uncategorized
        # 你可以后续调整这里以支持传入 category，但目前保持和文章上传时一致的默认行为
        save_dir_name = "Uncategorized"
        
        # APP所在路径 `f:\My_Blog\backend\app\api\v1`
        # 项目根目录 `f:\My_Blog` -> 向后退 4 层
        base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
        articles_dir = os.path.join(base_dir, "Articles", save_dir_name)
        
        # 确保目录存在
        os.makedirs(articles_dir, exist_ok=True)
        
        # 2. 构建文件名
        safe_title = re.sub(r'[\\/*?:"<>|]', "", title).strip()
        if not safe_title:
            safe_title = markdown_filename.rsplit('.', 1)[0]
        file_name = f"{safe_title}.md"
        file_path = os.path.join(articles_dir, file_name)
        
        # 3. 写入文件（如果是解压，使用经过图片链接替换后的 markdown_content 或者 raw_content均可，此处使用带替换后的，更有价值）
        try:
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(markdown_content)
            print(f"✅ 已保存 ZIP 解压归档: {file_path}")
        except Exception as e:
            print(f"❌ 保存 ZIP 解压归档失败: {e}")
            
        # ---------------------------------------------------------
        
        # 清理临时文件
        os.unlink(tmp_path)
        
        return {
            "title": title,
            "content": markdown_content,
            "filename": markdown_filename,
            "images_processed": len([v for v in image_map.values() if v])
        }
        
    except zipfile.BadZipFile:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="无效的 ZIP 文件"
        )
    except Exception as e:
        # 清理临时文件
        if 'tmp_path' in locals() and os.path.exists(tmp_path):
            os.unlink(tmp_path)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"处理 ZIP 文件失败: {str(e)}"
        )
