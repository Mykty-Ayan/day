"""Where a guest leaves the car: a line of the owner's words, shown on the flat's page.

properties gets parking, empty for every flat: a flat says nothing about parking until
its owner writes it.

Revision ID: 067_property_parking
Revises: 066_deposit_deductions
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "067_property_parking"
down_revision: Union[str, None] = "066_deposit_deductions"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("properties", sa.Column("parking", sa.String(500), nullable=True))


def downgrade() -> None:
    op.drop_column("properties", "parking")
