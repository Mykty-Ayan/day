"""The company's rules for guests, one list for every flat.

A new table; nothing existing changes.

Revision ID: 049_company_facts
Revises: 048_expense_agent_booking
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "049_company_facts"
down_revision: Union[str, None] = "048_expense_agent_booking"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "company_facts",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("company_id", sa.Uuid(), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("audience", sa.String(20), nullable=False, server_default="public"),
        sa.Column("source", sa.String(20), nullable=False, server_default="user"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_company_facts_company_id", "company_facts", ["company_id"])


def downgrade() -> None:
    op.drop_index("ix_company_facts_company_id", table_name="company_facts")
    op.drop_table("company_facts")
