"""add_booking_domain_tables

Revision ID: a2b3c4d5e6f7
Revises: 1337dbb9c2ee
Create Date: 2026-02-08 23:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a2b3c4d5e6f7'
down_revision: Union[str, None] = '1337dbb9c2ee'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- guests ---
    op.create_table(
        "guests",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("company_id", sa.Uuid(), nullable=False, index=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("phone", sa.String(50), nullable=True),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    # --- group_bookings ---
    op.create_table(
        "group_bookings",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("company_id", sa.Uuid(), nullable=False, index=True),
        sa.Column("adults_count", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("children_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("status", sa.String(50), nullable=False, server_default="pending"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    # --- bookings ---
    op.create_table(
        "bookings",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("company_id", sa.Uuid(), nullable=False, index=True),
        sa.Column("property_id", sa.Uuid(), sa.ForeignKey("properties.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("guest_id", sa.Uuid(), sa.ForeignKey("guests.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("group_booking_id", sa.Uuid(), sa.ForeignKey("group_bookings.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("check_in", sa.Date(), nullable=False),
        sa.Column("check_out", sa.Date(), nullable=False),
        sa.Column("source", sa.String(50), nullable=False, server_default="direct"),
        sa.Column("status", sa.String(50), nullable=False, server_default="pending"),
        sa.Column("gantt_color", sa.String(20), nullable=False, server_default="#3B82F6"),
        sa.Column("gantt_icon", sa.String(50), nullable=True),
        sa.Column("total_price", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("calculated_price", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("adults_count", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("children_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    # --- booking_payments ---
    op.create_table(
        "booking_payments",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("booking_id", sa.Uuid(), sa.ForeignKey("bookings.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("type", sa.String(50), nullable=False, server_default="payment"),
        sa.Column("method", sa.String(50), nullable=False, server_default="cash"),
        sa.Column("status", sa.String(50), nullable=False, server_default="pending"),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("paid_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    # --- booking_deposits ---
    op.create_table(
        "booking_deposits",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("booking_id", sa.Uuid(), sa.ForeignKey("bookings.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("status", sa.String(50), nullable=False, server_default="pending"),
        sa.Column("held_amount", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    # --- booking_files ---
    op.create_table(
        "booking_files",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("booking_id", sa.Uuid(), sa.ForeignKey("bookings.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("file_url", sa.String(1024), nullable=False),
        sa.Column("file_name", sa.String(255), nullable=False),
        sa.Column("file_type", sa.String(100), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    # --- booking_comments ---
    op.create_table(
        "booking_comments",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("booking_id", sa.Uuid(), sa.ForeignKey("bookings.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("author_id", sa.Uuid(), nullable=True),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    # --- booking_contracts ---
    op.create_table(
        "booking_contracts",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("booking_id", sa.Uuid(), sa.ForeignKey("bookings.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("template_url", sa.String(1024), nullable=True),
        sa.Column("generated_url", sa.String(1024), nullable=True),
        sa.Column("status", sa.String(50), nullable=False, server_default="draft"),
        sa.Column("signed_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    # --- booking_audit_logs ---
    op.create_table(
        "booking_audit_logs",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("booking_id", sa.Uuid(), sa.ForeignKey("bookings.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("changed_by", sa.Uuid(), nullable=True),
        sa.Column("field_name", sa.String(255), nullable=False),
        sa.Column("old_value", sa.Text(), nullable=True),
        sa.Column("new_value", sa.Text(), nullable=True),
        sa.Column("action", sa.String(50), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("booking_audit_logs")
    op.drop_table("booking_contracts")
    op.drop_table("booking_comments")
    op.drop_table("booking_files")
    op.drop_table("booking_deposits")
    op.drop_table("booking_payments")
    op.drop_table("bookings")
    op.drop_table("group_bookings")
    op.drop_table("guests")
