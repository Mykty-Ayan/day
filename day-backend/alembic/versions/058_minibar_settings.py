"""How a company runs its minibar: the ways a guest may pay and the hours.

Two ways on company_settings — a Kaspi invoice before delivery (on by default)
and added to the booking's bill (off) — with at least one on, and the hours the
minibar takes orders in (none: round the clock).

Revision ID: 058_minibar_settings
Revises: 057_hourly_tariffs
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "058_minibar_settings"
down_revision: Union[str, None] = "057_hourly_tariffs"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "company_settings", sa.Column("minibar_invoice", sa.Boolean(), nullable=False, server_default=sa.true())
    )
    op.add_column(
        "company_settings", sa.Column("minibar_on_booking", sa.Boolean(), nullable=False, server_default=sa.false())
    )
    op.add_column("company_settings", sa.Column("minibar_opens", sa.Time(), nullable=True))
    op.add_column("company_settings", sa.Column("minibar_closes", sa.Time(), nullable=True))
    op.create_check_constraint(
        "ck_company_settings_minibar_method", "company_settings", "minibar_invoice OR minibar_on_booking"
    )


def downgrade() -> None:
    op.drop_constraint("ck_company_settings_minibar_method", "company_settings", type_="check")
    op.drop_column("company_settings", "minibar_closes")
    op.drop_column("company_settings", "minibar_opens")
    op.drop_column("company_settings", "minibar_on_booking")
    op.drop_column("company_settings", "minibar_invoice")
