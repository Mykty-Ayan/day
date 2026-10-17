"""A personal link's booking: one link makes one booking at a time.

A nullable column on guest_offers; nothing existing changes.

Revision ID: 042_offer_bookings
Revises: 041_guest_offers
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "042_offer_bookings"
down_revision: Union[str, None] = "041_guest_offers"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "guest_offers",
        sa.Column(
            "booking_id",
            sa.Uuid(),
            sa.ForeignKey("bookings.id", name="fk_guest_offers_booking_id", ondelete="SET NULL"),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_constraint("fk_guest_offers_booking_id", "guest_offers", type_="foreignkey")
    op.drop_column("guest_offers", "booking_id")
