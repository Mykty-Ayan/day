"""Hourly tariffs on a flat's pricing: 3 hours, 6 hours and the night, each with a
weekend price, and the late hours that turn hours into the night.

Nine columns on pricing_configs. Prices default to 0 (the tariff is off), so
every flat keeps counting hours at its hourly price until a tariff is set.

Revision ID: 057_hourly_tariffs
Revises: 056_guest_orders
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "057_hourly_tariffs"
down_revision: Union[str, None] = "056_guest_orders"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

PRICES = ("price_3h", "price_3h_weekend", "price_6h", "price_6h_weekend", "price_night", "price_night_weekend")


def upgrade() -> None:
    for name in PRICES:
        op.add_column("pricing_configs", sa.Column(name, sa.Numeric(12, 2), nullable=False, server_default="0"))
    op.add_column("pricing_configs", sa.Column("late_from", sa.Time(), nullable=False, server_default="23:00"))
    op.add_column("pricing_configs", sa.Column("night_to", sa.Time(), nullable=False, server_default="10:00"))
    op.add_column("pricing_configs", sa.Column("night_max_hours", sa.Integer(), nullable=False, server_default="12"))


def downgrade() -> None:
    for name in ("night_max_hours", "night_to", "late_from", *reversed(PRICES)):
        op.drop_column("pricing_configs", name)
