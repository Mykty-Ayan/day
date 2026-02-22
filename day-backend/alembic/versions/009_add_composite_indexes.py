"""add composite indexes for query optimization

Revision ID: 009_composite_indexes
Revises: 008_company_settings
Create Date: 2026-02-22 11:00:00.000000

"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "009_composite_indexes"
down_revision: Union[str, None] = "008_company_settings"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "ix_bookings_property_id_check_in",
        "bookings",
        ["property_id", "check_in"],
    )
    op.create_index(
        "ix_cleaning_tasks_property_id_status",
        "cleaning_tasks",
        ["property_id", "status"],
    )
    op.create_index(
        "ix_properties_company_id_status",
        "properties",
        ["company_id", "status"],
    )


def downgrade() -> None:
    op.drop_index("ix_properties_company_id_status", table_name="properties")
    op.drop_index("ix_cleaning_tasks_property_id_status", table_name="cleaning_tasks")
    op.drop_index("ix_bookings_property_id_check_in", table_name="bookings")
