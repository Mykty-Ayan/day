"""service API keys, richer user records, cleaner foreign keys

Revision ID: 012_api_keys_and_team
Revises: 011_hourly_rental_core
Create Date: 2026-08-02 10:00:00.000000

Three related changes that make multi-user operation real:

  * ``api_keys`` — service credentials for the bots and other integrations.
    Only a SHA-256 hash of the key is stored, plus a short hint for the UI.
  * ``users.full_name`` / ``users.phone`` — a cleaner has to be identifiable by
    something other than an email address.
  * foreign keys from the cleaning tables onto ``users``. ``cleaner_id`` was a
    bare UUID, so nothing stopped a task pointing at an id that never existed.

Rows whose ``cleaner_id`` does not resolve to a user are cleared before the
constraint is added (``cleaning_tasks.cleaner_id`` is nullable); on the report,
route and rating tables the column is NOT NULL, so orphan rows are deleted —
they refer to a cleaner the system cannot name and carry no usable history.
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "012_api_keys_and_team"
down_revision: Union[str, None] = "011_hourly_rental_core"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "api_keys",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("company_id", sa.Uuid(), sa.ForeignKey("companies.id"), nullable=False, index=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("hashed_key", sa.String(64), nullable=False),
        sa.Column("key_hint", sa.String(32), nullable=False),
        sa.Column("scopes", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("created_by", sa.Uuid(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("last_used_at", sa.DateTime(), nullable=True),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_api_keys_hashed_key", "api_keys", ["hashed_key"], unique=True)

    op.add_column("users", sa.Column("full_name", sa.String(255), nullable=False, server_default=""))
    op.add_column("users", sa.Column("phone", sa.String(50), nullable=True))

    # Clear or drop rows that point at a non-existent cleaner, so the new
    # constraints can be created.
    op.execute(
        """
        UPDATE cleaning_tasks
        SET cleaner_id = NULL
        WHERE cleaner_id IS NOT NULL
          AND cleaner_id NOT IN (SELECT id FROM users)
        """
    )
    for table in ("cleaning_reports", "cleaner_routes", "cleaner_ratings"):
        op.execute(f"DELETE FROM {table} WHERE cleaner_id NOT IN (SELECT id FROM users)")

    op.create_foreign_key("fk_cleaning_tasks_cleaner", "cleaning_tasks", "users", ["cleaner_id"], ["id"])
    op.create_foreign_key("fk_cleaning_reports_cleaner", "cleaning_reports", "users", ["cleaner_id"], ["id"])
    op.create_foreign_key("fk_cleaner_routes_cleaner", "cleaner_routes", "users", ["cleaner_id"], ["id"])
    op.create_foreign_key("fk_cleaner_ratings_cleaner", "cleaner_ratings", "users", ["cleaner_id"], ["id"])


def downgrade() -> None:
    op.drop_constraint("fk_cleaner_ratings_cleaner", "cleaner_ratings", type_="foreignkey")
    op.drop_constraint("fk_cleaner_routes_cleaner", "cleaner_routes", type_="foreignkey")
    op.drop_constraint("fk_cleaning_reports_cleaner", "cleaning_reports", type_="foreignkey")
    op.drop_constraint("fk_cleaning_tasks_cleaner", "cleaning_tasks", type_="foreignkey")

    op.drop_column("users", "phone")
    op.drop_column("users", "full_name")

    op.drop_index("ix_api_keys_hashed_key", table_name="api_keys")
    op.drop_table("api_keys")
