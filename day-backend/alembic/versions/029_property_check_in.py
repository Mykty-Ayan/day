"""An apartment's own check-in and check-out hours, and how the guest gets in.

Empty hours keep the company default (14:00 / 12:00), so existing bookings
and flats are unchanged.

Revision ID: 029_property_check_in
Revises: 028_user_two_factor
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "029_property_check_in"
down_revision: Union[str, None] = "028_user_two_factor"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("properties", sa.Column("check_in_hour", sa.Integer(), nullable=True))
    op.add_column("properties", sa.Column("check_out_hour", sa.Integer(), nullable=True))
    op.add_column("properties", sa.Column("check_in_method", sa.String(30), nullable=True))


def downgrade() -> None:
    op.drop_column("properties", "check_in_method")
    op.drop_column("properties", "check_out_hour")
    op.drop_column("properties", "check_in_hour")
