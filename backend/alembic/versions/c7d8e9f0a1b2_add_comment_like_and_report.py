"""add comment like and report

Revision ID: c7d8e9f0a1b2
Revises: 51f250779fe6
Create Date: 2026-01-31 16:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision: str = 'c7d8e9f0a1b2'
down_revision: Union[str, None] = '51f250779fe6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """添加评论点赞和举报功能字段"""
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = [col['name'] for col in inspector.get_columns('comments')]
    
    # 添加点赞数
    if 'like_count' not in columns:
        op.add_column('comments', sa.Column('like_count', sa.Integer(), nullable=False, server_default='0'))
    
    # 添加举报数
    if 'report_count' not in columns:
        op.add_column('comments', sa.Column('report_count', sa.Integer(), nullable=False, server_default='0'))
    
    # 添加是否被举报标记
    if 'is_reported' not in columns:
        op.add_column('comments', sa.Column('is_reported', sa.Boolean(), nullable=False, server_default='0'))
    
    # 创建评论点赞表
    tables = inspector.get_table_names()
    if 'comment_likes' not in tables:
        op.create_table(
            'comment_likes',
            sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column('comment_id', sa.Integer(), sa.ForeignKey('comments.id', ondelete='CASCADE'), nullable=False),
            sa.Column('user_identifier', sa.String(100), nullable=False),  # IP 或者设备指纹
            sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
            sa.UniqueConstraint('comment_id', 'user_identifier', name='uq_comment_like')
        )
    
    # 创建评论举报表
    if 'comment_reports' not in tables:
        op.create_table(
            'comment_reports',
            sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column('comment_id', sa.Integer(), sa.ForeignKey('comments.id', ondelete='CASCADE'), nullable=False),
            sa.Column('reporter_identifier', sa.String(100), nullable=False),  # IP 或设备指纹
            sa.Column('reason', sa.String(50), nullable=False),  # 举报原因
            sa.Column('description', sa.Text(), nullable=True),  # 补充说明
            sa.Column('status', sa.String(20), nullable=False, server_default='pending'),  # pending/processed
            sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
            sa.UniqueConstraint('comment_id', 'reporter_identifier', name='uq_comment_report')
        )


def downgrade() -> None:
    """回滚"""
    bind = op.get_bind()
    inspector = inspect(bind)
    tables = inspector.get_table_names()
    
    if 'comment_reports' in tables:
        op.drop_table('comment_reports')
    
    if 'comment_likes' in tables:
        op.drop_table('comment_likes')
    
    columns = [col['name'] for col in inspector.get_columns('comments')]
    
    if 'is_reported' in columns:
        op.drop_column('comments', 'is_reported')
    if 'report_count' in columns:
        op.drop_column('comments', 'report_count')
    if 'like_count' in columns:
        op.drop_column('comments', 'like_count')
