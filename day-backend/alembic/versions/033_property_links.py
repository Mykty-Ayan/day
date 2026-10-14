"""Links and building facts of an apartment: residential complex, floors, map, WhatsApp product, video.

All columns are empty for the existing flats, so nothing existing changes.

Revision ID: 033_property_links
Revises: 032_voided_idempotency_keys
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "033_property_links"
down_revision: Union[str, None] = "032_voided_idempotency_keys"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("properties", sa.Column("complex_name", sa.String(255), nullable=True))
    op.add_column("properties", sa.Column("floors_total", sa.Integer(), nullable=True))
    op.add_column("properties", sa.Column("map_url", sa.String(1024), nullable=True))
    op.add_column("properties", sa.Column("whatsapp_product_url", sa.String(1024), nullable=True))
    op.add_column("properties", sa.Column("video_url", sa.String(1024), nullable=True))


def downgrade() -> None:
    op.drop_column("properties", "video_url")
    op.drop_column("properties", "whatsapp_product_url")
    op.drop_column("properties", "map_url")
    op.drop_column("properties", "floors_total")
    op.drop_column("properties", "complex_name")
