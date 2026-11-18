"""
文件上传 API

- 支持登录用户上传文章/社区图片（POST /image?scope=images|forum）和个人头像（POST /avatar）
- 持久化保存至 <DB_DIR>/uploads/{images,avatars,forum}，通过 GET /files/{subpath} 安全提供访问
- 兼容管理员 Markdown / ZIP 批量导入
"""

from __future__ import annotations

import os
import re
import tempfile
import uuid
import zipfile
from typing import Optional

import aiofiles
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.config import settings
from ...core.database import get_db
from ...core.deps import get_current_admin, get_current_user
from ...core.ratelimit import rate_limit
from ...models.image import ArticleImage
from ...models.user import User
from ...services.storage_service import (
    ensure_upload_dirs,
    get_legacy_upload_root,
    resolve_upload_root,
)

router = APIRouter()

ALLOWED_IMAGE_TYPES = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
}

IMAGE_EXTENSIONS = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
}

AVATAR_MAX_BYTES = 5 * 1024 * 1024
ALLOWED_IMAGE_SCOPES = {"images", "forum"}


def _detect_image_ext_from_magic(content: bytes) -> Optional[str]:
    if content.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    if content.startswith((b"GIF87a", b"GIF89a")):
        return ".gif"
    if len(content) >= 12 and content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        return ".webp"
    return None


def _validate_image_payload(file: UploadFile, content: bytes, max_bytes: int, max_mb_label: str) -> tuple[str, str]:
    """校验 MIME + 魔数头 + 文件大小，返回 (ext, mime_type)"""
    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="图片文件不能为空")
    if len(content) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"文件大小超过限制（最大 {max_mb_label}）",
        )

    mime = (file.content_type or "").lower().strip()
    magic_ext = _detect_image_ext_from_magic(content)
    if magic_ext is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="无法识别的图片内容，仅支持 JPG / PNG / GIF / WEBP",
        )

    if mime and mime != "application/octet-stream":
        if mime not in ALLOWED_IMAGE_TYPES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"不支持的文件类型：{file.content_type}",
            )
        declared_ext = ALLOWED_IMAGE_TYPES[mime]
        if declared_ext != magic_ext:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="图片文件内容与声明格式不一致",
            )

    filename_ext = os.path.splitext(file.filename or "")[1].lower()
    if filename_ext and filename_ext not in IMAGE_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"不支持的图片扩展名：{filename_ext}",
        )

    resolved_mime = IMAGE_EXTENSIONS[magic_ext]
    return magic_ext, resolved_mime


def get_upload_dir(scope: str = "images") -> str:
    """获取并确保目标子目录存在"""
    root = ensure_upload_dirs()
    target = os.path.join(root, scope)
    os.makedirs(target, exist_ok=True)
    return target


@router.get("/files/{subpath:path}")
async def serve_uploaded_file(subpath: str):
    """
    从持久化上传目录提供文件访问（安全防穿越 + 兼容旧路径回落）
    """
    clean_sub = (subpath or "").replace("\\", "/").lstrip("/")
    if not clean_sub or ".." in clean_sub.split("/"):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="文件不存在")

    ext = os.path.splitext(clean_sub)[1].lower()
    if ext not in IMAGE_EXTENSIONS:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="文件不存在")
    media_type = IMAGE_EXTENSIONS[ext]

    for root in (resolve_upload_root(), get_legacy_upload_root()):
        base_real = os.path.realpath(root)
        candidate = os.path.realpath(os.path.join(base_real, clean_sub))
        if candidate != base_real and candidate.startswith(base_real + os.sep) and os.path.isfile(candidate):
            return FileResponse(
                candidate,
                media_type=media_type,
                headers={"Cache-Control": "public, max-age=2592000"},
            )

    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="文件不存在")


