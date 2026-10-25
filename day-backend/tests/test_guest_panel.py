"""A guest's own page for their booking, by a link with no sign-in (/g/<code>).

The code names one booking. How to get in (instructions, Wi-Fi, guest facts)
leaves the server only for a confirmed or checked-in stay paid in full. A closed
booking shows only that it is closed, and whom to write to.
"""

import uuid
from datetime import datetime, timezone
from decimal import Decimal
from types import SimpleNamespace

import pytest

from app.application.booking.guest_panel import GuestPanelService
from app.domain.booking.entities import Booking, Guest, new_guest_code
from app.domain.booking.value_objects import BookingStatus
from app.domain.property.entities import PropertyFact
from app.domain.property.value_objects import FactAudience
from app.domain.site.entities import CompanySite
from app.presentation.schemas.guest_panel import GuestPanelResponse
from tests.test_property_facts import flat  # noqa: F401  (a fixture)
from tests.test_property_services import COMPANY_ID, _make_property

CODE = "abcdefghjkmnpqrs"


class _Repo:
    def __init__(self, *rows):
        self.rows = {r.id: r for r in rows}

    async def get_by_id(self, row_id):
        return self.rows.get(row_id)

    async def get_by_guest_code(self, code):
        return next((b for b in self.rows.values() if b.guest_code == code), None)


class _Paid:
    def __init__(self, amount):
        self.amount = amount

    async def sum_paid_by_bookings(self, ids):
        return {i: self.amount for i in ids} if self.amount else {}


class _Facts:
    def __init__(self, *facts):
        self.facts = list(facts)

    async def list_by_property(self, property_id):
        return [f for f in self.facts if f.property_id == property_id]


class _Site:
    async def get(self, company_id):
        return CompanySite(company_id=company_id, slug="munar", title="Munar", whatsapp="77001234567")


class _Settings:
    async def get_by_company(self, company_id):
        return SimpleNamespace(time_zone="Asia/Almaty")


def _setup(status=BookingStatus.CONFIRMED, paid=Decimal("40000"), total=Decimal("40000")):
    flat_ = _make_property(
        name="Т13 у Байтерека", check_in_instructions="Подъезд 2, сейф у двери", wifi_name="T13",
        wifi_password="secret-wifi", house_rules="Не курить", address_full="Астана, Кабанбай батыра 11",
    )
    guest = Guest(company_id=COMPANY_ID, name="Жалгас", phone="+77079011161")
    booking = Booking(
        company_id=COMPANY_ID, property_id=flat_.id, guest_id=guest.id, status=status, total_price=total,
        check_in=datetime(2026, 10, 25, 14), check_out=datetime(2026, 10, 27, 12), guest_code=CODE,
    )
    facts = _Facts(
        PropertyFact(company_id=COMPANY_ID, property_id=flat_.id, text="Код сейфа 4512", audience=FactAudience.GUEST),
        PropertyFact(company_id=COMPANY_ID, property_id=flat_.id, text="Рядом парк", audience=FactAudience.PUBLIC),
    )
    return GuestPanelService(_Repo(booking), _Paid(paid), _Repo(guest), _Repo(flat_), facts, _Site(), _Settings())


# 25 Oct, 20:00 in Almaty is still the 25th there, 15:00 in UTC.
NOW = datetime(2026, 10, 25, 15, tzinfo=timezone.utc)


async def test_a_paid_confirmed_stay_shows_how_to_get_in():
    panel = await _setup().execute(CODE, NOW)
    assert panel.access is not None
    assert (panel.access.instructions, panel.access.wifi_password) == ("Подъезд 2, сейф у двери", "secret-wifi")
    # Only the guest facts: a public one is for the listing.
    assert panel.access.facts == ["Код сейфа 4512"]
    assert (panel.remaining, panel.today.isoformat()) == (Decimal("0"), "2026-10-25")


async def test_a_debt_or_a_pending_booking_keeps_the_door_code_back():
    for svc in (_setup(paid=Decimal("39999.99")), _setup(paid=Decimal("0")), _setup(status=BookingStatus.PENDING)):
        panel = await svc.execute(CODE, NOW)
        assert panel.access is None
        dumped = GuestPanelResponse.from_panel(panel).model_dump_json()
        assert "secret-wifi" not in dumped and "4512" not in dumped and "сейф" not in dumped
    assert (await _setup(paid=Decimal("10000")).execute(CODE, NOW)).remaining == Decimal("30000")


async def test_a_closed_booking_keeps_back_the_address_the_rules_and_the_way_in():
    for status in (BookingStatus.CANCELLED, BookingStatus.CHECKED_OUT, BookingStatus.COMPLETED):
        page = GuestPanelResponse.from_panel(await _setup(status=status).execute(CODE, NOW))
        assert page.closed and page.access is None and page.company.whatsapp == "77001234567"
        # What a message to the host names (documents for the books): the guest, the flat, the dates.
        assert (page.guest_name, page.flat.name, page.booking.status) == ("Жалгас", "Т13 у Байтерека", status.value)
        assert (page.flat.address, page.flat.house_rules) == (None, None)
        assert "Кабанбай" not in page.model_dump_json() and "secret-wifi" not in page.model_dump_json()


