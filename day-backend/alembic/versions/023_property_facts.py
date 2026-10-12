"""An apartment's knowledge base: short facts a guest may ask about.

The CRM's AI answers guests from them and adds a fact once the owner approves
it. audience says who may hear a fact: anyone (public) or only a guest with a
confirmed stay (guest: codes, passwords). source says whether a person or an
integration wrote it.

Revision ID: 023_property_facts
Revises: 022_payment_idempotency
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "023_property_facts"
down_revision: Union[str, None] = "022_payment_idempotency"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "property_facts",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("company_id", sa.UUID(), nullable=False),
        sa.Column("property_id", sa.UUID(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("audience", sa.String(20), server_default="guest", nullable=False),
        sa.Column("source", sa.String(20), server_default="user", nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["property_id"], ["properties.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_property_facts_company_id", "property_facts", ["company_id"])
    op.create_index("ix_property_facts_property_id", "property_facts", ["property_id"])


def downgrade() -> None:
    op.drop_index("ix_property_facts_property_id", table_name="property_facts")
    op.drop_index("ix_property_facts_company_id", table_name="property_facts")
    op.drop_table("property_facts")
