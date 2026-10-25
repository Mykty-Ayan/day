"""A code for each booking's page for the guest (/g/<code>): random and long, as
the page shows the door code once the stay is paid.

Existing bookings get their codes here; new ones get theirs when created.

Revision ID: 055_guest_codes
Revises: 054_stock_movements
"""

import secrets
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "055_guest_codes"
down_revision: Union[str, None] = "054_stock_movements"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"


def _code() -> str:
    return "".join(secrets.choice(_ALPHABET) for _ in range(16))


def upgrade() -> None:
    op.add_column("bookings", sa.Column("guest_code", sa.String(16), nullable=True))
    bind = op.get_bind()
    used: set[str] = set()
    for (booking_id,) in bind.execute(sa.text("SELECT id FROM bookings")).all():
        code = _code()
        while code in used:
            code = _code()
        used.add(code)
        bind.execute(sa.text("UPDATE bookings SET guest_code = :code WHERE id = :id"), {"code": code, "id": booking_id})
    # A default in the database too: during a deploy the old container still adds
    # bookings without a code (from Channex, the iCal sweep), and so would a rollback.
    op.alter_column(
        "bookings",
        "guest_code",
        nullable=False,
        server_default=sa.text("substr(md5(random()::text || clock_timestamp()::text), 1, 16)"),
    )
    op.create_unique_constraint("uq_bookings_guest_code", "bookings", ["guest_code"])


def downgrade() -> None:
    op.drop_constraint("uq_bookings_guest_code", "bookings", type_="unique")
    op.drop_column("bookings", "guest_code")
