"""A user may ask for a Telegram code after the password at sign-in.

Off for everyone until each user turns it on in Settings.

Revision ID: 028_user_two_factor
Revises: 027_property_capacity
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "028_user_two_factor"
down_revision: Union[str, None] = "027_property_capacity"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users", sa.Column("two_factor_enabled", sa.Boolean(), nullable=False, server_default=sa.false())
    )


def downgrade() -> None:
    op.drop_column("users", "two_factor_enabled")
