"""channex context: connections, listings, inbound booking events

Revision ID: 014_channex
Revises: 013_messaging
Create Date: 2026-08-21 12:00:00.000000

Channel manager (Channex) integration:

  * ``channex_connections`` — one Channex group per company (tenant).
  * ``channex_listings`` — a property mirrored into Channex as
    property + room type (count_of_rooms=1) + rate plan (per_room).
  * ``channex_booking_events`` — inbound booking revisions; unique
    ``revision_id`` makes webhook redelivery and feed re-reads idempotent.
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "014_channex"
down_revision: Union[str, None] = "013_messaging"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "channex_connections",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("company_id", sa.Uuid(), nullable=False, unique=True, index=True),
        sa.Column("channex_group_id", sa.String(64), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "channex_listings",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("company_id", sa.Uuid(), nullable=False, index=True),
        sa.Column(
            "property_id",
            sa.Uuid(),
            sa.ForeignKey("properties.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
            index=True,
        ),
        sa.Column("channex_property_id", sa.String(64), nullable=False, server_default="", index=True),
        sa.Column("channex_room_type_id", sa.String(64), nullable=False, server_default=""),
        sa.Column("channex_rate_plan_id", sa.String(64), nullable=False, server_default=""),
        sa.Column("sync_state", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("last_synced_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "channex_booking_events",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("company_id", sa.Uuid(), nullable=False, index=True),
        sa.Column("property_id", sa.Uuid(), nullable=False, index=True),
        sa.Column(
            "booking_id",
            sa.Uuid(),
            sa.ForeignKey("bookings.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        ),
        sa.Column("revision_id", sa.String(64), nullable=False, unique=True, index=True),
        sa.Column("channex_booking_id", sa.String(64), nullable=False, server_default=""),
        sa.Column("unique_id", sa.String(128), nullable=False, server_default="", index=True),
        sa.Column("ota_name", sa.String(64), nullable=False, server_default=""),
        sa.Column("status", sa.String(20), nullable=False, server_default="new"),
        sa.Column("payload", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("acked_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("channex_booking_events")
    op.drop_table("channex_listings")
    op.drop_table("channex_connections")
