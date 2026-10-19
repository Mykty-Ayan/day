"""Agents who bring guests for a cut, and the agent of a booking.

A new table and a nullable column on bookings; nothing existing changes.

Revision ID: 047_agents
Revises: 046_expenses
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "047_agents"
down_revision: Union[str, None] = "046_expenses"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "agents",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("company_id", sa.Uuid(), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("phone", sa.String(32), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_agents_company_id", "agents", ["company_id"])
    op.add_column(
        "bookings",
        sa.Column("agent_id", sa.Uuid(), sa.ForeignKey("agents.id", name="fk_bookings_agent_id", ondelete="SET NULL"),
                  nullable=True),
    )


def downgrade() -> None:
    op.drop_column("bookings", "agent_id")
    op.drop_index("ix_agents_company_id", table_name="agents")
    op.drop_table("agents")
