"""add_property_domain_tables

Revision ID: 1337dbb9c2ee
Revises:
Create Date: 2026-02-08 22:03:30.522179

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1337dbb9c2ee'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- properties ---
    op.create_table(
        "properties",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("company_id", sa.Uuid(), nullable=False, index=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("internal_name", sa.String(255), nullable=False),
        sa.Column("type", sa.String(50), nullable=False),
        sa.Column("status", sa.String(50), nullable=False, server_default="new"),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("source_url", sa.String(1024), nullable=True),
        sa.Column("latitude", sa.Float(), nullable=True),
        sa.Column("longitude", sa.Float(), nullable=True),
        sa.Column("address_full", sa.String(512), nullable=True),
        sa.Column("apartment_number", sa.String(50), nullable=True),
        sa.Column("entrance", sa.String(50), nullable=True),
        sa.Column("block", sa.String(50), nullable=True),
        sa.Column("floor", sa.Integer(), nullable=True),
        sa.Column("rooms", sa.Integer(), nullable=True),
        sa.Column("beds", sa.Integer(), nullable=True),
        sa.Column("area_living", sa.Float(), nullable=True),
        sa.Column("area_total", sa.Float(), nullable=True),
        sa.Column("check_in_instructions", sa.Text(), nullable=True),
        sa.Column("check_out_instructions", sa.Text(), nullable=True),
        sa.Column("house_rules", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("company_id", "internal_name", name="uq_property_company_internal_name"),
    )

    # --- property_photos ---
    op.create_table(
        "property_photos",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("property_id", sa.Uuid(), sa.ForeignKey("properties.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("url", sa.String(1024), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_cover", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    # --- amenities ---
    op.create_table(
        "amenities",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False, unique=True),
        sa.Column("icon", sa.String(255), nullable=True),
        sa.Column("category", sa.String(50), nullable=False),
    )

    # --- property_amenities ---
    op.create_table(
        "property_amenities",
        sa.Column("property_id", sa.Uuid(), sa.ForeignKey("properties.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("amenity_id", sa.Uuid(), sa.ForeignKey("amenities.id", ondelete="CASCADE"), primary_key=True),
    )

    # --- pricing_configs ---
    op.create_table(
        "pricing_configs",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("property_id", sa.Uuid(), sa.ForeignKey("properties.id", ondelete="CASCADE"), nullable=False, unique=True, index=True),
        sa.Column("base_price", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("weekend_markup", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("default_deposit", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("extra_adult_price", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("extra_child_price", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("base_guests", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    # --- seasonal_prices ---
    op.create_table(
        "seasonal_prices",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("pricing_config_id", sa.Uuid(), sa.ForeignKey("pricing_configs.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("price_per_night", sa.Numeric(12, 2), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    # --- discount_rules ---
    op.create_table(
        "discount_rules",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("pricing_config_id", sa.Uuid(), sa.ForeignKey("pricing_configs.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("min_nights", sa.Integer(), nullable=False),
        sa.Column("discount_percent", sa.Numeric(5, 2), nullable=False, server_default="0"),
        sa.Column("discount_fixed", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    # --- property_audit_logs ---
    op.create_table(
        "property_audit_logs",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("property_id", sa.Uuid(), sa.ForeignKey("properties.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("changed_by", sa.Uuid(), nullable=True),
        sa.Column("field_name", sa.String(255), nullable=False),
        sa.Column("old_value", sa.Text(), nullable=True),
        sa.Column("new_value", sa.Text(), nullable=True),
        sa.Column("action", sa.String(50), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("property_audit_logs")
    op.drop_table("discount_rules")
    op.drop_table("seasonal_prices")
    op.drop_table("pricing_configs")
    op.drop_table("property_amenities")
    op.drop_table("amenities")
    op.drop_table("property_photos")
    op.drop_table("properties")
