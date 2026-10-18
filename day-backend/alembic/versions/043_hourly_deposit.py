"""A deposit for a stay by the hour, apart from the nightly one (CRM item 17).

A column with a server default of 0 ("not set"); nothing existing changes.

Revision ID: 043_hourly_deposit
Revises: 042_offer_bookings
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "043_hourly_deposit"
down_revision: Union[str, None] = "042_offer_bookings"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "pricing_configs",
        sa.Column("hourly_deposit", sa.Numeric(12, 2), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("pricing_configs", "hourly_deposit")
