"""The cleaning buffer of a flat in minutes, in steps of 15, instead of whole hours.

A flat's buffer in hours becomes the same time in minutes; no buffer stays none.

Revision ID: 045_buffer_minutes
Revises: 044_hourly_listing_urls
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "045_buffer_minutes"
down_revision: Union[str, None] = "044_hourly_listing_urls"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("properties", sa.Column("buffer_minutes", sa.Integer(), nullable=True))
    op.execute("UPDATE properties SET buffer_minutes = buffer_hours * 60 WHERE buffer_hours IS NOT NULL")
    op.drop_column("properties", "buffer_hours")


def downgrade() -> None:
    op.add_column("properties", sa.Column("buffer_hours", sa.Integer(), nullable=True))
    # Rounded up: a 30-minute buffer keeps at least its time as one hour.
    op.execute("UPDATE properties SET buffer_hours = CEIL(buffer_minutes / 60.0) WHERE buffer_minutes IS NOT NULL")
    op.drop_column("properties", "buffer_minutes")
