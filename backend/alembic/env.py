# coding: utf-8
"""
Alembic migration environment configuration
"""

from logging.config import fileConfig

from sqlalchemy import engine_from_config
from sqlalchemy import pool
from sqlalchemy import create_engine

from alembic import context

# Import app config and models
import sys
import os

# Add project root to Python path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import settings
from app.core.database import Base
from app.models import *  # Import all models for autogenerate
# 显式导入所有模型，确保 Alembic autogenerate 能检测到它们
from app.models.admin import Admin
from app.models.article import Article, Tag, ArticleTag, ArticleLike
from app.models.comment import Comment, CommentLike, CommentReport
from app.models.image import ArticleImage
from app.models.prompt import Prompt
from app.models.settings import SiteSetting
from app.models.stats import PageView, DailyStat
from app.models.subscriber import Subscriber
from app.models.chat import ChatSession, ChatMessage
from app.models.agent import AgentSession, AgentMessage
from app.models.forum import ForumCategory, ForumThread, ForumPost
from app.models.hot_topic import HotTopic, HotTopicSource, HotTopicTag, HotFetchJob

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Set database URL dynamically
config.set_main_option("sqlalchemy.url", settings.database_url_sync)

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# add your model's MetaData object here
# for 'autogenerate' support
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.

    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode.

    In this scenario we need to create an Engine
    and associate a connection with the context.

    """
    connectable = create_engine(
        settings.database_url_sync,
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            compare_server_default=True,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
