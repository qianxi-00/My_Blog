"""add article like

Revision ID: d8e9f0a1b2c3
Revises: c7d8e9f0a1b2
Create Date: 2026-01-31 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision: str = 'd8e9f0a1b2c3'
down_revision: Union[str, None] = 'c7d8e9f0a1b2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """添加文章点赞功能"""
    bind = op.get_bind()
    inspector = inspect(bind)
    
    # 添加 like_count 字段到 articles 表
    columns = [col['name'] for col in inspector.get_columns('articles')]
    if 'like_count' not in columns:
        op.add_column('articles', sa.Column('like_count', sa.Integer(), nullable=False, server_default='0'))
    
    # 创建文章点赞表
    tables = inspector.get_table_names()
    if 'article_likes' not in tables:
        op.create_table(
            'article_likes',
            sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column('article_id', sa.Integer(), sa.ForeignKey('articles.id', ondelete='CASCADE'), nullable=False),
            sa.Column('user_identifier', sa.String(100), nullable=False),
            sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
            sa.UniqueConstraint('article_id', 'user_identifier', name='uq_article_like')
        )
        op.create_index('ix_article_likes_article_id', 'article_likes', ['article_id'])


def downgrade() -> None:
    """回滚"""
    bind = op.get_bind()
    inspector = inspect(bind)
    tables = inspector.get_table_names()
    
    if 'article_likes' in tables:
        op.drop_table('article_likes')
    
    columns = [col['name'] for col in inspector.get_columns('articles')]
    if 'like_count' in columns:
        op.drop_column('articles', 'like_count')
