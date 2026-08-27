"""What a flat costs its subletter, split fixed from marginal.

Until now the only cost the system knew was the OTA commission, so "profit" on
the analytics screen was revenue minus commission — a number that looks like
earnings and is not. Rent to the flat's owner is the largest outgoing a
subletter has, and none of it was recorded anywhere.

Revision ID: 016_property_costs
Revises: 015_property_wifi
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "016_property_costs"
down_revision: Union[str, None] = "015_property_wifi"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "property_costs",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("property_id", sa.UUID(), nullable=False),
        # Paid whether anyone sleeps there or not.
        sa.Column("monthly_rent", sa.Numeric(12, 2), server_default="0", nullable=False),
        sa.Column("monthly_utilities", sa.Numeric(12, 2), server_default="0", nullable=False),
        # Leaves the account because a guest came.
        sa.Column("cleaning_cost", sa.Numeric(12, 2), server_default="0", nullable=False),
        sa.Column("consumables_per_night", sa.Numeric(12, 2), server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        # One row per flat: costs are edited in place, not versioned. A history
        # of what rent used to be belongs in an audit log, not here, where it
        # would silently double every report.
        sa.ForeignKeyConstraint(["property_id"], ["properties.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("property_id"),
    )
    op.create_index("ix_property_costs_property_id", "property_costs", ["property_id"])


def downgrade() -> None:
    op.drop_index("ix_property_costs_property_id", table_name="property_costs")
    op.drop_table("property_costs")
