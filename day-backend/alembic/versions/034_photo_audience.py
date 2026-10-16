"""Who may see a photo of an apartment: everyone (the listing) or only a guest (check-in instructions).

Existing photos are listing photos.

Revision ID: 034_photo_audience
Revises: 033_property_links
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "034_photo_audience"
down_revision: Union[str, None] = "033_property_links"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "property_photos",
        sa.Column("audience", sa.String(20), nullable=False, server_default="public"),
    )


def downgrade() -> None:
    op.drop_column("property_photos", "audience")
