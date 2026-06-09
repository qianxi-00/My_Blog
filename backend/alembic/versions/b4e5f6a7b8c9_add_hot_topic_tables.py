"""add hot topic tables

Revision ID: b4e5f6a7b8c9
Revises: a1b2c3d4e5f6
Create Date: 2026-03-19

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = "b4e5f6a7b8c9"
down_revision: Union[str, None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    tables = inspector.get_table_names()

    if "hot_topics" not in tables:
        op.create_table(
            "hot_topics",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("topic_date", sa.Date(), nullable=False),
            sa.Column("title", sa.String(length=220), nullable=False),
            sa.Column("slug", sa.String(length=220), nullable=False),
            sa.Column("summary", sa.Text(), nullable=True),
            sa.Column("analysis_md", sa.Text(), nullable=True),
            sa.Column("key_points_json", sa.JSON(), nullable=True),
            sa.Column("heat_score", sa.Numeric(6, 2), nullable=False, server_default="0"),
            sa.Column(
                "status",
                sa.Enum("draft", "published", "hidden", name="hot_topic_status_enum"),
                nullable=False,
                server_default="draft",
            ),
            sa.Column("article_id", sa.Integer(), nullable=True),
            sa.Column("primary_category", sa.String(length=50), nullable=True),
            sa.Column("published_at", sa.DateTime(), nullable=True),
            sa.Column("created_by", sa.Integer(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.ForeignKeyConstraint(["article_id"], ["articles.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["created_by"], ["admins.id"], ondelete="SET NULL"),
            sa.UniqueConstraint("slug", name="uq_hot_topics_slug"),
            sa.UniqueConstraint("article_id", name="uq_hot_topics_article_id"),
        )
        op.create_index(op.f("ix_hot_topics_topic_date"), "hot_topics", ["topic_date"], unique=False)
        op.create_index(op.f("ix_hot_topics_slug"), "hot_topics", ["slug"], unique=True)
        op.create_index(op.f("ix_hot_topics_status"), "hot_topics", ["status"], unique=False)
        op.create_index(op.f("ix_hot_topics_article_id"), "hot_topics", ["article_id"], unique=True)
        op.create_index(op.f("ix_hot_topics_primary_category"), "hot_topics", ["primary_category"], unique=False)
        op.create_index(op.f("ix_hot_topics_created_by"), "hot_topics", ["created_by"], unique=False)

    if "hot_topic_sources" not in tables:
        op.create_table(
            "hot_topic_sources",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("topic_id", sa.Integer(), nullable=False),
            sa.Column(
                "source_type",
                sa.Enum("rss", "api", "manual", name="hot_source_type_enum"),
                nullable=False,
                server_default="rss",
            ),
            sa.Column("source_name", sa.String(length=100), nullable=False),
            sa.Column("source_domain", sa.String(length=120), nullable=True),
            sa.Column("source_url", sa.String(length=1000), nullable=False),
            sa.Column("original_title", sa.String(length=300), nullable=True),
            sa.Column("published_at", sa.DateTime(), nullable=True),
            sa.Column("content_snippet", sa.Text(), nullable=True),
            sa.Column("dedupe_hash", sa.String(length=64), nullable=True),
            sa.Column("quality_score", sa.Numeric(5, 2), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.ForeignKeyConstraint(["topic_id"], ["hot_topics.id"], ondelete="CASCADE"),
        )
        op.create_index(op.f("ix_hot_topic_sources_topic_id"), "hot_topic_sources", ["topic_id"], unique=False)
        op.create_index(op.f("ix_hot_topic_sources_source_domain"), "hot_topic_sources", ["source_domain"], unique=False)
        op.create_index(op.f("ix_hot_topic_sources_dedupe_hash"), "hot_topic_sources", ["dedupe_hash"], unique=False)

    if "hot_topic_tags" not in tables:
        op.create_table(
            "hot_topic_tags",
            sa.Column("topic_id", sa.Integer(), nullable=False),
            sa.Column("tag_id", sa.Integer(), nullable=False),
            sa.ForeignKeyConstraint(["topic_id"], ["hot_topics.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["tag_id"], ["tags.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("topic_id", "tag_id"),
        )

    if "hot_fetch_jobs" not in tables:
        op.create_table(
            "hot_fetch_jobs",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("run_date", sa.Date(), nullable=False),
            sa.Column(
                "trigger_mode",
                sa.Enum("manual", "scheduled", name="hot_fetch_trigger_mode_enum"),
                nullable=False,
                server_default="manual",
            ),
            sa.Column(
                "status",
                sa.Enum("running", "success", "partial", "failed", name="hot_fetch_job_status_enum"),
                nullable=False,
                server_default="running",
            ),
            sa.Column("source_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("candidate_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("selected_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("error_message", sa.Text(), nullable=True),
            sa.Column("started_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("finished_at", sa.DateTime(), nullable=True),
        )
        op.create_index(op.f("ix_hot_fetch_jobs_run_date"), "hot_fetch_jobs", ["run_date"], unique=False)
        op.create_index(op.f("ix_hot_fetch_jobs_status"), "hot_fetch_jobs", ["status"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    tables = inspector.get_table_names()

    if "hot_fetch_jobs" in tables:
        op.drop_index(op.f("ix_hot_fetch_jobs_status"), table_name="hot_fetch_jobs")
        op.drop_index(op.f("ix_hot_fetch_jobs_run_date"), table_name="hot_fetch_jobs")
        op.drop_table("hot_fetch_jobs")

    if "hot_topic_tags" in tables:
        op.drop_table("hot_topic_tags")

    if "hot_topic_sources" in tables:
        op.drop_index(op.f("ix_hot_topic_sources_dedupe_hash"), table_name="hot_topic_sources")
        op.drop_index(op.f("ix_hot_topic_sources_source_domain"), table_name="hot_topic_sources")
        op.drop_index(op.f("ix_hot_topic_sources_topic_id"), table_name="hot_topic_sources")
        op.drop_table("hot_topic_sources")

    if "hot_topics" in tables:
        op.drop_index(op.f("ix_hot_topics_created_by"), table_name="hot_topics")
        op.drop_index(op.f("ix_hot_topics_primary_category"), table_name="hot_topics")
        op.drop_index(op.f("ix_hot_topics_article_id"), table_name="hot_topics")
        op.drop_index(op.f("ix_hot_topics_status"), table_name="hot_topics")
        op.drop_index(op.f("ix_hot_topics_slug"), table_name="hot_topics")
        op.drop_index(op.f("ix_hot_topics_topic_date"), table_name="hot_topics")
        op.drop_table("hot_topics")

    if bind.dialect.name == "postgresql":
        op.execute("DROP TYPE IF EXISTS hot_fetch_job_status_enum")
        op.execute("DROP TYPE IF EXISTS hot_fetch_trigger_mode_enum")
        op.execute("DROP TYPE IF EXISTS hot_source_type_enum")
        op.execute("DROP TYPE IF EXISTS hot_topic_status_enum")
