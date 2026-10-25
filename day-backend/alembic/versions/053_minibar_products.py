"""The minibar's catalogue: the products a guest may order.

A new table; nothing existing changes.

Revision ID: 053_minibar_products
Revises: 052_company_sites
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "053_minibar_products"
down_revision: Union[str, None] = "052_company_sites"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "products",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("company_id", sa.Uuid(), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("category", sa.String(40), nullable=False, server_default=""),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("photo_url", sa.String(1024), nullable=True),
        sa.Column("price", sa.Numeric(12, 2), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        # Below it the product goes on the list of what to buy; null: no threshold.
        sa.Column("par_level", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("archived_at", sa.DateTime(), nullable=True),
        sa.CheckConstraint("price >= 0", name="ck_products_price"),
        sa.CheckConstraint("par_level >= 0", name="ck_products_par_level"),
    )
    op.create_index("ix_products_company_id", "products", ["company_id"])


def downgrade() -> None:
    op.drop_index("ix_products_company_id", table_name="products")
    op.drop_table("products")
