"""add comment target columns for hotspot comments

Revision ID: c9d0e1f2a3b4
Revises: b4e5f6a7b8c9
Create Date: 2026-03-23 17:18:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = "c9d0e1f2a3b4"
down_revision: Union[str, None] = "b4e5f6a7b8c9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {col["name"] for col in inspector.get_columns("comments")}
    indexes = {idx["name"] for idx in inspector.get_indexes("comments")}

    if "target_type" not in columns:
        op.add_column(
            "comments",
            sa.Column(
                "target_type",
                sa.Enum("article", "hotspot", name="comment_target_type_enum"),
                nullable=False,
                server_default="article",
            ),
        )

    if "target_id" not in columns:
        op.add_column("comments", sa.Column("target_id", sa.Integer(), nullable=True))

    op.execute("UPDATE comments SET target_type='article' WHERE target_type IS NULL")
    op.execute("UPDATE comments SET target_id=article_id WHERE target_id IS NULL")

    op.alter_column("comments", "target_id", existing_type=sa.Integer(), nullable=False)
    op.alter_column("comments", "article_id", existing_type=sa.Integer(), nullable=True)

    if "ix_comments_target_type" not in indexes:
        op.create_index("ix_comments_target_type", "comments", ["target_type"], unique=False)
    if "ix_comments_target_id" not in indexes:
        op.create_index("ix_comments_target_id", "comments", ["target_id"], unique=False)
    if "ix_comments_target_lookup" not in indexes:
        op.create_index(
            "ix_comments_target_lookup",
            "comments",
            ["target_type", "target_id", "status", "created_at"],
            unique=False,
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {col["name"] for col in inspector.get_columns("comments")}
    indexes = {idx["name"] for idx in inspector.get_indexes("comments")}

    # 回滚时无法保留热点评论，只能删除这些记录，避免 article_id 恢复 NOT NULL 时失败。
    if "target_type" in columns:
        op.execute("DELETE FROM comments WHERE target_type='hotspot'")
        if "target_id" in columns:
            op.execute("UPDATE comments SET article_id=target_id WHERE target_type='article' AND article_id IS NULL")

    if "ix_comments_target_lookup" in indexes:
        op.drop_index("ix_comments_target_lookup", table_name="comments")
    if "ix_comments_target_id" in indexes:
        op.drop_index("ix_comments_target_id", table_name="comments")
    if "ix_comments_target_type" in indexes:
        op.drop_index("ix_comments_target_type", table_name="comments")

    if "article_id" in columns:
        op.alter_column("comments", "article_id", existing_type=sa.Integer(), nullable=False)

    if "target_id" in columns:
        op.drop_column("comments", "target_id")
    if "target_type" in columns:
        op.drop_column("comments", "target_type")
