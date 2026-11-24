"""Places near a flat for the guest: a shop, a park, the airport, and how far.

properties gets nearby, a list empty for every flat.

Revision ID: 064_property_nearby
Revises: 063_check_in_videos
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "064_property_nearby"
down_revision: Union[str, None] = "063_check_in_videos"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("properties", sa.Column("nearby", sa.JSON(), nullable=False, server_default="[]"))


def downgrade() -> None:
    op.drop_column("properties", "nearby")
