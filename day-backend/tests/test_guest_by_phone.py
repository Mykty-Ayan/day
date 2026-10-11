"""One phone, one guest, however it was typed.

The web keeps the phone as the operator typed it, the WhatsApp bot as digits,
OTAs with a plus. "8 778 …", "+7 778 …" and "7778…" are one Kazakh number, and
the CRM finds a contact by it.
"""

import contextlib
import uuid

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.config import settings
from app.infrastructure.repositories.booking import phone_key
from tests.test_crm_booking_create import _body, crm  # noqa: F401  (a fixture)

# ---------- the key ----------


@pytest.mark.parametrize(
    "raw",
    ["8 (778) 682-31-84", "+7 778 682 3184", "77786823184", "7786823184", " +7(778)6823184 "],
)
def test_every_way_of_writing_a_kazakh_number_gives_one_key(raw):
    assert phone_key(raw) == "77786823184"


def test_a_foreign_number_keeps_its_digits():
    assert phone_key("+44 20 7946 0958") == "442079460958"


def test_no_digits_no_key():
    assert phone_key("") == ""
    assert phone_key("нет") == ""


def test_the_request_log_hides_the_phone():
    from app.main import _redact_query

    assert _redact_query("phone=%2B77786823184&limit=5") == "phone=***&limit=5"
    assert _redact_query("search=Ай&page=2") == "search=Ай&page=2"
    assert _redact_query("") is None


# ---------- PostgreSQL ----------


@contextlib.asynccontextmanager
async def _session():
    engine = create_async_engine(settings.DATABASE_URL, poolclass=NullPool)
    try:
        async with async_sessionmaker(engine, expire_on_commit=False)() as session:
            yield session
    finally:
        await engine.dispose()


@pytest.mark.integration
async def test_the_sql_key_matches_the_python_one():
    from app.domain.booking.entities import Guest
    from app.infrastructure.repositories.booking import SqlGuestRepository

    company, other = uuid.uuid4(), uuid.uuid4()
    async with _session() as session:
        try:
            repo = SqlGuestRepository(session)
            typed = await repo.create(Guest(company_id=company, name="Айгерим", phone="8 (778) 682-31-84"))
            from_bot = await repo.create(Guest(company_id=company, name="Aigerim", phone="77786823184"))
            await repo.create(Guest(company_id=company, name="Другой", phone="+7 701 000 00 00"))
            await repo.create(Guest(company_id=other, name="Чужой", phone="+7 778 682 31 84"))
            foreign = await repo.create(Guest(company_id=company, name="Tom", phone="+44 20 7946 0958"))

            found = await repo.list_by_phone(company, "+7 778 682 3184")
            assert {g.id for g in found} == {typed.id, from_bot.id}

            # The oldest of the duplicates is the one a new booking attaches to.
            assert (await repo.find_by_phone(company, "7786823184")).id == typed.id

            assert [g.id for g in await repo.list_by_phone(company, "44 20 7946 0958")] == [foreign.id]
            assert await repo.list_by_phone(company, "") == []
        finally:
            await session.rollback()


@pytest.mark.integration
async def test_guests_by_phone_over_http(crm):  # noqa: F811  (the imported fixture)
    client, prop = crm
    created = await client.post(
        "/api/v1/bookings",
        json=_body(prop, guest_phone="8 (778) 682-31-84"),
    )
    assert created.status_code == 201, created.text

    response = await client.get("/api/v1/guests", params={"phone": "+7 778 682 3184"})

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    [guest] = body["items"]
    assert guest["id"] == created.json()["guest_id"]
    assert guest["phone"] == "8 (778) 682-31-84"
    assert guest["phone_e164"] == "77786823184"


@pytest.mark.integration
async def test_a_second_booking_with_the_phone_written_otherwise_reuses_the_guest(crm):  # noqa: F811
    client, prop = crm
    first = await client.post("/api/v1/bookings", json=_body(prop, guest_phone="8 778 682 31 84"))
    second = await client.post(
        "/api/v1/bookings",
        json=_body(prop, guest_phone="+77786823184", check_in="2026-12-01T14:00:00", check_out="2026-12-03T12:00:00"),
    )
    assert first.json()["guest_id"] == second.json()["guest_id"]

