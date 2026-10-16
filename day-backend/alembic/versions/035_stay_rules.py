"""Stay rules of an apartment: fewest and most nights, hours kept free around an
hourly booking, hours a stay must be booked ahead.

All columns are empty for the existing flats: no rule, nothing existing changes.

Revision ID: 035_stay_rules
Revises: 034_photo_audience
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "035_stay_rules"
down_revision: Union[str, None] = "034_photo_audience"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("properties", sa.Column("min_nights", sa.Integer(), nullable=True))
    op.add_column("properties", sa.Column("max_nights", sa.Integer(), nullable=True))
    op.add_column("properties", sa.Column("buffer_hours", sa.Integer(), nullable=True))
    op.add_column("properties", sa.Column("min_lead_hours", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("properties", "min_lead_hours")
    op.drop_column("properties", "buffer_hours")
    op.drop_column("properties", "max_nights")
    op.drop_column("properties", "min_nights")
