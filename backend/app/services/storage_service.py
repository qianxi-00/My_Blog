"""
持久化文件存储路径工具

生产环境 Nginx 将 /uploads/ 静态指向前端 dist，且后端容器仅持久化挂载 /data。
因此用户与论坛上传文件统一落到与 SQLite 数据库同级的 uploads 目录（/data/uploads），
并通过 GET /api/v1/upload/files/{subpath:path} 提供读写一致的服务。
"""

from __future__ import annotations

import os

from ..core.config import settings

UPLOAD_SCOPES = ("images", "avatars", "forum")


def get_legacy_upload_root() -> str:
    """旧版相对 backend/uploads 目录路径（用于兼容读取历史遗留文件）"""
    backend_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    raw = (settings.UPLOAD_DIR or "uploads").strip()
    if os.path.isabs(raw):
        return raw
    return os.path.abspath(os.path.join(backend_root, raw))


def resolve_upload_root() -> str:
    """
    解析持久化上传根目录（纯路径计算，不在模块导入期创建目录，避免只读沙箱/CI 报错）。
    - UPLOAD_DIR 为绝对路径时直接使用
    - SQLite 模式下默认落在 DB_PATH 同级目录下的 uploads（生产为 /data/uploads）
    - 其他情况落到 backend/uploads
    """
    raw = (settings.UPLOAD_DIR or "uploads").strip()
    if os.path.isabs(raw):
        return raw
    if settings.DB_TYPE == "sqlite" and settings.DB_PATH:
        db_dir = os.path.dirname(os.path.abspath(settings.DB_PATH))
        return os.path.join(db_dir, raw)
    return get_legacy_upload_root()


def ensure_upload_dirs() -> str:
    """确保上传根目录及 images/avatars/forum 子目录存在"""
    root = resolve_upload_root()
    os.makedirs(root, exist_ok=True)
    for scope in UPLOAD_SCOPES:
        os.makedirs(os.path.join(root, scope), exist_ok=True)
    return root
