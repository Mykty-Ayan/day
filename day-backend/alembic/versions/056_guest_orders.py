"""Guests' minibar orders and their items; a sale in the stock's log points at its order.

Two new tables and a foreign key on stock_movements.order_id (empty until now).

Revision ID: 056_guest_orders
Revises: 055_guest_codes
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "056_guest_orders"
down_revision: Union[str, None] = "055_guest_codes"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "guest_orders",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("company_id", sa.Uuid(), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False),
        sa.Column("booking_id", sa.Uuid(), sa.ForeignKey("bookings.id", ondelete="CASCADE"), nullable=False),
        sa.Column("property_id", sa.Uuid(), sa.ForeignKey("properties.id", ondelete="CASCADE"), nullable=False),
        sa.Column("number", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="new"),
        sa.Column("total", sa.Numeric(12, 2), nullable=False),
        sa.Column("guest_note", sa.Text(), nullable=True),
        # null until delivered; paid, or on_booking («on the tab»: the guest owes it) and paid later.
        sa.Column("payment_status", sa.String(16), nullable=True),
        sa.Column("payment_method", sa.String(16), nullable=True),
        sa.Column("paid_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("accepted_at", sa.DateTime(), nullable=True),
        sa.Column("delivered_at", sa.DateTime(), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(), nullable=True),
        sa.Column("handled_by", sa.Uuid(), nullable=True),
        sa.UniqueConstraint("company_id", "number", name="uq_guest_orders_company_number"),
        sa.CheckConstraint("total >= 0", name="ck_guest_orders_total"),
        sa.CheckConstraint("payment_status IN ('paid', 'on_booking')", name="ck_guest_orders_payment_status"),
    )
    op.create_index("ix_guest_orders_company_created", "guest_orders", ["company_id", "created_at"])
    op.create_index("ix_guest_orders_booking_created", "guest_orders", ["booking_id", "created_at"])
    op.create_table(
        "guest_order_items",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("order_id", sa.Uuid(), sa.ForeignKey("guest_orders.id", ondelete="CASCADE"), nullable=False),
        sa.Column("product_id", sa.Uuid(), sa.ForeignKey("products.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("price", sa.Numeric(12, 2), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.CheckConstraint("quantity BETWEEN 1 AND 20", name="ck_guest_order_items_quantity"),
    )
    op.create_index("ix_guest_order_items_order_id", "guest_order_items", ["order_id"])
    op.create_foreign_key(
        "fk_stock_movements_order_id", "stock_movements", "guest_orders", ["order_id"], ["id"], ondelete="SET NULL"
    )


def downgrade() -> None:
    op.drop_constraint("fk_stock_movements_order_id", "stock_movements", type_="foreignkey")
    # The orders go; a sale keeps its quantity but no longer names one (else an
    # upgrade again would find it pointing at nothing).
    op.execute("UPDATE stock_movements SET order_id = NULL WHERE order_id IS NOT NULL")
    op.drop_index("ix_guest_order_items_order_id", table_name="guest_order_items")
    op.drop_table("guest_order_items")
    op.drop_index("ix_guest_orders_booking_created", table_name="guest_orders")
    op.drop_index("ix_guest_orders_company_created", table_name="guest_orders")
    op.drop_table("guest_orders")
