"""A conversation belongs to a chat in one company, not to the chat alone.

Re-linking a Telegram chat to another company moves its identity row. With one
conversation per identity, the new company's assistant was handed the old
company's last turns as history. Now each company gets its own thread with the
chat; the old one stays where it was and resumes if the chat comes back.

Revision ID: 031_conversation_per_company
Revises: 030_amenity_catalog
"""

from typing import Sequence, Union

from alembic import op

revision: str = "031_conversation_per_company"
down_revision: Union[str, None] = "030_amenity_catalog"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_index("ix_conversations_identity_id", table_name="conversations")
    op.create_index("ix_conversations_identity_id", "conversations", ["identity_id"])
    op.create_unique_constraint(
        "uq_conversation_identity_company", "conversations", ["identity_id", "company_id"]
    )


def downgrade() -> None:
    # Fails while a chat has threads in two companies: pick one by hand first.
    op.drop_constraint("uq_conversation_identity_company", "conversations", type_="unique")
    op.drop_index("ix_conversations_identity_id", table_name="conversations")
    op.create_index("ix_conversations_identity_id", "conversations", ["identity_id"], unique=True)
