"""A company's public site: its address, its look and how a guest reaches it.

A new table, one row a company at most; nothing existing changes.

Revision ID: 052_company_sites
Revises: 051_hourly_offers
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "052_company_sites"
down_revision: Union[str, None] = "051_hourly_offers"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "company_sites",
        sa.Column("company_id", sa.Uuid(), sa.ForeignKey("companies.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("slug", sa.String(40), nullable=False, unique=True),
        sa.Column("title", sa.String(120), nullable=False),
        sa.Column("about", sa.Text(), nullable=True),
        sa.Column("logo_url", sa.String(1024), nullable=True),
        sa.Column("cover_url", sa.String(1024), nullable=True),
        sa.Column("accent_color", sa.String(7), nullable=True),
        sa.Column("whatsapp", sa.String(20), nullable=True),
        sa.Column("instagram", sa.String(60), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("company_sites")
