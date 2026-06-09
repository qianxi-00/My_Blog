"""add subscribers table

Revision ID: 51f250779fe6
Revises: 026b6ad60406
Create Date: 2026-01-30 21:52:05.659120

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

# revision identifiers, used by Alembic.
revision: str = '51f250779fe6'
down_revision: Union[str, None] = '026b6ad60406'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if 'subscribers' not in inspector.get_table_names():
        op.create_table(
            'subscribers',
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('email', sa.String(length=255), nullable=False),
            sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('1')),
            sa.Column('unsubscribe_token', sa.String(length=64), nullable=False),
            sa.Column('subscribed_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
            sa.Column('unsubscribed_at', sa.DateTime(), nullable=True),
            sa.PrimaryKeyConstraint('id')
        )

    existing_indexes = {idx['name'] for idx in inspector.get_indexes('subscribers')}
    if 'ix_subscribers_email' not in existing_indexes:
        op.create_index('ix_subscribers_email', 'subscribers', ['email'], unique=True)
    if 'unsubscribe_token' not in existing_indexes:
        op.create_index('unsubscribe_token', 'subscribers', ['unsubscribe_token'], unique=True)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if 'subscribers' in inspector.get_table_names():
        existing_indexes = {idx['name'] for idx in inspector.get_indexes('subscribers')}
        if 'ix_subscribers_email' in existing_indexes:
            op.drop_index('ix_subscribers_email', table_name='subscribers')
        if 'unsubscribe_token' in existing_indexes:
            op.drop_index('unsubscribe_token', table_name='subscribers')
        op.drop_table('subscribers')
    op.create_index('ix_articles_category', 'articles', ['category'], unique=False)
    op.create_index('ix_articles_author_id', 'articles', ['author_id'], unique=False)
    op.create_table('article_tags',
    sa.Column('article_id', mysql.INTEGER(), autoincrement=False, nullable=False),
    sa.Column('tag_id', mysql.INTEGER(), autoincrement=False, nullable=False),
    sa.ForeignKeyConstraint(['article_id'], ['articles.id'], name='article_tags_ibfk_1', ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['tag_id'], ['tags.id'], name='article_tags_ibfk_2', ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('article_id', 'tag_id'),
    mysql_collate='utf8mb4_unicode_ci',
    mysql_default_charset='utf8mb4',
    mysql_engine='InnoDB'
    )
    op.create_table('admins',
    sa.Column('id', mysql.INTEGER(), autoincrement=True, nullable=False),
    sa.Column('username', mysql.VARCHAR(collation='utf8mb4_unicode_ci', length=50), nullable=False),
    sa.Column('email', mysql.VARCHAR(collation='utf8mb4_unicode_ci', length=100), nullable=True),
    sa.Column('password_hash', mysql.VARCHAR(collation='utf8mb4_unicode_ci', length=255), nullable=False),
    sa.Column('display_name', mysql.VARCHAR(collation='utf8mb4_unicode_ci', length=100), nullable=True),
    sa.Column('avatar_url', mysql.VARCHAR(collation='utf8mb4_unicode_ci', length=500), nullable=True),
    sa.Column('bio', mysql.TEXT(collation='utf8mb4_unicode_ci'), nullable=True),
    sa.Column('role', mysql.ENUM('super_admin', 'admin'), nullable=False),
    sa.Column('is_active', mysql.TINYINT(display_width=1), autoincrement=False, nullable=False),
    sa.Column('created_at', mysql.DATETIME(), nullable=False),
    sa.Column('updated_at', mysql.DATETIME(), nullable=True),
    sa.Column('qq', mysql.VARCHAR(collation='utf8mb4_unicode_ci', length=20), nullable=True),
    sa.Column('wechat', mysql.VARCHAR(collation='utf8mb4_unicode_ci', length=50), nullable=True),
    sa.Column('github', mysql.VARCHAR(collation='utf8mb4_unicode_ci', length=100), nullable=True),
    sa.Column('bilibili', mysql.VARCHAR(collation='utf8mb4_unicode_ci', length=100), nullable=True),
    sa.PrimaryKeyConstraint('id'),
    mysql_collate='utf8mb4_unicode_ci',
    mysql_default_charset='utf8mb4',
    mysql_engine='InnoDB'
    )
    op.create_index('ix_admins_username', 'admins', ['username'], unique=True)
    op.create_index('email', 'admins', ['email'], unique=True)
    op.create_table('chat_sessions',
    sa.Column('id', mysql.VARCHAR(collation='utf8mb4_unicode_ci', length=36), nullable=False),
    sa.Column('title', mysql.VARCHAR(collation='utf8mb4_unicode_ci', length=100), nullable=True),
    sa.Column('created_at', mysql.DATETIME(), nullable=False),
    sa.Column('updated_at', mysql.DATETIME(), nullable=True),
    sa.PrimaryKeyConstraint('id'),
    mysql_collate='utf8mb4_unicode_ci',
    mysql_default_charset='utf8mb4',
    mysql_engine='InnoDB'
    )
    op.create_table('prompts',
    sa.Column('id', mysql.INTEGER(), autoincrement=True, nullable=False),
    sa.Column('title', mysql.VARCHAR(collation='utf8mb4_unicode_ci', length=100), nullable=False),
    sa.Column('description', mysql.TEXT(collation='utf8mb4_unicode_ci'), nullable=True),
    sa.Column('content', mysql.TEXT(collation='utf8mb4_unicode_ci'), nullable=False),
    sa.Column('category', mysql.ENUM('Dev', 'Writing', 'Business', 'Academic', 'Other'), nullable=False),
    sa.Column('author_id', mysql.INTEGER(), autoincrement=False, nullable=True),
    sa.Column('submitted_by', mysql.VARCHAR(collation='utf8mb4_unicode_ci', length=50), nullable=True),
    sa.Column('status', mysql.ENUM('pending', 'approved', 'rejected'), nullable=False),
    sa.Column('use_count', mysql.INTEGER(), autoincrement=False, nullable=False),
    sa.Column('created_at', mysql.DATETIME(), nullable=False),
    sa.Column('updated_at', mysql.DATETIME(), nullable=True),
    sa.ForeignKeyConstraint(['author_id'], ['admins.id'], name='prompts_ibfk_1', ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id'),
    mysql_collate='utf8mb4_unicode_ci',
    mysql_default_charset='utf8mb4',
    mysql_engine='InnoDB'
    )
    op.create_index('ix_prompts_author_id', 'prompts', ['author_id'], unique=False)
    op.create_table('tags',
    sa.Column('id', mysql.INTEGER(), autoincrement=True, nullable=False),
    sa.Column('name', mysql.VARCHAR(collation='utf8mb4_unicode_ci', length=50), nullable=False),
    sa.Column('slug', mysql.VARCHAR(collation='utf8mb4_unicode_ci', length=50), nullable=True),
    sa.Column('color', mysql.VARCHAR(collation='utf8mb4_unicode_ci', length=7), nullable=True),
    sa.Column('created_at', mysql.DATETIME(), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    mysql_collate='utf8mb4_unicode_ci',
    mysql_default_charset='utf8mb4',
    mysql_engine='InnoDB'
    )
    op.create_index('slug', 'tags', ['slug'], unique=True)
    op.create_index('ix_tags_name', 'tags', ['name'], unique=True)
    # ### end Alembic commands ###
