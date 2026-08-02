"""messaging context: channel identities, conversations, messages, outbox

Revision ID: 013_messaging
Revises: 012_api_keys_and_team
Create Date: 2026-08-02 12:00:00.000000

Shared foundation for both bots:

  * ``channel_identities`` — binds an external chat (a Telegram chat id, a
    WhatsApp contact, or a whapi channel) to a company.
  * ``conversations`` / ``messages`` — the thread and its full log, with a
    unique ``provider_message_id`` so a redelivered webhook cannot be acted on
    twice.
  * ``outbound_notifications`` — the outbox. A notification is written in the
    same transaction as the domain change that caused it and delivered
    separately with retries.
  * ``channel_link_codes`` — single-use codes an owner sends to the bot to bind
    a chat.
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "013_messaging"
down_revision: Union[str, None] = "012_api_keys_and_team"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "channel_identities",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("company_id", sa.Uuid(), sa.ForeignKey("companies.id"), nullable=False, index=True),
        sa.Column("channel", sa.String(20), nullable=False, index=True),
        sa.Column("external_id", sa.String(128), nullable=False, index=True),
        sa.Column("display_name", sa.String(255), nullable=False, server_default=""),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("guest_id", sa.Uuid(), sa.ForeignKey("guests.id"), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("channel", "external_id", name="uq_channel_identity"),
    )

    op.create_table(
        "conversations",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("company_id", sa.Uuid(), sa.ForeignKey("companies.id"), nullable=False, index=True),
        sa.Column("channel", sa.String(20), nullable=False),
        sa.Column(
            "identity_id",
            sa.Uuid(),
            sa.ForeignKey("channel_identities.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
            index=True,
        ),
        sa.Column("state", sa.String(40), nullable=False, server_default="idle"),
        sa.Column("context", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("last_message_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "messages",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "conversation_id",
            sa.Uuid(),
            sa.ForeignKey("conversations.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("direction", sa.String(10), nullable=False),
        sa.Column("body", sa.Text(), nullable=False, server_default=""),
        sa.Column("provider_message_id", sa.String(255), nullable=True, unique=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="received"),
        sa.Column("payload", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now(), index=True),
    )

    op.create_table(
        "outbound_notifications",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("company_id", sa.Uuid(), sa.ForeignKey("companies.id"), nullable=False, index=True),
        sa.Column("channel", sa.String(20), nullable=False),
        sa.Column("target", sa.String(128), nullable=False),
        sa.Column("event", sa.String(40), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending", index=True),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_error", sa.String(500), nullable=True),
        sa.Column("next_attempt_at", sa.DateTime(), nullable=True, index=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("sent_at", sa.DateTime(), nullable=True),
    )

    op.create_table(
        "channel_link_codes",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("company_id", sa.Uuid(), sa.ForeignKey("companies.id"), nullable=False, index=True),
        sa.Column("code", sa.String(32), nullable=False, unique=True, index=True),
        sa.Column("channel", sa.String(20), nullable=False),
        sa.Column("created_by", sa.Uuid(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("expires_at", sa.DateTime(), nullable=True),
        sa.Column("used_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("channel_link_codes")
    op.drop_table("outbound_notifications")
    op.drop_table("messages")
    op.drop_table("conversations")
    op.drop_table("channel_identities")