@router.post(
    "/image",
    dependencies=[Depends(rate_limit("upload_image", limit=20, window_seconds=60, key_scope="user"))],
)
async def upload_image(
    file: UploadFile = File(...),
    article_id: Optional[int] = Query(None),
    scope: str = Query("images", description="存储作用域：images 或 forum"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    上传图片（所有已登录用户，限流 20 次/分钟）
    """
    clean_scope = (scope or "images").strip().lower()
    if clean_scope not in ALLOWED_IMAGE_SCOPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="scope 仅支持 images 或 forum",
        )

    content = await file.read()
    ext, resolved_mime = _validate_image_payload(
        file,
        content,
        settings.max_upload_size_bytes,
        f"{settings.MAX_UPLOAD_SIZE_MB}MB",
    )

    stored_name = f"{uuid.uuid4().hex}{ext}"
    upload_dir = get_upload_dir(clean_scope)
    file_path = os.path.join(upload_dir, stored_name)

    async with aiofiles.open(file_path, "wb") as f:
        await f.write(content)

    public_url = f"/api/v1/upload/files/{clean_scope}/{stored_name}"

    image = ArticleImage(
        article_id=article_id,
        filename=(file.filename or stored_name)[:255],
        stored_name=stored_name,
        file_path=public_url,
        file_size=len(content),
        mime_type=resolved_mime,
        uploaded_by=current_user.id,
    )

    db.add(image)
    await db.commit()
    await db.refresh(image)

    return {
        "id": image.id,
        "url": image.file_path,
        "filename": image.filename,
        "size": image.file_size,
    }


@router.post(
    "/avatar",
    dependencies=[Depends(rate_limit("upload_avatar", limit=20, window_seconds=60, key_scope="user"))],
)
async def upload_avatar(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """
    上传用户头像（所有已登录用户，限制 5MB）
    """
    content = await file.read()
    ext, _ = _validate_image_payload(file, content, AVATAR_MAX_BYTES, "5MB")

    stored_name = f"{current_user.id}_{uuid.uuid4().hex[:12]}{ext}"
    upload_dir = get_upload_dir("avatars")
    file_path = os.path.join(upload_dir, stored_name)

    async with aiofiles.open(file_path, "wb") as f:
        await f.write(content)

    return {
        "url": f"/api/v1/upload/files/avatars/{stored_name}",
        "filename": (file.filename or stored_name)[:255],
        "size": len(content),
    }


@router.get("/images")
async def get_images(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """获取图片列表（管理员）"""
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
            "created_at": img.created_at,
        }
        for img in images
    ]


async def _delete_image_impl(
    image_id: int,
    db: AsyncSession,
    current_user: User,
):
    result = await db.execute(select(ArticleImage).where(ArticleImage.id == image_id))
    image = result.scalar_one_or_none()

    if not image:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="图片不存在")

    if not current_user.is_admin_role and image.uploaded_by != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="只能删除自己上传的图片")

    # 确定磁盘相对路径并清理文件（同时检查持久目录与旧目录）
    rel_sub = None
    fp = image.file_path or ""
    if "/api/v1/upload/files/" in fp:
        rel_sub = fp.split("/api/v1/upload/files/", 1)[1].lstrip("/")
    elif fp.startswith("/uploads/"):
        rel_sub = fp[len("/uploads/"):].lstrip("/")
    else:
        rel_sub = os.path.join("images", image.stored_name)

    for root in (resolve_upload_root(), get_legacy_upload_root()):
        base_real = os.path.realpath(root)
        candidate = os.path.realpath(os.path.join(base_real, rel_sub))
        if candidate != base_real and candidate.startswith(base_real + os.sep) and os.path.isfile(candidate):
            try:
                os.remove(candidate)
            except OSError:
                pass

    await db.delete(image)
    await db.commit()
    return {"message": "删除成功"}


@router.delete("/image/{image_id}")
async def delete_image(
    image_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """删除图片（管理员或上传者本人）"""
    return await _delete_image_impl(image_id, db, current_user)


@router.delete("/images/{image_id}")
async def delete_image_plural(
    image_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """删除图片兼容路由（匹配前端 DELETE /upload/images/{id}）"""
    return await _delete_image_impl(image_id, db, current_user)


@router.post("/markdown")
async def upload_markdown(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """上传 Markdown 文件，解析并返回内容"""
    filename = file.filename or ""
    if not filename.lower().endswith(".md"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="请上传 .md 格式的 Markdown 文件",
        )

    content = await file.read()
    try:
        markdown_content = content.decode("utf-8")
    except UnicodeDecodeError:
        try:
            markdown_content = content.decode("gbk")
        except UnicodeDecodeError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="无法解析文件编码，请使用 UTF-8 编码",
            )

    title = ""
    for line in markdown_content.split("\n"):
        if line.startswith("# "):
            title = line[2:].strip()
            break
    if not title:
        title = filename.rsplit(".", 1)[0]

    return {
        "title": title,
        "content": markdown_content,
        "filename": filename,
    }


async def save_image_from_bytes(
    content: bytes,
    original_filename: str,
    admin_id: int,
    db: AsyncSession,
) -> Optional[str]:
    """保存图片字节内容并返回持久化 URL"""
    ext = os.path.splitext(original_filename)[1].lower()
    if ext not in IMAGE_EXTENSIONS:
        return None

    mime_type = IMAGE_EXTENSIONS[ext]
    stored_name = f"{uuid.uuid4().hex}{ext}"

    upload_dir = get_upload_dir("images")
    file_path = os.path.join(upload_dir, stored_name)

    async with aiofiles.open(file_path, "wb") as f:
        await f.write(content)

    public_url = f"/api/v1/upload/files/images/{stored_name}"

    image = ArticleImage(
        article_id=None,
        filename=original_filename[:255],
        stored_name=stored_name,
        file_path=public_url,
        file_size=len(content),
        mime_type=mime_type,
        uploaded_by=admin_id,
    )

    db.add(image)
    await db.flush()
    return image.file_path


@router.post("/markdown-zip")
async def upload_markdown_zip(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """上传包含 Markdown 和图片的 ZIP 文件"""
    filename = file.filename or ""
    if not filename.lower().endswith(".zip"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="请上传 .zip 格式的压缩包",
        )

    content = await file.read()
    tmp_path = None

    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".zip") as tmp:
            tmp.write(content)
            tmp_path = tmp.name

        markdown_content = None
        markdown_filename = None
        image_map = {}

        with zipfile.ZipFile(tmp_path, "r") as zip_file:
            file_list = zip_file.namelist()
            md_files = [f for f in file_list if f.lower().endswith(".md") and not f.startswith("__MACOSX")]
            if not md_files:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="ZIP 中没有找到 .md 文件",
                )

            md_file = md_files[0]
            markdown_filename = os.path.basename(md_file)

            with zip_file.open(md_file) as f:
                raw_content = f.read()
                try:
                    markdown_content = raw_content.decode("utf-8")
                except UnicodeDecodeError:
                    try:
                        markdown_content = raw_content.decode("gbk")
                    except UnicodeDecodeError:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail="无法解析 Markdown 文件编码",
                        )

            image_files = [
                f
                for f in file_list
                if any(f.lower().endswith(ext) for ext in IMAGE_EXTENSIONS.keys())
                and not f.startswith("__MACOSX")
            ]

            for img_path in image_files:
                with zip_file.open(img_path) as img_file:
                    img_content = img_file.read()
                    img_filename = os.path.basename(img_path)
                    new_url = await save_image_from_bytes(img_content, img_filename, admin.id, db)
                    if new_url:
                        image_map[img_path] = new_url
                        image_map[img_filename] = new_url
                        image_map[f"./{img_path}"] = new_url
                        image_map[f"../{img_path}"] = new_url

        def replace_image_path(match):
            alt_text = match.group(1)
            img_path = match.group(2)
            for original, new_url in image_map.items():
                if img_path == original or img_path.endswith(original) or original.endswith(os.path.basename(img_path)):
                    return f"![{alt_text}]({new_url})"
            img_basename = os.path.basename(img_path)
            if img_basename in image_map:
                return f"![{alt_text}]({image_map[img_basename]})"
            return match.group(0)

        markdown_content = re.sub(
            r"!\[([^\]]*)\]\(([^)]+)\)",
            replace_image_path,
            markdown_content,
        )

        await db.commit()

        title = ""
        for line in markdown_content.split("\n"):
            if line.startswith("# "):
                title = line[2:].strip()
                break
        if not title:
            title = markdown_filename.rsplit(".", 1)[0]

        try:
            save_dir_name = "Uncategorized"
            base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
            articles_dir = os.path.join(base_dir, "Articles", save_dir_name)
            os.makedirs(articles_dir, exist_ok=True)
            safe_title = re.sub(r'[\\/*?:"<>|]', "", title).strip() or markdown_filename.rsplit(".", 1)[0]
            archive_path = os.path.join(articles_dir, f"{safe_title}.md")
            with open(archive_path, "w", encoding="utf-8") as f:
                f.write(markdown_content)
        except Exception as archive_err:
            print(f"❌ 保存 ZIP 解压归档失败: {archive_err}")

        return {
            "title": title,
            "content": markdown_content,
            "filename": markdown_filename,
            "images_processed": len([v for v in image_map.values() if v]),
        }

    except HTTPException:
        raise
    except zipfile.BadZipFile:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="无效的 ZIP 文件",
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"处理 ZIP 文件失败: {str(e)}",
        )
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
