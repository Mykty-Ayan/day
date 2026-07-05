"""hourly rental core: rental_mode, hourly_price, datetime booking columns

Revision ID: 011_hourly_rental_core
Revises: 010_auth_tables
Create Date: 2026-07-05 12:00:00.000000

Adds the foundation for hourly + daily rental in a single model:
  * ``properties.rental_mode`` and ``bookings.rental_mode`` (daily|hourly|both)
  * ``pricing_configs.hourly_price`` alongside the existing daily ``base_price``
  * ``bookings.check_in`` / ``check_out`` promoted from ``date`` to ``timestamp``

Existing daily bookings are backfilled with the default clock times
(14:00 check-in / 12:00 check-out) so their nightly totals are unchanged.

NOTE: the downgrade casts ``timestamp`` back to ``date``, which irreversibly
drops the time-of-day component. Any hourly bookings created after this
migration will lose their start/end times on downgrade.
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "011_hourly_rental_core"
down_revision: Union[str, None] = "010_auth_tables"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "properties",
        sa.Column("rental_mode", sa.String(20), nullable=False, server_default="daily"),
    )
    op.add_column(
        "pricing_configs",
        sa.Column("hourly_price", sa.Numeric(12, 2), nullable=False, server_default="0"),
    )
    op.add_column(
        "bookings",
        sa.Column("rental_mode", sa.String(20), nullable=False, server_default="daily"),
    )

    # Promote booking date columns to timestamp, backfilling default clock times
    # so existing daily bookings keep identical nightly spans.
    op.execute(
        "ALTER TABLE bookings "
        "ALTER COLUMN check_in TYPE timestamp USING (check_in + time '14:00')"
    )
    op.execute(
        "ALTER TABLE bookings "
        "ALTER COLUMN check_out TYPE timestamp USING (check_out + time '12:00')"
    )


def downgrade() -> None:
    # Irreversible time loss: the time-of-day component is dropped here.
    op.execute(
        "ALTER TABLE bookings ALTER COLUMN check_in TYPE date USING check_in::date"
    )
    op.execute(
        "ALTER TABLE bookings ALTER COLUMN check_out TYPE date USING check_out::date"
    )

    op.drop_column("bookings", "rental_mode")
    op.drop_column("pricing_configs", "hourly_price")
    op.drop_column("properties", "rental_mode")
