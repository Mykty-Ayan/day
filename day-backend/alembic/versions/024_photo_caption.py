"""A photo can say what it shows.

The CRM sends a flat's photos to a guest; "entrance from the yard" under a
picture of a door saves a question.

Revision ID: 024_photo_caption
Revises: 023_property_facts
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "024_photo_caption"
down_revision: Union[str, None] = "023_property_facts"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("property_photos", sa.Column("caption", sa.String(500), nullable=True))


def downgrade() -> None:
    op.drop_column("property_photos", "caption")
