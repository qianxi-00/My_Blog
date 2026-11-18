"""
models 模块初始化
显式导出全站核心模型与新增业务模型，确保 SQLAlchemy mapper 与 create_all 完整注册
"""
from .user import User  # noqa: F401
from .bookmark import Bookmark  # noqa: F401
from .notification import Notification  # noqa: F401
from .forum import (  # noqa: F401
    ForumCategory,
    ForumThread,
    ForumPost,
    ForumThreadLike,
    ForumPostLike,
    ForumReport,
)