async def test_the_page_names_the_guest_but_never_a_phone():
    page = GuestPanelResponse.from_panel(await _setup().execute(CODE, NOW))
    assert page.guest_name == "Жалгас"
    assert "79011161" not in page.model_dump_json()


async def test_a_wrong_code_finds_nothing():
    for code in ("nosuchcodeatall0", "short", CODE + "x"):
        with pytest.raises(ValueError):
            await _setup().execute(code, NOW)


def test_a_guest_code_is_sixteen_unmistakable_characters():
    codes = {new_guest_code() for _ in range(200)}
    assert len(codes) == 200
    assert all(len(c) == 16 and not set(c) & set("01ilo") for c in codes)


# ---------- HTTP ----------


@pytest.mark.integration
async def test_the_guest_reads_the_page_and_gets_the_code_after_paying(flat):  # noqa: F811  (the imported fixture)
    from app.domain.auth.permissions import Permission

    client, prop, use = flat
    use(Permission.BOOKINGS_READ, Permission.BOOKINGS_WRITE, Permission.PROPERTIES_READ,
        Permission.PROPERTIES_WRITE, Permission.PROPERTY_SECRETS_READ, Permission.PROPERTY_FACTS_WRITE)
    wifi = await client.patch(f"/api/v1/properties/{prop}", json={"wifi_name": "T13", "wifi_password": "secret-wifi"})
    assert wifi.status_code == 200, wifi.text
    fact = await client.post(f"/api/v1/properties/{prop}/facts", json={"text": "Код сейфа 4512", "audience": "guest"})
    assert fact.status_code == 201, fact.text
    stay = {"property_id": str(prop), "guest_name": "Жалгас", "guest_phone": "+77079011161",
            "check_in": "2030-12-01T14:00:00", "check_out": "2030-12-03T12:00:00", "rental_mode": "daily",
            "adults_count": 1, "total_price": 40000}
    made = await client.post("/api/v1/bookings", json=stay)
    assert made.status_code == 201, made.text
    booking = made.json()["id"]
    from app.infrastructure.models.booking import BookingModel

    code = await _guest_code(BookingModel, booking)
    assert len(code) == 16

    page = await client.get(f"/api/v1/public/guest/{code}")
    assert page.status_code == 200, page.text
    body = page.json()
    assert (body["closed"], body["guest_name"], body["access"]) == (False, "Жалгас", None)
    assert (body["booking"]["total"], body["booking"]["remaining"], body["flat"]["name"]) == (40000, 40000, "Т13")
    assert "secret-wifi" not in page.text and "+7707" not in page.text and "t13" not in page.text

    paid = await client.post(f"/api/v1/bookings/{booking}/payments", json={"amount": 40000})
    assert paid.status_code == 201, paid.text
    await client.patch(f"/api/v1/bookings/{booking}/status", json={"status": "confirmed"})
    body = (await client.get(f"/api/v1/public/guest/{code}")).json()
    assert body["access"]["wifi_password"] == "secret-wifi" and body["access"]["facts"] == ["Код сейфа 4512"]

    assert (await client.get("/api/v1/public/guest/nosuchcodeatall0")).status_code == 404


async def _guest_code(model, booking_id) -> str:
    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
    from sqlalchemy.pool import NullPool

    from app.config import settings

    engine = create_async_engine(settings.DATABASE_URL, poolclass=NullPool)
    try:
        async with async_sessionmaker(engine)() as session:
            return await session.scalar(select(model.guest_code).where(model.id == uuid.UUID(booking_id)))
    finally:
        await engine.dispose()


@pytest.mark.integration
async def test_the_migration_gives_every_old_booking_its_own_code():
    import importlib.util
    from pathlib import Path

    import sqlalchemy as sa
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    from sqlalchemy.ext.asyncio import create_async_engine
    from sqlalchemy.pool import NullPool

    from app.config import settings

    path = Path(__file__).resolve().parents[1] / "alembic" / "versions" / "055_guest_codes.py"
    spec = importlib.util.spec_from_file_location("migration_055", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    def _down_up(sync_conn):
        with Operations.context(MigrationContext.configure(sync_conn)):
            module.downgrade()
            module.upgrade()

    engine = create_async_engine(settings.DATABASE_URL, poolclass=NullPool)
    try:
        async with engine.connect() as conn:
            trans = await conn.begin()
            try:
                await conn.run_sync(_down_up)
                rows = (await conn.execute(sa.text("SELECT guest_code FROM bookings"))).scalars().all()
                assert rows and all(len(c) == 16 for c in rows) and len(set(rows)) == len(rows)
            finally:
                await trans.rollback()
    finally:
        await engine.dispose()
