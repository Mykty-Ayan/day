"""A booking remembers who asked for it and the key of the request that made it.

The CRM creates bookings over a network that drops answers, so it retries. The
Idempotency-Key of the create request is kept with the booking, unique per
company, so a retry finds the booking instead of making a second one. The hash
of the request body tells a retry from a reused key. external_id is the CRM's
own id for the booking (its deal id).

Revision ID: 019_booking_idempotency
Revises: 018_booking_no_overlap
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "019_booking_idempotency"
down_revision: Union[str, None] = "018_booking_no_overlap"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("bookings", sa.Column("external_id", sa.String(255), nullable=True))
    op.add_column("bookings", sa.Column("idempotency_key", sa.String(255), nullable=True))
    op.add_column("bookings", sa.Column("idempotency_hash", sa.String(64), nullable=True))
    op.create_index(
        "uq_bookings_company_idempotency_key",
        "bookings",
        ["company_id", "idempotency_key"],
        unique=True,
        postgresql_where=sa.text("idempotency_key IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_bookings_company_idempotency_key", table_name="bookings")
    op.drop_column("bookings", "idempotency_hash")
    op.drop_column("bookings", "idempotency_key")
    op.drop_column("bookings", "external_id")
