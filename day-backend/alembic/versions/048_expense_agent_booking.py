"""The agent and the booking an expense was paid for.

Two nullable columns on expenses; nothing existing changes.

Revision ID: 048_expense_agent_booking
Revises: 047_agents
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "048_expense_agent_booking"
down_revision: Union[str, None] = "047_agents"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "expenses",
        sa.Column("agent_id", sa.Uuid(), sa.ForeignKey("agents.id", name="fk_expenses_agent_id", ondelete="SET NULL"),
                  nullable=True),
    )
    op.add_column(
        "expenses",
        sa.Column("booking_id", sa.Uuid(),
                  sa.ForeignKey("bookings.id", name="fk_expenses_booking_id", ondelete="SET NULL"), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("expenses", "booking_id")
    op.drop_column("expenses", "agent_id")
