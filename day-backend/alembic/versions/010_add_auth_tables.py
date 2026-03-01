"""add auth tables (companies, users)

Revision ID: 010_auth_tables
Revises: 009_composite_indexes
Create Date: 2026-03-01 12:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "010_auth_tables"
down_revision: Union[str, None] = "009_composite_indexes"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SEED_COMPANY_ID = "00000000-0000-0000-0000-000000000001"


def upgrade() -> None:
    op.create_table(
        "companies",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("company_id", sa.Uuid(), sa.ForeignKey("companies.id"), nullable=False, index=True),
        sa.Column("role", sa.String(50), nullable=False, server_default="owner"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    # Seed default company so existing data (properties, bookings, etc.) keeps working
    op.execute(
        sa.text(
            "INSERT INTO companies (id, name) VALUES (CAST(:id AS uuid), :name) ON CONFLICT DO NOTHING"
        ).bindparams(id=SEED_COMPANY_ID, name="Default Company")
    )


def downgrade() -> None:
    op.drop_table("users")
    op.drop_table("companies")
