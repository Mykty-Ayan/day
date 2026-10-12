"""Idempotency-Keys a client gave up on.

The Mini App (and the CRM) may send a booking or a payment and get no answer.
To start afresh it must know the first request will never land. Voiding its key
under the key's lock settles that: either the request already made its record,
or the key is kept here and a late request with it is refused.

Revision ID: 032_voided_idempotency_keys
Revises: 031_conversation_per_company
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "032_voided_idempotency_keys"
down_revision: Union[str, None] = "031_conversation_per_company"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "voided_idempotency_keys",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("company_id", sa.Uuid(), nullable=False),
        sa.Column("booking_id", sa.Uuid(), sa.ForeignKey("bookings.id", ondelete="CASCADE"), nullable=True),
        sa.Column("key", sa.String(255), nullable=False),
        sa.Column("voided_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_voided_idempotency_keys_company_id", "voided_idempotency_keys", ["company_id"])
    # A booking key is per company, a payment key per booking.
    op.create_index(
        "uq_voided_booking_keys",
        "voided_idempotency_keys",
        ["company_id", "key"],
        unique=True,
        postgresql_where=sa.text("booking_id IS NULL"),
    )
    op.create_index(
        "uq_voided_payment_keys",
        "voided_idempotency_keys",
        ["booking_id", "key"],
        unique=True,
        postgresql_where=sa.text("booking_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_table("voided_idempotency_keys")
