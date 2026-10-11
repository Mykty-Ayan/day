"""A company's time zone: the clock its local check-in times are read on.

Day stores check-in and check-out as the company's local time without a zone.
An integration that turns them into instants (reminders, holds) needs to know
which zone that is.
"""

import uuid

import pytest
from pydantic import ValidationError

from app.application.settings.update_settings import UpdateSettingsService
from app.domain.settings.entities import CompanySettings
from app.domain.settings.repositories import CompanySettingsRepository
from app.presentation.schemas.settings import SettingsUpdate

COMPANY_ID = uuid.uuid4()


class FakeSettingsRepository(CompanySettingsRepository):
    def __init__(self):
        self.rows: dict[uuid.UUID, CompanySettings] = {}

    async def get_by_company(self, company_id):
        return self.rows.get(company_id)

    async def save(self, settings):
        self.rows[settings.company_id] = settings
        return settings

    async def update(self, settings):
        self.rows[settings.company_id] = settings
        return settings


def test_a_company_is_in_almaty_until_told_otherwise():
    assert CompanySettings().time_zone == "Asia/Almaty"


async def test_the_zone_can_be_set_on_new_and_existing_settings():
    repo = FakeSettingsRepository()
    svc = UpdateSettingsService(repo)

    created = await svc.execute(COMPANY_ID, time_zone="Asia/Aqtobe")
    assert created.time_zone == "Asia/Aqtobe"

    updated = await svc.execute(COMPANY_ID, time_zone="Europe/Moscow")
    assert updated.time_zone == "Europe/Moscow"


@pytest.mark.parametrize("zone", ["Mars/Olympus", "+05:00", "", "UTC+5"])
def test_only_an_iana_zone_is_accepted(zone):
    with pytest.raises(ValidationError):
        SettingsUpdate(time_zone=zone)


def test_an_iana_zone_passes():
    assert SettingsUpdate(time_zone="Asia/Almaty").time_zone == "Asia/Almaty"


@pytest.mark.integration
async def test_settings_round_trip_the_zone_over_http():
    from httpx import ASGITransport, AsyncClient
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
    from sqlalchemy.pool import NullPool

    from app.config import settings
    from app.domain.auth.permissions import Permission
    from app.infrastructure.database import get_session
    from app.main import app
    from app.presentation.api.deps import Principal, get_principal

    engine = create_async_engine(settings.DATABASE_URL, poolclass=NullPool)
    maker = async_sessionmaker(engine, expire_on_commit=False)

    async def _session():
        async with maker() as session:
            yield session

    principal = Principal(
        company_id=uuid.uuid4(),
        permissions=frozenset({Permission.SETTINGS_READ, Permission.SETTINGS_WRITE}),
        kind="user",
        user_id=uuid.uuid4(),
        actor_id=uuid.uuid4(),
    )
    app.dependency_overrides[get_session] = _session
    app.dependency_overrides[get_principal] = lambda: principal
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            assert (await client.get("/api/v1/settings")).json()["time_zone"] == "Asia/Almaty"
            patched = await client.patch("/api/v1/settings", json={"time_zone": "Asia/Aqtobe"})
            assert patched.status_code == 200, patched.text
            assert (await client.get("/api/v1/settings")).json()["time_zone"] == "Asia/Aqtobe"
            assert (await client.patch("/api/v1/settings", json={"time_zone": "Mars/Olympus"})).status_code == 422
    finally:
        app.dependency_overrides.pop(get_session, None)
        app.dependency_overrides.pop(get_principal, None)
        await engine.dispose()
