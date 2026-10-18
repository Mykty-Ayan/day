"""Links to an apartment's listings (Krisha, Booking, Airbnb, OLX), for the CRM to
find the flat by the link a guest sends.

An empty list for the existing flats: a constant default, so the table is not rewritten.

Revision ID: 036_listing_urls
Revises: 035_stay_rules
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "036_listing_urls"
down_revision: Union[str, None] = "035_stay_rules"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("properties", sa.Column("listing_urls", sa.JSON(), nullable=False, server_default="[]"))


def downgrade() -> None:
    op.drop_column("properties", "listing_urls")
