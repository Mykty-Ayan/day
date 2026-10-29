"""PATCH /guests/{id}: bookings:write, the company's guests only, 409 on another guest's phone."""

import uuid

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.config import settings
from app.domain.auth.permissions import Permission
from tests.test_property_facts import flat  # noqa: F401  (a fixture)

pytestmark = pytest.mark.integration


async def _book(client, prop, name, phone, day):
    response = await client.post(
        "/api/v1/bookings",
        json={"property_id": str(prop), "guest_name": name, "guest_phone": phone,
              "check_in": f"2027-03-{day:02d}T14:00:00", "check_out": f"2027-03-{day + 1:02d}T12:00:00"},
    )
    assert response.status_code == 201, response.text
    return response.json()["guest_id"]


async def test_a_guest_is_corrected_from_the_booking_card(flat):  # noqa: F811  (the imported fixture)
    from app.infrastructure.models.booking import GuestModel

    client, prop, use = flat
    use(Permission.BOOKINGS_READ, Permission.BOOKINGS_WRITE)
    ann = await _book(client, prop, "Ann", "+7 700 111 22 33", 1)
    await _book(client, prop, "Bob", "87009998877", 3)

    use(Permission.BOOKINGS_READ)
    assert (await client.patch(f"/api/v1/guests/{ann}", json={"name": "Анна"})).status_code == 403

    use(Permission.BOOKINGS_READ, Permission.BOOKINGS_WRITE)
    saved = await client.patch(f"/api/v1/guests/{ann}", json={"name": " Анна ", "phone": "+77005554433"})
    assert saved.status_code == 200, saved.text
    assert (saved.json()["name"], saved.json()["phone"], saved.json()["phone_e164"]) == (
        "Анна", "+77005554433", "77005554433"
    )

    # Bob's number written another way is still Bob's.
    taken = await client.patch(f"/api/v1/guests/{ann}", json={"phone": "+7 (700) 999-88-77"})
    assert taken.status_code == 409
    assert "another guest" in taken.json()["detail"].lower()
    assert (await client.get(f"/api/v1/guests/{ann}")).json()["phone"] == "+77005554433"

    assert (await client.patch(f"/api/v1/guests/{ann}", json={"phone": None})).json()["phone"] is None
    assert (await client.patch(f"/api/v1/guests/{ann}", json={"name": ""})).status_code == 422

    # Another company's guest is not there to be changed.
    engine = create_async_engine(settings.DATABASE_URL, poolclass=NullPool)
    theirs = uuid.uuid4()
    async with async_sessionmaker(engine)() as session:
        session.add(GuestModel(id=theirs, company_id=uuid.uuid4(), name="Eve", phone="+77001230000"))
        await session.commit()
    await engine.dispose()
    assert (await client.patch(f"/api/v1/guests/{theirs}", json={"name": "Mallory"})).status_code == 404
    assert (await client.patch(f"/api/v1/guests/{uuid.uuid4()}", json={"name": "X"})).status_code == 404
