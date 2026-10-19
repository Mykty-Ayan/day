"""A personal link by the hour: its kind of stay and its local start and end.

Three columns on guest_offers; every link made before is by the night.

Revision ID: 051_hourly_offers
Revises: 050_offer_external_id
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "051_hourly_offers"
down_revision: Union[str, None] = "050_offer_external_id"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "guest_offers", sa.Column("rental_mode", sa.String(10), nullable=False, server_default="daily")
    )
    op.add_column("guest_offers", sa.Column("starts_at", sa.DateTime(), nullable=True))
    op.add_column("guest_offers", sa.Column("ends_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column("guest_offers", "ends_at")
    op.drop_column("guest_offers", "starts_at")
    op.drop_column("guest_offers", "rental_mode")
