"""Platforms' iCal calendars read into Day: each event closes the flat's nights.

A new table, calendar_feeds; property_blocks gains the calendar and its event
for the blocks taken from one. Existing blocks stay as they are (both null).

Revision ID: 039_calendar_feeds
Revises: 038_day_prices
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "039_calendar_feeds"
down_revision: Union[str, None] = "038_day_prices"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "calendar_feeds",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("company_id", sa.Uuid(), sa.ForeignKey("companies.id"), nullable=False),
        sa.Column("property_id", sa.Uuid(), sa.ForeignKey("properties.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("last_synced_at", sa.DateTime(), nullable=True),
        sa.Column("last_error", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("property_id", "url", name="uq_calendar_feeds_url"),
    )
    op.create_index("ix_calendar_feeds_company_id", "calendar_feeds", ["company_id"])
    op.create_index("ix_calendar_feeds_property_id", "calendar_feeds", ["property_id"])
    op.add_column(
        "property_blocks",
        sa.Column("feed_id", sa.Uuid(), sa.ForeignKey("calendar_feeds.id", ondelete="CASCADE"), nullable=True),
    )
    op.add_column("property_blocks", sa.Column("external_uid", sa.String(500), nullable=True))
    op.create_index("ix_property_blocks_feed_id", "property_blocks", ["feed_id"])
    op.create_unique_constraint("uq_property_blocks_feed_event", "property_blocks", ["feed_id", "external_uid"])


def downgrade() -> None:
    op.drop_constraint("uq_property_blocks_feed_event", "property_blocks", type_="unique")
    op.drop_index("ix_property_blocks_feed_id", table_name="property_blocks")
    op.drop_column("property_blocks", "external_uid")
    op.drop_column("property_blocks", "feed_id")
    op.drop_index("ix_calendar_feeds_property_id", table_name="calendar_feeds")
    op.drop_index("ix_calendar_feeds_company_id", table_name="calendar_feeds")
    op.drop_table("calendar_feeds")
