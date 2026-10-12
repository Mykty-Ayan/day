"""Migration 030 against a real PostgreSQL: what an old English seed row becomes.

A renamed row keeps its id and its links to flats, so the new name is what
every flat that had the old one now advertises.
"""

import importlib.util
import uuid
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool

from app.config import settings

_MIGRATION = Path(__file__).resolve().parents[1] / "alembic" / "versions" / "030_amenity_catalog.py"


def _upgrade(sync_conn) -> None:
    spec = importlib.util.spec_from_file_location("migration_030", _MIGRATION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    with Operations.context(MigrationContext.configure(sync_conn)):
        module.upgrade()


@pytest.mark.integration
async def test_an_old_parking_row_does_not_turn_into_free_parking():
    engine = create_async_engine(settings.DATABASE_URL, poolclass=NullPool)
    try:
        async with engine.connect() as conn:
            trans = await conn.begin()
            try:
                # The database may already hold the catalogue; start from the old seed.
                await conn.execute(sa.text("DELETE FROM property_amenities"))
                await conn.execute(sa.text("DELETE FROM amenities"))
                parking = uuid.uuid4()
                await conn.execute(
                    sa.text("INSERT INTO amenities (id, name, category) VALUES (:id, 'Parking', 'outdoor')"),
                    {"id": parking},
                )

                await conn.run_sync(_upgrade)

                name = (
                    await conn.execute(sa.text("SELECT name FROM amenities WHERE id = :id"), {"id": parking})
                ).scalar_one()
                # A flat with paid or street parking must not start promising free parking.
                assert name == "Парковка"
            finally:
                await trans.rollback()
    finally:
        await engine.dispose()
