"""Links to a flat's hourly listings, apart from the nightly ones in listing_urls:
the guest's link tells the CRM the flat and the kind of stay.

An empty list for the existing flats: a constant default, so the table is not rewritten.

Revision ID: 044_hourly_listing_urls
Revises: 043_hourly_deposit
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "044_hourly_listing_urls"
down_revision: Union[str, None] = "043_hourly_deposit"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("properties", sa.Column("hourly_listing_urls", sa.JSON(), nullable=False, server_default="[]"))


def downgrade() -> None:
    op.drop_column("properties", "hourly_listing_urls")
