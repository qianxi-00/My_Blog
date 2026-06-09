"""add forum tables

Revision ID: a1b2c3d4e5f6
Revises: 41ea2300b059
Create Date: 2026-03-13

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "41ea2300b059"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_DEFAULT_CATEGORIES = [
    {"id": 1, "name": "学习", "slug": "study", "sort_order": 10},
    {"id": 2, "name": "生活", "slug": "life", "sort_order": 20},
    {"id": 3, "name": "项目", "slug": "projects", "sort_order": 30},
    {"id": 4, "name": "求助", "slug": "help", "sort_order": 40},
    {"id": 5, "name": "资源分享", "slug": "resources", "sort_order": 50},
    {"id": 6, "name": "站务/反馈", "slug": "site", "sort_order": 60},
]


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    tables = inspector.get_table_names()

    # ---- forum_categories ----
    if "forum_categories" not in tables:
        op.create_table(
            "forum_categories",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("name", sa.String(length=50), nullable=False),
            sa.Column("slug", sa.String(length=50), nullable=True),
            sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default="1"),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.UniqueConstraint("name", name="uq_forum_categories_name"),
            sa.UniqueConstraint("slug", name="uq_forum_categories_slug"),
        )
        op.create_index(op.f("ix_forum_categories_name"), "forum_categories", ["name"], unique=True)

    # ---- forum_threads ----
    # 注意：MySQL 创建表时要求外键引用的表必须已存在。
    # forum_threads.last_post_id 需要引用 forum_posts.id，但 forum_posts 又依赖 forum_threads。
    # 处理方式：先创建 forum_threads（不加 last_post_id 外键），再创建 forum_posts，最后补上外键。
    if "forum_threads" not in tables:
        op.create_table(
            "forum_threads",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("category_id", sa.Integer(), nullable=False),
            sa.Column("title", sa.String(length=200), nullable=False),
            sa.Column(
                "status",
                sa.Enum("approved", "deleted", name="forum_thread_status_enum"),
                nullable=False,
                server_default="approved",
            ),
            sa.Column("is_pinned", sa.Boolean(), nullable=False, server_default="0"),
            sa.Column("is_locked", sa.Boolean(), nullable=False, server_default="0"),
            sa.Column("reply_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("view_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("last_post_at", sa.DateTime(), nullable=True),
            sa.Column("last_post_id", sa.Integer(), nullable=True),
            sa.Column("last_floor", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("author_nickname", sa.String(length=50), nullable=False),
            sa.Column("author_email", sa.String(length=100), nullable=True),
            sa.Column("ip_address", sa.String(length=45), nullable=True),
            sa.Column("user_agent", sa.String(length=500), nullable=True),
            sa.Column("user_identifier", sa.String(length=100), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=True, server_default=sa.func.now()),
            sa.ForeignKeyConstraint(["category_id"], ["forum_categories.id"], ondelete="RESTRICT"),
        )
        op.create_index(op.f("ix_forum_threads_category_id"), "forum_threads", ["category_id"], unique=False)
        op.create_index(op.f("ix_forum_threads_last_post_id"), "forum_threads", ["last_post_id"], unique=False)
        op.create_index(op.f("ix_forum_threads_last_post_at"), "forum_threads", ["last_post_at"], unique=False)
        op.create_index(op.f("ix_forum_threads_status"), "forum_threads", ["status"], unique=False)
        op.create_index(op.f("ix_forum_threads_user_identifier"), "forum_threads", ["user_identifier"], unique=False)

    # ---- forum_posts ----
    if "forum_posts" not in tables:
        op.create_table(
            "forum_posts",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("thread_id", sa.Integer(), nullable=False),
            sa.Column("parent_id", sa.Integer(), nullable=True),
            sa.Column("floor", sa.Integer(), nullable=False),
            sa.Column("nickname", sa.String(length=50), nullable=False),
            sa.Column("email", sa.String(length=100), nullable=True),
            sa.Column("content", sa.Text(), nullable=False),
            sa.Column(
                "status",
                sa.Enum("approved", "deleted", name="forum_post_status_enum"),
                nullable=False,
                server_default="approved",
            ),
            sa.Column("is_admin_post", sa.Boolean(), nullable=False, server_default="0"),
            sa.Column("admin_id", sa.Integer(), nullable=True),
            sa.Column("ip_address", sa.String(length=45), nullable=True),
            sa.Column("user_agent", sa.String(length=500), nullable=True),
            sa.Column("user_identifier", sa.String(length=100), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=True, server_default=sa.func.now()),
            sa.ForeignKeyConstraint(["thread_id"], ["forum_threads.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["parent_id"], ["forum_posts.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["admin_id"], ["admins.id"], ondelete="SET NULL"),
            sa.UniqueConstraint("thread_id", "floor", name="uq_forum_posts_thread_floor"),
        )
        op.create_index(op.f("ix_forum_posts_thread_id"), "forum_posts", ["thread_id"], unique=False)
        op.create_index(op.f("ix_forum_posts_parent_id"), "forum_posts", ["parent_id"], unique=False)
        op.create_index(op.f("ix_forum_posts_status"), "forum_posts", ["status"], unique=False)
        op.create_index(op.f("ix_forum_posts_user_identifier"), "forum_posts", ["user_identifier"], unique=False)

    # ---- add FK: forum_threads.last_post_id -> forum_posts.id ----
    # 迁移重跑/部分成功时，可能已存在约束；这里用 try/except 降级。
    if "forum_threads" in inspector.get_table_names() and "forum_posts" in inspector.get_table_names():
        try:
            op.create_foreign_key(
                "fk_forum_threads_last_post_id_forum_posts",
                source_table="forum_threads",
                referent_table="forum_posts",
                local_cols=["last_post_id"],
                remote_cols=["id"],
                ondelete="SET NULL",
            )
        except Exception:
            pass

    # ---- seed default categories ----
    # Only seed if table exists and is empty.
    if "forum_categories" in inspector.get_table_names():
        try:
            count = bind.execute(sa.text("SELECT COUNT(*) FROM forum_categories")).scalar()  # type: ignore
        except Exception:
            count = None
        if count == 0:
            category_table = sa.table(
                "forum_categories",
                sa.column("id", sa.Integer()),
                sa.column("name", sa.String()),
                sa.column("slug", sa.String()),
                sa.column("sort_order", sa.Integer()),
                sa.column("is_active", sa.Boolean()),
            )
            op.bulk_insert(
                category_table,
                [
                    {
                        "id": item["id"],
                        "name": item["name"],
                        "slug": item["slug"],
                        "sort_order": item["sort_order"],
                        "is_active": True,
                    }
                    for item in _DEFAULT_CATEGORIES
                ],
            )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    tables = inspector.get_table_names()

    # Drop in reverse dependency order
    if "forum_posts" in tables:
        op.drop_index(op.f("ix_forum_posts_user_identifier"), table_name="forum_posts")
        op.drop_index(op.f("ix_forum_posts_status"), table_name="forum_posts")
        op.drop_index(op.f("ix_forum_posts_parent_id"), table_name="forum_posts")
        op.drop_index(op.f("ix_forum_posts_thread_id"), table_name="forum_posts")
        op.drop_table("forum_posts")

    if "forum_threads" in tables:
        op.drop_index(op.f("ix_forum_threads_user_identifier"), table_name="forum_threads")
        op.drop_index(op.f("ix_forum_threads_status"), table_name="forum_threads")
        op.drop_index(op.f("ix_forum_threads_last_post_at"), table_name="forum_threads")
        op.drop_index(op.f("ix_forum_threads_last_post_id"), table_name="forum_threads")
        op.drop_index(op.f("ix_forum_threads_category_id"), table_name="forum_threads")
        op.drop_table("forum_threads")

    if "forum_categories" in tables:
        op.drop_index(op.f("ix_forum_categories_name"), table_name="forum_categories")
        op.drop_table("forum_categories")

    # Drop enums if present
    if bind.dialect.name == "postgresql":
        # Not used in this repo (MySQL), but keep safe.
        op.execute("DROP TYPE IF EXISTS forum_post_status_enum")
        op.execute("DROP TYPE IF EXISTS forum_thread_status_enum")
