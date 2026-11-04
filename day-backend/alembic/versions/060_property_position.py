"""A flat's row on the chessboard, as the company put its flats in order.

properties gets position: empty for every flat, so the chessboard keeps its order
by name until the company sets one.

Revision ID: 060_property_position
Revises: 059_guest_order_billing
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "060_property_position"
down_revision: Union[str, None] = "059_guest_order_billing"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("properties", sa.Column("position", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("properties", "position")
