"""The asking system's id on a personal link, carried to the booking made by it.

A nullable column on guest_offers; nothing existing changes.

Revision ID: 050_offer_external_id
Revises: 049_company_facts
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "050_offer_external_id"
down_revision: Union[str, None] = "049_company_facts"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("guest_offers", sa.Column("external_id", sa.String(255), nullable=True))


def downgrade() -> None:
    op.drop_column("guest_offers", "external_id")
