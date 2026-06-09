"""
应用配置模块
使用 pydantic-settings 从 .env 文件读取配置
"""

import os.path
from typing import Optional
from urllib.parse import quote_plus

from pydantic import ConfigDict
from pydantic_settings import BaseSettings

# 获取当前文件所在目录，用于定位 .env 文件
PATH = os.path.dirname(os.path.abspath(__file__))
# .env 文件位于 backend 根目录，即 config.py 的上两级
ENV_PATH = os.path.join(PATH, "..", "..", ".env")


class Settings(BaseSettings):
    """应用配置类"""
    
    # ====================================
    # 数据库配置 (MySQL)
    # ====================================
    DB_HOST: str = "localhost"
    DB_PORT: str = "3306"
    DB_USER: str = "root"
    DB_PASSWORD: str = ""
    DB_NAME: str = "my_blog"

    # 连接编码（避免中文/emoji 等出现乱码）
    DB_CHARSET: str = "utf8mb4"
    
    # ====================================
    # 初始超级管理员
    # ====================================
    SUPER_ADMIN_USERNAME: str = "admin"
    SUPER_ADMIN_PASSWORD: str = "admin123"
    
    # ====================================
    # JWT 配置
    # ====================================
    JWT_SECRET_KEY: str = "your-super-secret-jwt-key-change-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 默认 24 小时
    
    # ====================================
    # OpenAI API 配置
    # ====================================
    OPENAI_API_KEY: Optional[str] = None
    OPENAI_API_BASE: str = "https://qianxi7988.me/v1"
    OPENAI_MODEL: str = "gpt-5.5"
    ZHAIYAO_MODEL: str = "gpt-5.5"  # 默认值，会被 .env 覆盖
    
    # ====================================
    # Agent AI 配置（管理后台 AI 助手）
    # ====================================
    # Redis
    REDIS_ENABLED: bool = True
    REDIS_HOST: str = "127.0.0.1"
    REDIS_PORT: int = 63791
    REDIS_PASSWORD: Optional[str] = None
    REDIS_DB: int = 0
    REDIS_CONNECT_TIMEOUT: int = 1
    REDIS_SOCKET_TIMEOUT: int = 1
    
    AGENT_API_KEY: Optional[str] = None
    AGENT_API_BASE: str = "https://qianxi7988.me/v1"
    AGENT_MODEL: str = "gpt-5.5"
    AGENT_MAX_TOKENS: int = 16000
    AGENT_TEMPERATURE: float = 0.7
    
    # ====================================
    # 文件上传配置
    # ====================================
    UPLOAD_DIR: str = "uploads"
    MAX_UPLOAD_SIZE_MB: int = 10
    
    # ====================================
    # 应用配置
    # ====================================
    APP_HOST: str = "0.0.0.0"
    APP_PORT: int = 8000
    DEBUG: bool = False
    
    # ====================================
    # SMTP 邮件配置
    # ====================================
    SMTP_HOST: str = ""
    SMTP_PORT: int = 465
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM_EMAIL: str = ""
    SMTP_FROM_NAME: str = "千禧的个人博客"
    SMTP_USE_SSL: bool = True
    
    # 站点 URL（用于邮件中的链接）
    SITE_URL: str = "http://localhost:8000"
    
    # Pydantic Settings 配置
    model_config = ConfigDict(
        extra="allow",
        env_file=ENV_PATH,
        env_file_encoding="utf-8",
        case_sensitive=False,
    )
    
    @property
    def database_url(self) -> str:
        """构建数据库连接 URL (异步，用于 SQLAlchemy asyncio)"""
        # 对密码进行 URL 编码，处理特殊字符如 @, # 等
        encoded_password = quote_plus(self.DB_PASSWORD)
        return f"mysql+aiomysql://{self.DB_USER}:{encoded_password}@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}?charset={self.DB_CHARSET}"
    
    @property
    def database_url_sync(self) -> str:
        """构建同步数据库连接 URL (用于 Alembic 迁移)"""
        # 对密码进行 URL 编码，处理特殊字符如 @, # 等
        encoded_password = quote_plus(self.DB_PASSWORD)
        return f"mysql+pymysql://{self.DB_USER}:{encoded_password}@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}?charset={self.DB_CHARSET}"
    
    @property
    def max_upload_size_bytes(self) -> int:
        """最大上传文件大小（字节）"""
        return self.MAX_UPLOAD_SIZE_MB * 1024 * 1024


# 全局配置实例
settings = Settings()


if __name__ == "__main__":
    # 测试配置是否正确加载
    print(f"DB_HOST: {settings.DB_HOST}")
    print(f"DB_PORT: {settings.DB_PORT}")
    print(f"DB_USER: {settings.DB_USER}")
    print(f"DB_NAME: {settings.DB_NAME}")
    print(f"Database URL (sync): {settings.database_url_sync}")
    print(f"Super Admin: {settings.SUPER_ADMIN_USERNAME}")
