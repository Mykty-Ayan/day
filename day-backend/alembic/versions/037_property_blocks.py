"""Nights a flat is closed without a booking: repairs, the owner's own guests, a stay sold elsewhere.

A new table; nothing existing changes.

Revision ID: 037_property_blocks
Revises: 036_listing_urls
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "037_property_blocks"
down_revision: Union[str, None] = "036_listing_urls"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "property_blocks",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("company_id", sa.Uuid(), sa.ForeignKey("companies.id"), nullable=False),
        sa.Column("property_id", sa.Uuid(), sa.ForeignKey("properties.id", ondelete="CASCADE"), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("starts_at", sa.DateTime(), nullable=False),
        sa.Column("ends_at", sa.DateTime(), nullable=False),
        sa.Column("reason", sa.String(255), nullable=True),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("end_date > start_date", name="ck_property_blocks_nights"),
    )
    op.create_index("ix_property_blocks_company_id", "property_blocks", ["company_id"])
    op.create_index("ix_property_blocks_property_id", "property_blocks", ["property_id"])


def downgrade() -> None:
    op.drop_index("ix_property_blocks_property_id", table_name="property_blocks")
    op.drop_index("ix_property_blocks_company_id", table_name="property_blocks")
    op.drop_table("property_blocks")
