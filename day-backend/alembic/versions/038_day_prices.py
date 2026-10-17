"""A price for one night set on the calendar, as Airbnb's custom nightly price.

A new table; nothing existing changes.

Revision ID: 038_day_prices
Revises: 037_property_blocks
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "038_day_prices"
down_revision: Union[str, None] = "037_property_blocks"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "property_day_prices",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("company_id", sa.Uuid(), sa.ForeignKey("companies.id"), nullable=False),
        sa.Column("property_id", sa.Uuid(), sa.ForeignKey("properties.id", ondelete="CASCADE"), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("price", sa.Numeric(12, 2), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("property_id", "date", name="uq_property_day_prices_night"),
        sa.CheckConstraint("price > 0", name="ck_property_day_prices_price"),
    )
    op.create_index("ix_property_day_prices_company_id", "property_day_prices", ["company_id"])


def downgrade() -> None:
    op.drop_index("ix_property_day_prices_company_id", table_name="property_day_prices")
    op.drop_table("property_day_prices")
