"""What a deposit's hold is for, line by line, for the guest: a sum, a reason, photos.

booking_deposits gets deductions, a list empty for every deposit: a hold made before keeps
its one sum, and its note stays the owner's.

Revision ID: 066_deposit_deductions
Revises: 065_late_check_out
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "066_deposit_deductions"
down_revision: Union[str, None] = "065_late_check_out"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("booking_deposits", sa.Column("deductions", sa.JSON(), nullable=False, server_default="[]"))


def downgrade() -> None:
    op.drop_column("booking_deposits", "deductions")
