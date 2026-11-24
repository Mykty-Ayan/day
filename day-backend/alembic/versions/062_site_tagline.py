"""The site's tagline: the big line on top of a company's site, the title then by the logo.

company_sites gets tagline, empty for every site: a site without one shows its title
big, as before.

Revision ID: 062_site_tagline
Revises: 061_company_weekend_nights
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "062_site_tagline"
down_revision: Union[str, None] = "061_company_weekend_nights"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("company_sites", sa.Column("tagline", sa.String(length=120), nullable=True))


def downgrade() -> None:
    op.drop_column("company_sites", "tagline")
