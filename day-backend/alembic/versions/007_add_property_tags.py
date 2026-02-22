"""add property tags

Revision ID: 007_property_tags
Revises: 006_ai_migration
Create Date: 2026-02-22 10:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "007_property_tags"
down_revision: Union[str, None] = "006_ai_migration"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "property_tags",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("company_id", sa.Uuid(), nullable=False, index=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("color", sa.String(20), nullable=False, server_default="#3B82F6"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("company_id", "name", name="uq_property_tag_company_name"),
    )

    op.create_table(
        "property_tag_associations",
        sa.Column(
            "property_id",
            sa.Uuid(),
            sa.ForeignKey("properties.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "tag_id",
            sa.Uuid(),
            sa.ForeignKey("property_tags.id", ondelete="CASCADE"),
            primary_key=True,
        ),
    )


def downgrade() -> None:
    op.drop_table("property_tag_associations")
    op.drop_table("property_tags")
