"""The minibar's stock: the log of each product's movements.

A new table; nothing existing changes. The stock is the sum of a product's
movements, never a column: two counts at once cannot overwrite each other.

Revision ID: 054_stock_movements
Revises: 053_minibar_products
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "054_stock_movements"
down_revision: Union[str, None] = "053_minibar_products"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "stock_movements",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("company_id", sa.Uuid(), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False),
        sa.Column("product_id", sa.Uuid(), sa.ForeignKey("products.id", ondelete="CASCADE"), nullable=False),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("unit_cost", sa.Numeric(12, 2), nullable=True),
        # A guest's order, for a sale: the orders' table comes with them.
        sa.Column("order_id", sa.Uuid(), nullable=True),
        sa.Column("expense_id", sa.Uuid(), sa.ForeignKey("expenses.id", ondelete="SET NULL"), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("quantity <> 0", name="ck_stock_movements_quantity"),
    )
    op.create_index("ix_stock_movements_company_product", "stock_movements", ["company_id", "product_id"])


def downgrade() -> None:
    op.drop_index("ix_stock_movements_company_product", table_name="stock_movements")
    op.drop_table("stock_movements")
