"""Check-in videos and their places on the guest's booking page.

property_photos gets kind (photo or video) and section (path, door, howto). Every
photo there is a photo on the way to the door, as before.

Revision ID: 063_check_in_videos
Revises: 062_site_tagline
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "063_check_in_videos"
down_revision: Union[str, None] = "062_site_tagline"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("property_photos", sa.Column("kind", sa.String(10), nullable=False, server_default="photo"))
    op.add_column("property_photos", sa.Column("section", sa.String(10), nullable=False, server_default="path"))


def downgrade() -> None:
    op.drop_column("property_photos", "section")
    op.drop_column("property_photos", "kind")
