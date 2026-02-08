"""Add cleaning domain tables

Revision ID: c4d5e6f7a8b9
Revises: a2b3c4d5e6f7
Create Date: 2026-02-08 12:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c4d5e6f7a8b9"
down_revision: Union[str, None] = "a2b3c4d5e6f7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Cleaning Tasks
    op.create_table(
        "cleaning_tasks",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("company_id", sa.Uuid(), nullable=False, index=True),
        sa.Column(
            "property_id",
            sa.Uuid(),
            sa.ForeignKey("properties.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "booking_id",
            sa.Uuid(),
            sa.ForeignKey("bookings.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        ),
        sa.Column("cleaner_id", sa.Uuid(), nullable=True, index=True),
        sa.Column("type", sa.String(50), nullable=False, server_default="post_checkout"),
        sa.Column("status", sa.String(50), nullable=False, server_default="pending"),
        sa.Column("scheduled_date", sa.Date(), nullable=True),
        sa.Column("scheduled_time", sa.Time(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("verified_at", sa.DateTime(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )

    # Cleaning Checklist Templates
    op.create_table(
        "cleaning_checklist_templates",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("company_id", sa.Uuid(), nullable=False, index=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )

    # Cleaning Checklist Items
    op.create_table(
        "cleaning_checklist_items",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "template_id",
            sa.Uuid(),
            sa.ForeignKey("cleaning_checklist_templates.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
    )

    # Cleaning Reports
    op.create_table(
        "cleaning_reports",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "task_id",
            sa.Uuid(),
            sa.ForeignKey("cleaning_tasks.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("cleaner_id", sa.Uuid(), nullable=False, index=True),
        sa.Column("status", sa.String(50), nullable=False, server_default="submitted"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("submitted_at", sa.DateTime(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )

    # Cleaning Report Photos
    op.create_table(
        "cleaning_report_photos",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "report_id",
            sa.Uuid(),
            sa.ForeignKey("cleaning_reports.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("url", sa.String(1024), nullable=False),
        sa.Column("room_type", sa.String(50), nullable=False, server_default="other"),
        sa.Column("metadata_json", postgresql.JSONB(), nullable=True),
        sa.Column(
            "metadata_verified",
            sa.Boolean(),
            nullable=False,
            server_default="false",
        ),
    )

    # Cleaning Report Checklist
    op.create_table(
        "cleaning_report_checklist",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "report_id",
            sa.Uuid(),
            sa.ForeignKey("cleaning_reports.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("checklist_item_id", sa.Uuid(), nullable=False),
        sa.Column("is_done", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("note", sa.Text(), nullable=True),
    )

    # Cleaner Routes
    op.create_table(
        "cleaner_routes",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("company_id", sa.Uuid(), nullable=False, index=True),
        sa.Column("cleaner_id", sa.Uuid(), nullable=False, index=True),
        sa.Column("route_date", sa.Date(), nullable=False),
        sa.Column("ordered_task_ids", postgresql.JSONB(), nullable=True),
        sa.Column("route_polyline", postgresql.JSONB(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )

    # Cleaner Ratings
    op.create_table(
        "cleaner_ratings",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("company_id", sa.Uuid(), nullable=False, index=True),
        sa.Column("cleaner_id", sa.Uuid(), nullable=False, index=True),
        sa.Column(
            "task_id",
            sa.Uuid(),
            sa.ForeignKey("cleaning_tasks.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("rated_by", sa.Uuid(), nullable=True),
        sa.Column("score", sa.Integer(), nullable=False, server_default="5"),
        sa.Column("review", sa.Text(), nullable=True),
        sa.Column("kpi_metrics", postgresql.JSONB(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )


def downgrade() -> None:
    op.drop_table("cleaner_ratings")
    op.drop_table("cleaner_routes")
    op.drop_table("cleaning_report_checklist")
    op.drop_table("cleaning_report_photos")
    op.drop_table("cleaning_reports")
    op.drop_table("cleaning_checklist_items")
    op.drop_table("cleaning_checklist_templates")
    op.drop_table("cleaning_tasks")
