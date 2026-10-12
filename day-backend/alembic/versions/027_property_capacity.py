"""An apartment says how many guests it takes and how many bathrooms it has.

Both are what Airbnb and Booking.com ask first. The Channex onboarding used
the bed count as the guest limit, which undercounts any flat with a double
bed. Both stay empty until the owner fills them in: guessing would be worse.

Revision ID: 027_property_capacity
Revises: 026_user_token_version
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "027_property_capacity"
down_revision: Union[str, None] = "026_user_token_version"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("properties", sa.Column("max_guests", sa.Integer(), nullable=True))
    op.add_column("properties", sa.Column("bathrooms", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("properties", "bathrooms")
    op.drop_column("properties", "max_guests")
