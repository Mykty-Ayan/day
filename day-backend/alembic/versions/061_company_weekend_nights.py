"""The company's weekend nights: the weekend markup and weekend tariffs fall on them.

company_settings gets weekend_nights, Friday and Saturday (4, 5) for every company:
the nights the prices already used, so no price changes until a company picks others.

Revision ID: 061_company_weekend_nights
Revises: 060_property_position
"""

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "061_company_weekend_nights"
down_revision: Union[str, None] = "060_property_position"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "company_settings",
        sa.Column(
            "weekend_nights",
            postgresql.ARRAY(sa.SmallInteger()),
            server_default="{4,5}",
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("company_settings", "weekend_nights")
