"""Leads read out of the colleagues' groups, and the guests they warn about.

Subletters pass each other the guests they cannot house, for a cut, in shared
WhatsApp groups. The same groups carry a blacklist: phone numbers of guests who
wrecked a flat. Both were read and thrown away; this keeps them.

Revision ID: 017_leads_and_blacklist
Revises: 016_property_costs
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "017_leads_and_blacklist"
down_revision: Union[str, None] = "016_property_costs"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "leads",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("company_id", sa.UUID(), nullable=False),
        sa.Column("chat_id", sa.String(128), server_default="", nullable=False),
        sa.Column("author", sa.String(128), server_default="", nullable=False),
        # The message as written. Every parse is a guess, and whoever decides on
        # a lead should be able to read what the colleague actually said.
        sa.Column("text", sa.Text(), server_default="", nullable=False),
        sa.Column("district", sa.String(255), server_default="", nullable=False),
        sa.Column("guests", sa.Integer(), nullable=True),
        sa.Column("rooms_min", sa.Integer(), nullable=True),
        sa.Column("rooms_max", sa.Integer(), nullable=True),
        sa.Column("check_in", sa.Date(), nullable=True),
        sa.Column("nights", sa.Integer(), nullable=True),
        sa.Column("budget", sa.Numeric(12, 2), nullable=True),
        sa.Column("commission", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("status", sa.String(16), server_default="new", nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_leads_company_id", "leads", ["company_id"])
    op.create_index("ix_leads_status", "leads", ["status"])
    # The two questions this table answers: what is still open for me, and who
    # else wants this date. Both always inside one company.
    op.create_index("ix_leads_company_status", "leads", ["company_id", "status"])
    op.create_index("ix_leads_company_check_in", "leads", ["company_id", "check_in"])
    # A colleague closing their request names neither it nor its date, so the
    # close matches on who wrote it and where.
    op.create_index("ix_leads_chat_author", "leads", ["company_id", "chat_id", "author"])

    op.create_table(
        "blacklisted_guests",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("company_id", sa.UUID(), nullable=False),
        sa.Column("phone", sa.String(20), nullable=False),
        sa.Column("reason", sa.Text(), server_default="", nullable=False),
        sa.Column("source", sa.String(128), server_default="", nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_blacklisted_guests_company_id", "blacklisted_guests", ["company_id"])
    op.create_index("ix_blacklisted_guests_phone", "blacklisted_guests", ["phone"])
    # One warning per number per company: a second sighting sharpens the reason
    # instead of stacking rows that all say the same thing.
    op.create_index(
        "ix_blacklist_company_phone",
        "blacklisted_guests",
        ["company_id", "phone"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ix_blacklist_company_phone", table_name="blacklisted_guests")
    op.drop_index("ix_blacklisted_guests_phone", table_name="blacklisted_guests")
    op.drop_index("ix_blacklisted_guests_company_id", table_name="blacklisted_guests")
    op.drop_table("blacklisted_guests")
    op.drop_index("ix_leads_chat_author", table_name="leads")
    op.drop_index("ix_leads_company_check_in", table_name="leads")
    op.drop_index("ix_leads_company_status", table_name="leads")
    op.drop_index("ix_leads_status", table_name="leads")
    op.drop_index("ix_leads_company_id", table_name="leads")
    op.drop_table("leads")
