"""A minibar order's way to pay, chosen by the guest: invoice or booking.

guest_orders gets the way (invoice for the orders already made: a new company's
way) and when the host sent the Kaspi invoice; its status may now be
awaiting_payment.

Revision ID: 059_guest_order_billing
Revises: 058_minibar_settings
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "059_guest_order_billing"
down_revision: Union[str, None] = "058_minibar_settings"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("guest_orders", sa.Column("billing", sa.String(16), nullable=False, server_default="invoice"))
    op.add_column("guest_orders", sa.Column("invoiced_at", sa.DateTime(), nullable=True))
    op.create_check_constraint("ck_guest_orders_billing", "guest_orders", "billing IN ('invoice', 'booking')")


def downgrade() -> None:
    # The code before this revision knows no kaspi way to pay: a Kaspi invoice
    # paid goes back as a transfer.
    op.execute("UPDATE guest_orders SET payment_method = 'transfer' WHERE payment_method = 'kaspi'")
    # Before this revision there was no awaiting_payment: such an order goes back
    # to accepted, as the host confirmed it.
    op.execute("UPDATE guest_orders SET status = 'accepted' WHERE status = 'awaiting_payment'")
    op.drop_constraint("ck_guest_orders_billing", "guest_orders", type_="check")
    op.drop_column("guest_orders", "invoiced_at")
    op.drop_column("guest_orders", "billing")
