"""The company's expenses: category, amount, day, the flat (rent always has one).

A new table; nothing existing changes.

Revision ID: 046_expenses
Revises: 045_buffer_minutes
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "046_expenses"
down_revision: Union[str, None] = "045_buffer_minutes"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "expenses",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("company_id", sa.Uuid(), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False),
        sa.Column("property_id", sa.Uuid(), sa.ForeignKey("properties.id", ondelete="SET NULL"), nullable=True),
        sa.Column("category", sa.String(32), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("spent_on", sa.Date(), nullable=False),
        sa.Column("payee", sa.String(200), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("voided_at", sa.DateTime(), nullable=True),
        sa.Column("voided_by", sa.Uuid(), nullable=True),
        sa.CheckConstraint("amount > 0", name="ck_expenses_amount_positive"),
    )
    op.create_index("ix_expenses_company_spent_on", "expenses", ["company_id", "spent_on"])


def downgrade() -> None:
    op.drop_index("ix_expenses_company_spent_on", table_name="expenses")
    op.drop_table("expenses")
