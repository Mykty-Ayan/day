"""A payment remembers who recorded it and the key of the request that made it.

As with bookings (019): the CRM retries, so the Idempotency-Key of the request
is kept with the payment, unique per booking, together with a hash of the body.
external_id is the CRM's or the bank's own id for the payment.

Revision ID: 022_payment_idempotency
Revises: 021_company_time_zone
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "022_payment_idempotency"
down_revision: Union[str, None] = "021_company_time_zone"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("booking_payments", sa.Column("external_id", sa.String(255), nullable=True))
    op.add_column("booking_payments", sa.Column("idempotency_key", sa.String(255), nullable=True))
    op.add_column("booking_payments", sa.Column("idempotency_hash", sa.String(64), nullable=True))
    op.create_index(
        "uq_booking_payments_booking_idempotency_key",
        "booking_payments",
        ["booking_id", "idempotency_key"],
        unique=True,
        postgresql_where=sa.text("idempotency_key IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_booking_payments_booking_idempotency_key", table_name="booking_payments")
    op.drop_column("booking_payments", "idempotency_hash")
    op.drop_column("booking_payments", "idempotency_key")
    op.drop_column("booking_payments", "external_id")
