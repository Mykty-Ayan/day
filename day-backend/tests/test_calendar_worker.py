"""The timer that reads every company's platform calendars, one at a time and each
in its own transaction. A calendar read a short while ago (by another API
instance, or by the owner's "sync now") waits for the next turn."""

import uuid
from datetime import date, datetime, timedelta

import pytest
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.config import settings
from tests.test_calendar_feeds import AIRBNB
from tests.test_property_facts import flat  # noqa: F401  (a fixture)


@pytest.mark.integration
async def test_the_timer_reads_the_calendars_not_read_lately(flat, monkeypatch):  # noqa: F811  (the imported fixture)
    from app.infrastructure import calendar_worker
    from app.infrastructure.models.auth import CompanyModel  # noqa: F401  (the tables it needs)
    from app.infrastructure.models.booking import CalendarFeedModel, PropertyBlockModel
    from app.infrastructure.models.property import PropertyModel

    read: list[str] = []

    async def fetch(url):
        read.append(url)
        return AIRBNB

    monkeypatch.setattr(calendar_worker, "fetch_calendar", fetch)
    _, prop, _ = flat
    engine = create_async_engine(settings.DATABASE_URL, poolclass=NullPool)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    stale, fresh = f"https://www.airbnb.com/calendar/ical/{uuid.uuid4()}.ics", f"https://b.example/{uuid.uuid4()}"
    async with maker() as session:
        company_id = (await session.get(PropertyModel, prop)).company_id
        session.add_all(
            [
                CalendarFeedModel(company_id=company_id, property_id=prop, name="Airbnb", url=stale,
                                  last_synced_at=datetime.utcnow() - timedelta(hours=2)),
                CalendarFeedModel(company_id=company_id, property_id=prop, name="Booking", url=fresh,
                                  last_synced_at=datetime.utcnow() - timedelta(minutes=5)),
            ]
        )
        await session.commit()

    try:
        await calendar_worker.run_once(maker)
        assert stale in read and fresh not in read
        async with maker() as session:
            closed = (await session.scalars(
                select(PropertyBlockModel.start_date).where(PropertyBlockModel.property_id == prop)
            )).all()
            assert sorted(closed) == [date(2030, 10, 10), date(2030, 10, 20)]
            synced = (await session.scalars(select(CalendarFeedModel).where(CalendarFeedModel.url == stale))).one()
            assert synced.last_error is None and synced.last_synced_at > datetime.utcnow() - timedelta(minutes=1)

        # Read a moment ago: the next turn leaves it.
        read.clear()
        await calendar_worker.run_once(maker)
        assert stale not in read
    finally:
        async with maker() as session:
            await session.execute(delete(CalendarFeedModel).where(CalendarFeedModel.property_id == prop))
            await session.commit()
        await engine.dispose()
