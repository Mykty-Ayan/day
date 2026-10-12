"""A user's tokens carry a version; raising it ends all their sessions.

Sign-out had nothing to revoke: a refresh token stayed good for its seven
days, through a role change, a deactivation or a new password. Every token
now carries the user's token_version as "tv", and a token whose version is
behind is refused. Existing tokens carry none and count as 0, so this
deploy signs nobody out.

Revision ID: 026_user_token_version
Revises: 025_redact_wifi_password_audit
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "026_user_token_version"
down_revision: Union[str, None] = "025_redact_wifi_password_audit"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("token_version", sa.Integer(), nullable=False, server_default="0"))


def downgrade() -> None:
    op.drop_column("users", "token_version")
