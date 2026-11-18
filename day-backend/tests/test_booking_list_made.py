"""The bookings list by the day a booking was made: what the bookings overview counts as sold that day."""

import uuid
from datetime import datetime

import pytest
from sqlalchemy import update
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.config import settings
from app.domain.auth.permissions import Permission
from app.infrastructure.models.booking import BookingModel
from tests.test_property_facts import flat  # noqa: F401  (a fixture)

_STAY = {"guest_name": "Жалгас", "guest_phone": "+77079011170", "check_in": "2030-12-01T14:00:00",
         "check_out": "2030-12-02T12:00:00", "rental_mode": "daily", "adults_count": 2}


async def _made_at(booking_id: str, at: datetime) -> None:
    engine = create_async_engine(settings.DATABASE_URL, poolclass=NullPool)
    try:
        async with async_sessionmaker(engine)() as session:
            made = update(BookingModel).where(BookingModel.id == uuid.UUID(booking_id)).values(created_at=at)
            await session.execute(made)
            await session.commit()
    finally:
        await engine.dispose()


@pytest.mark.integration
async def test_the_list_finds_the_bookings_made_on_the_days_asked(flat):  # noqa: F811  (the imported fixture)
    client, prop, use = flat
    use(Permission.BOOKINGS_READ, Permission.BOOKINGS_WRITE, Permission.PROPERTIES_READ)
    early = (await client.post("/api/v1/bookings", json={**_STAY, "property_id": str(prop)})).json()
    later = {**_STAY, "property_id": str(prop), "guest_phone": "+77079011171",
             "check_in": "2030-12-05T14:00:00", "check_out": "2030-12-06T12:00:00"}
    late = (await client.post("/api/v1/bookings", json=later)).json()
    await _made_at(early["id"], datetime(2030, 10, 31, 23, 30))
    await _made_at(late["id"], datetime(2030, 11, 30, 23, 30))

    async def made(**days: str) -> list[str]:
        listed = (await client.get("/api/v1/bookings", params={"property_id": str(prop), **days})).json()
        assert listed["total"] == len(listed["items"])
        return sorted(b["id"] for b in listed["items"])

    # Both ends are whole days: a booking made late in the evening of the last one is in.
    assert await made(created_from="2030-11-01", created_to="2030-11-30") == [late["id"]]
    assert await made(created_to="2030-10-31") == [early["id"]]
    assert await made(created_from="2030-10-31") == sorted([early["id"], late["id"]])
    assert await made(created_from="2030-12-01") == []


@pytest.mark.integration
async def test_stays_arriving_at_one_moment_keep_one_order_across_pages(flat):  # noqa: F811  (the imported fixture)
    client, prop, use = flat
    use(Permission.BOOKINGS_READ, Permission.BOOKINGS_WRITE, Permission.PROPERTIES_READ)
    ids = []
    for i in range(5):
        # Each one cancelled before the next takes the same nights: five arrivals at one moment.
        made = await client.post("/api/v1/bookings", json={**_STAY, "property_id": str(prop),
                                                           "guest_phone": f"+7707901118{i}"})
        assert made.status_code == 201, made.text
        ids.append(made.json()["id"])
        cancelled = await client.post(f"/api/v1/bookings/{ids[-1]}/status", json={"target_status": "cancelled"})
        assert cancelled.status_code == 200, cancelled.text

    async def page(n: int) -> list[str]:
        listed = await client.get("/api/v1/bookings", params={"property_id": str(prop), "per_page": 2, "page": n})
        return [b["id"] for b in listed.json()["items"]]

    paged = await page(1) + await page(2) + await page(3)
    # Every stay once, in one order: the newest arrival first, a tie broken by the id.
    assert paged == sorted(ids, reverse=True)
