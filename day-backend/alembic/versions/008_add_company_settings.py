"""add company settings

Revision ID: 008_company_settings
Revises: 007_property_tags
Create Date: 2026-02-22 10:30:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "008_company_settings"
down_revision: Union[str, None] = "007_property_tags"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "company_settings",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("company_id", sa.Uuid(), nullable=False, index=True),
        sa.Column("default_currency", sa.String(10), nullable=False, server_default="KZT"),
        sa.Column("default_language", sa.String(10), nullable=False, server_default="ru"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("company_id", name="uq_company_settings_company_id"),
    )


def downgrade() -> None:
    op.drop_table("company_settings")
