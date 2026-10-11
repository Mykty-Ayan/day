"""No two active bookings of one property may share a moment.

The services check for an overlap with a SELECT and then INSERT. Two requests
at the same time both pass the SELECT, and the flat is sold twice. An exclusion
constraint makes PostgreSQL refuse the second one.

Active means every status except cancelled and completed: the same set the
booking services treat as holding the dates.

Channex records an OTA stay even when it clashes, because the OTA has already
confirmed it to the guest. Such rows carry `overbooking = true` and are exempt.
Rows that already overlap today are flagged the same way, the later-created one
of each clash, so the constraint can be added and the host still sees them.

Revision ID: 018_booking_no_overlap
Revises: 017_leads_and_blacklist
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "018_booking_no_overlap"
down_revision: Union[str, None] = "017_leads_and_blacklist"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_ACTIVE = "status NOT IN ('cancelled', 'completed')"


def upgrade() -> None:
    bind = op.get_bind()

    # tsrange refuses a range that ends before it starts. The services never
    # wrote one; if a row like that exists, say which instead of failing on an
    # opaque range error halfway through the deploy.
    broken = bind.execute(
        sa.text(f"SELECT id FROM bookings WHERE {_ACTIVE} AND check_out < check_in")
    ).scalars().all()
    if broken:
        raise RuntimeError(
            "Active bookings end before they start; fix their dates first: "
            + ", ".join(str(i) for i in broken)
        )

    op.execute("CREATE EXTENSION IF NOT EXISTS btree_gist")
    op.add_column(
        "bookings",
        sa.Column("overbooking", sa.Boolean(), server_default=sa.false(), nullable=False),
    )

    # A row that overlaps no earlier row stays unflagged, so no two unflagged
    # rows can overlap and the constraint below always applies cleanly.
    op.execute(
        f"""
        UPDATE bookings AS b SET overbooking = true
        WHERE b.{_ACTIVE}
          AND EXISTS (
            SELECT 1 FROM bookings AS o
            WHERE o.property_id = b.property_id
              AND o.id <> b.id
              AND o.{_ACTIVE}
              AND o.check_in < b.check_out
              AND o.check_out > b.check_in
              AND (o.created_at, o.id) < (b.created_at, b.id)
          )
        """
    )

    op.execute(
        f"""
        ALTER TABLE bookings ADD CONSTRAINT bookings_no_overlap
        EXCLUDE USING gist (
            property_id WITH =,
            tsrange(check_in, check_out, '[)') WITH &&
        )
        WHERE ({_ACTIVE} AND NOT overbooking)
        """
    )


def downgrade() -> None:
    op.execute("ALTER TABLE bookings DROP CONSTRAINT bookings_no_overlap")
    op.drop_column("bookings", "overbooking")
    # btree_gist stays: other objects may use it, and it costs nothing.
