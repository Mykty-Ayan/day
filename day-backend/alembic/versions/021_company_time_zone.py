"""A company names the clock its local times are on.

check_in and check_out are stored as the company's local time without a zone.
time_zone (IANA) says which zone that is, so an integration can turn them into
instants. Every company so far is in Almaty.

Revision ID: 021_company_time_zone
Revises: 020_booking_hold_expiry
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "021_company_time_zone"
down_revision: Union[str, None] = "020_booking_hold_expiry"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "company_settings",
        sa.Column("time_zone", sa.String(64), server_default="Asia/Almaty", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("company_settings", "time_zone")
