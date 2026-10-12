"""The property history no longer keeps Wi-Fi passwords.

Every role that reads a property also reads its change history, a cleaner
included, and each password change used to be stored there in clear. New
changes are written as "***"; this masks the ones already recorded.

Not reversible: the old values are gone on purpose.

Revision ID: 025_redact_wifi_password_audit
Revises: 024_photo_caption
"""

from typing import Sequence, Union

from alembic import op

revision: str = "025_redact_wifi_password_audit"
down_revision: Union[str, None] = "024_photo_caption"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE property_audit_logs
        SET old_value = CASE WHEN old_value IS NULL THEN NULL ELSE '***' END,
            new_value = CASE WHEN new_value IS NULL THEN NULL ELSE '***' END
        WHERE field_name = 'wifi_password'
        """
    )


def downgrade() -> None:
    pass
