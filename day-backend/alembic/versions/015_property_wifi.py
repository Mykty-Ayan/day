"""property wifi credentials

Revision ID: 015_property_wifi
Revises: 014_channex
Create Date: 2026-08-26 02:10:00.000000

The Wi-Fi name and password are what a guest asks for most often after the
door code, and an operator running six units cannot keep them in their head.
They lived nowhere in the model: the only trace of Wi-Fi was the amenity flag,
which says the flat has it but not how to join. Storing them on the unit lets
the host read them off the Telegram Mini App mid-conversation.

Both columns are nullable — units imported from an OTA listing arrive without
them.
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "015_property_wifi"
down_revision: Union[str, None] = "014_channex"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("properties", sa.Column("wifi_name", sa.String(length=255), nullable=True))
    op.add_column("properties", sa.Column("wifi_password", sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column("properties", "wifi_password")
    op.drop_column("properties", "wifi_name")
