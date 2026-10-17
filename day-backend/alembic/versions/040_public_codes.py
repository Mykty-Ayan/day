"""A code for each flat's page for guests: random, so the link tells nothing of the
flat (its internal name often holds the flat's number).

Existing flats get their codes here; new ones get theirs when created.

Revision ID: 040_public_codes
Revises: 039_calendar_feeds
"""

import secrets
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "040_public_codes"
down_revision: Union[str, None] = "039_calendar_feeds"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"


def upgrade() -> None:
    op.add_column("properties", sa.Column("public_code", sa.String(16), nullable=True))
    bind = op.get_bind()
    used: set[str] = set()
    for (property_id,) in bind.execute(sa.text("SELECT id FROM properties")).all():
        code = "".join(secrets.choice(_ALPHABET) for _ in range(7))
        while code in used:
            code = "".join(secrets.choice(_ALPHABET) for _ in range(7))
        used.add(code)
        bind.execute(
            sa.text("UPDATE properties SET public_code = :code WHERE id = :id"), {"code": code, "id": property_id}
        )
    # A default in the database too: during a deploy the old container still adds
    # flats without a code, and so would an image rolled back without a downgrade.
    op.alter_column(
        "properties",
        "public_code",
        nullable=False,
        server_default=sa.text("substr(md5(random()::text || clock_timestamp()::text), 1, 7)"),
    )
    op.create_unique_constraint("uq_properties_public_code", "properties", ["public_code"])


def downgrade() -> None:
    op.drop_constraint("uq_properties_public_code", "properties", type_="unique")
    op.drop_column("properties", "public_code")
