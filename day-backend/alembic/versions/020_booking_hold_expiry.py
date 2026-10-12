"""A pending booking can hold its nights only until a set moment.

The CRM's AI holds dates at night and the owner confirms them in the morning.
expires_at (naive UTC) marks such a hold; a sweep inside the API cancels a
pending booking once it passes. The partial index serves only that sweep.

Revision ID: 020_booking_hold_expiry
Revises: 019_booking_idempotency
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "020_booking_hold_expiry"
down_revision: Union[str, None] = "019_booking_idempotency"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("bookings", sa.Column("expires_at", sa.DateTime(), nullable=True))
    op.create_index(
        "ix_bookings_pending_expires_at",
        "bookings",
        ["expires_at"],
        postgresql_where=sa.text("status = 'pending' AND expires_at IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_bookings_pending_expires_at", table_name="bookings")
    op.drop_column("bookings", "expires_at")
