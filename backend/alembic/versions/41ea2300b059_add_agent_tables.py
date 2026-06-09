"""add_agent_tables

Revision ID: 41ea2300b059
Revises: d8e9f0a1b2c3
Create Date: 2026-02-12 15:53:58.098627

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '41ea2300b059'
down_revision: Union[str, None] = 'd8e9f0a1b2c3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 创建 Agent 会话表
    op.create_table('agent_sessions',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('title', sa.String(length=200), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=True),
    sa.PrimaryKeyConstraint('id')
    )
    # 创建 Agent 消息表
    op.create_table('agent_messages',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('session_id', sa.String(length=36), nullable=False),
    sa.Column('role', sa.Enum('user', 'assistant', 'system', 'tool', name='agent_role_enum'), nullable=False),
    sa.Column('content', sa.Text(), nullable=True),
    sa.Column('tool_calls', sa.JSON(), nullable=True),
    sa.Column('tool_call_id', sa.String(length=100), nullable=True),
    sa.Column('tool_name', sa.String(length=100), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['session_id'], ['agent_sessions.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_agent_messages_session_id'), 'agent_messages', ['session_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_agent_messages_session_id'), table_name='agent_messages')
    op.drop_table('agent_messages')
    op.drop_table('agent_sessions')
