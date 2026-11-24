"""A later check-out a flat sells: until which hour and for how much.

properties gets late_check_out_hour and late_check_out_price, empty for every flat:
the guest's button only asks, as before.

Revision ID: 065_late_check_out
Revises: 064_property_nearby
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "065_late_check_out"
down_revision: Union[str, None] = "064_property_nearby"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("properties", sa.Column("late_check_out_hour", sa.Integer(), nullable=True))
    op.add_column("properties", sa.Column("late_check_out_price", sa.Numeric(12, 2), nullable=True))


def downgrade() -> None:
    op.drop_column("properties", "late_check_out_price")
    op.drop_column("properties", "late_check_out_hour")
