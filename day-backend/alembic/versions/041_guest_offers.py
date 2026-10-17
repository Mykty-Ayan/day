"""Personal links for guests (/o/<code>): flats for a guest's dates, sent by aidyn.

A new table; nothing existing changes.

Revision ID: 041_guest_offers
Revises: 040_public_codes
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "041_guest_offers"
down_revision: Union[str, None] = "040_public_codes"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "guest_offers",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("company_id", sa.Uuid(), sa.ForeignKey("companies.id"), nullable=False),
        sa.Column("code", sa.String(16), nullable=False),
        sa.Column("guest_name", sa.String(255), nullable=False),
        sa.Column("guest_phone", sa.String(50), nullable=False),
        sa.Column("check_in", sa.Date(), nullable=False),
        sa.Column("check_out", sa.Date(), nullable=False),
        sa.Column("guests", sa.Integer(), nullable=False),
        sa.Column("property_ids", sa.JSON(), nullable=False),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("code", name="uq_guest_offers_code"),
        sa.CheckConstraint("check_out > check_in", name="ck_guest_offers_nights"),
    )
    op.create_index("ix_guest_offers_company_id", "guest_offers", ["company_id"])


def downgrade() -> None:
    op.drop_index("ix_guest_offers_company_id", table_name="guest_offers")
    op.drop_table("guest_offers")
