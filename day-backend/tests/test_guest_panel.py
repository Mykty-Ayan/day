"""A guest's own page for their booking, by a link with no sign-in (/g/<code>).

The code names one booking. How to get in (instructions, Wi-Fi, guest facts)
leaves the server only for a confirmed or checked-in stay paid in full, from N
hours before check-in (the company's setting) until check-out. A closed booking
shows only that it is closed, and whom to write to.
"""

import uuid
from datetime import datetime, timezone
from decimal import Decimal
from types import SimpleNamespace

import pytest

from app.application.booking.guest_panel import GuestPanelService
from app.domain.booking.entities import Booking, Guest, new_guest_code
from app.domain.booking.value_objects import BookingStatus
from app.domain.property.entities import PropertyFact, PropertyPhoto
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


class _Photos:
    def __init__(self, *photos):
        self.photos = list(photos)

    async def list_by_property(self, property_id):
        return [p for p in self.photos if p.property_id == property_id]


class _Site:
    async def get(self, company_id):
        return CompanySite(company_id=company_id, slug="munar", title="Munar", whatsapp="77001234567")


class _Settings:
    async def get_by_company(self, company_id):
        return SimpleNamespace(time_zone="Asia/Almaty", secrets_lead_hours_daily=24, secrets_lead_hours_hourly=1)


def _setup(status=BookingStatus.CONFIRMED, paid=Decimal("40000"), total=Decimal("40000"), photos=None, **stay):
    flat_ = _make_property(
        name="Т13 у Байтерека", check_in_instructions="Подъезд 2, сейф у двери", wifi_name="T13",
        wifi_password="secret-wifi", house_rules="Не курить", address_full="Астана, Кабанбай батыра 11",
    )
    guest = Guest(company_id=COMPANY_ID, name="Жалгас", phone="+77079011161")
    booking = Booking(
        company_id=COMPANY_ID, property_id=flat_.id, guest_id=guest.id, status=status, total_price=total,
        check_in=datetime(2026, 10, 25, 14), check_out=datetime(2026, 10, 27, 12), guest_code=CODE,
    )
    for name, value in stay.items():
        setattr(booking, name, value)
    facts = _Facts(
        PropertyFact(company_id=COMPANY_ID, property_id=flat_.id, text="Код сейфа 4512", audience=FactAudience.GUEST),
        PropertyFact(company_id=COMPANY_ID, property_id=flat_.id, text="Рядом парк", audience=FactAudience.PUBLIC),
    )
    pictures = _Photos(*(photos(flat_.id) if photos else ()))
    return GuestPanelService(
        _Repo(booking), _Paid(paid), _Repo(guest), _Repo(flat_), facts, _Site(), _Settings(), photos=pictures
    )


# 25 Oct, 20:00 in Almaty is still the 25th there, 15:00 in UTC.
NOW = datetime(2026, 10, 25, 15, tzinfo=timezone.utc)


async def test_a_paid_confirmed_stay_shows_how_to_get_in():
    panel = await _setup().execute(CODE, NOW)
    assert panel.access is not None
    assert (panel.access.instructions, panel.access.wifi_password) == ("Подъезд 2, сейф у двери", "secret-wifi")
    # Only the guest facts: a public one is for the listing.
    assert panel.access.facts == ["Код сейфа 4512"]
    assert (panel.remaining, panel.today.isoformat()) == (Decimal("0"), "2026-10-25")


async def test_the_page_opens_on_the_flat_s_cover_never_on_a_check_in_photo():
    def photos(flat_id):
        return [
            PropertyPhoto(property_id=flat_id, url="https://s3/lock.jpg", audience=FactAudience.GUEST, is_cover=True),
            PropertyPhoto(property_id=flat_id, url="https://s3/kitchen.jpg", sort_order=1),
            PropertyPhoto(property_id=flat_id, url="https://s3/living.jpg", sort_order=2, is_cover=True),
        ]

    panel = await _setup(photos=photos).execute(CODE, NOW)
    assert panel.photo_url == "https://s3/living.jpg"
    assert GuestPanelResponse.from_panel(panel).flat.photo_url == "https://s3/living.jpg"
    # No public photo: no picture, and the page falls back to a plain header.
    assert (await _setup().execute(CODE, NOW)).photo_url is None


async def test_a_debt_or_a_pending_booking_keeps_the_door_code_back():
    for svc in (_setup(paid=Decimal("39999.99")), _setup(paid=Decimal("0")), _setup(status=BookingStatus.PENDING)):
        panel = await svc.execute(CODE, NOW)
        assert panel.access is None
        dumped = GuestPanelResponse.from_panel(panel).model_dump_json()
        assert "secret-wifi" not in dumped and "4512" not in dumped and "сейф" not in dumped
    assert (await _setup(paid=Decimal("10000")).execute(CODE, NOW)).remaining == Decimal("30000")


async def test_the_way_in_opens_n_hours_before_check_in_and_closes_at_check_out():
    from app.domain.booking.value_objects import RentalMode

    # NOW is 25 Oct, 20:00 in Almaty.
    far = await _setup(check_in=datetime(2026, 10, 26, 21), check_out=datetime(2026, 10, 28, 12)).execute(CODE, NOW)
    assert (far.access, far.lead_hours) == (None, 24)
    near = await _setup(check_in=datetime(2026, 10, 26, 19), check_out=datetime(2026, 10, 28, 12)).execute(CODE, NOW)
    assert near.access is not None
    gone = await _setup(check_in=datetime(2026, 10, 24, 14), check_out=datetime(2026, 10, 25, 19)).execute(CODE, NOW)
    assert gone.access is None
    # By the hour: one hour before.
    hourly = dict(rental_mode=RentalMode.HOURLY, check_out=datetime(2026, 10, 25, 23))
    early = await _setup(check_in=datetime(2026, 10, 25, 21, 30), **hourly).execute(CODE, NOW)
    assert (early.access, early.lead_hours) == (None, 1)
    assert (await _setup(check_in=datetime(2026, 10, 25, 20, 45), **hourly).execute(CODE, NOW)).access is not None
    page = GuestPanelResponse.from_panel(early)
    assert page.lead_hours == 1 and page.access is None


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
    from datetime import timedelta
    from zoneinfo import ZoneInfo

    # Arriving today: the way in opens 24 hours before check-in.
    today = datetime.now(ZoneInfo("Asia/Almaty")).date()
    stay = {"property_id": str(prop), "guest_name": "Жалгас", "guest_phone": "+77079011161",
            "check_in": f"{today}T14:00:00", "check_out": f"{today + timedelta(days=2)}T12:00:00",
            "rental_mode": "daily", "adults_count": 1, "total_price": 40000}
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
    # The payment confirms the booking by itself; confirming again is not needed.
    assert (await client.get(f"/api/v1/bookings/{booking}")).json()["booking"]["status"] == "confirmed"
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


# ---------- «I have left» ----------


class _Tasks:
    def __init__(self, *tasks):
        self.tasks = list(tasks)

    async def list_by_property(self, property_id, *, offset=0, limit=50):
        return [t for t in self.tasks if t.property_id == property_id]

    async def create(self, task):
        self.tasks.append(task)
        return task


def _checkout(
    status=BookingStatus.CHECKED_IN,
    tasks=None,
    check_in=datetime(2026, 10, 25, 14),
    check_out=datetime(2026, 10, 27, 12),
):
    from app.application.booking.guest_checkout import GuestCheckoutService

    flat_ = _make_property(name="Т13")
    guest = Guest(company_id=COMPANY_ID, name="Жалгас")
    booking = Booking(company_id=COMPANY_ID, property_id=flat_.id, guest_id=guest.id, status=status,
                      check_in=check_in, check_out=check_out, guest_code=CODE)
    tasks = tasks if tasks is not None else _Tasks()
    return GuestCheckoutService(_Repo(booking), _Repo(guest), _Repo(flat_), tasks, _Settings()), tasks, flat_


async def test_leaving_makes_a_cleaning_task_once_and_keeps_the_status():
    svc, tasks, flat_ = _checkout()
    left = await svc.execute(CODE, NOW)
    assert (left.cleaning_created, left.flat_name, left.guest_name) == (True, "Т13", "Жалгас")
    [task] = tasks.tasks
    assert (task.property_id, task.booking_id, task.scheduled_date.isoformat()) == (flat_.id, left.booking.id,
                                                                                   "2026-10-25")
    assert left.booking.status == BookingStatus.CHECKED_IN
    # Pressed again: the open task is there already.
    assert (await svc.execute(CODE, NOW)).cleaning_created is False
    assert len(tasks.tasks) == 1


async def test_leaving_needs_a_stay_that_began():
    from app.application.booking.guest_checkout import NotStayingError

    for status, check_in in ((BookingStatus.PENDING, datetime(2026, 10, 25, 14)),
                             (BookingStatus.CANCELLED, datetime(2026, 10, 25, 14)),
                             (BookingStatus.CONFIRMED, datetime(2026, 10, 26, 14))):
        svc, tasks, _ = _checkout(status=status, check_in=check_in)
        with pytest.raises(NotStayingError):
            await svc.execute(CODE, NOW)
        assert tasks.tasks == []
    # A stay long over, never moved to checked out: the old link must not raise a false
    # "guest left" nor send a cleaner into the next guest's flat.
    svc, tasks, _ = _checkout(
        status=BookingStatus.CONFIRMED, check_in=datetime(2026, 10, 10, 14), check_out=datetime(2026, 10, 12, 12)
    )
    with pytest.raises(NotStayingError):
        await svc.execute(CODE, NOW)
    assert tasks.tasks == []
    svc, *_ = _checkout()
    with pytest.raises(LookupError):
        await svc.execute("nosuchcodeatall0", NOW)


def test_the_host_hears_the_guest_left_with_a_button_to_the_booking():
    from starlette.requests import Request

    from app.application.messaging.notifications import NotificationDispatcher, render
    from app.domain.messaging.entities import OutboundNotification
    from app.domain.messaging.value_objects import Channel, NotificationEvent
    from app.infrastructure.rate_limiter import _limit_for

    payload = {"property_name": "Т13", "guest_name": "Жалгас", "cleaning_created": True, "booking_id": "b1"}
    text = render(NotificationEvent.GUEST_CHECKED_OUT, payload)
    assert "Гость выехал" in text and "Т13" in text and "Жалгас" in text and "уборки" in text
    note = OutboundNotification(company_id=COMPANY_ID, channel=Channel.TELEGRAM, target="12345",
                                event=NotificationEvent.GUEST_CHECKED_OUT, payload=payload)
    [button] = NotificationDispatcher(None, {}, mini_app_url="https://day.test/tma")._buttons(note)
    assert button.url == "https://day.test/tma?booking=b1"
    path = f"/api/v1/public/guest/{CODE}/checked-out"
    post = Request({"type": "http", "method": "POST", "path": path, "headers": []})
    assert _limit_for(post) == ("guestbook", 5)


@pytest.mark.integration
async def test_the_owner_sets_the_hours_and_the_guest_marks_leaving(flat):  # noqa: F811  (the imported fixture)
    from app.domain.auth.permissions import Permission
    from app.infrastructure.models.booking import BookingModel

    client, prop, use = flat
    use(Permission.SETTINGS_READ, Permission.SETTINGS_WRITE, Permission.BOOKINGS_READ, Permission.BOOKINGS_WRITE,
        Permission.PROPERTIES_READ, Permission.CLEANING_READ)
    for wrong in (-1, 169):
        assert (await client.patch("/api/v1/settings", json={"secrets_lead_hours_daily": wrong})).status_code == 422
    hours = {"secrets_lead_hours_daily": 48, "secrets_lead_hours_hourly": 2}
    saved = await client.patch("/api/v1/settings", json=hours)
    assert saved.status_code == 200, saved.text
    assert (saved.json()["secrets_lead_hours_daily"], saved.json()["secrets_lead_hours_hourly"]) == (48, 2)

    from datetime import timedelta
    from zoneinfo import ZoneInfo

    today = datetime.now(ZoneInfo("Asia/Almaty")).date()
    stay = {"property_id": str(prop), "guest_name": "Жалгас", "guest_phone": "+77079011163",
            "check_in": f"{today}T14:00:00", "check_out": f"{today + timedelta(days=1)}T12:00:00",
            "rental_mode": "daily", "adults_count": 1}
    booking = (await client.post("/api/v1/bookings", json=stay)).json()["id"]
    code = await _guest_code(BookingModel, booking)
    assert (await client.get(f"/api/v1/public/guest/{code}")).json()["lead_hours"] == 48
    path = f"/api/v1/public/guest/{code}/checked-out"
    assert (await client.post(path)).status_code == 409  # still pending
    await client.post(f"/api/v1/bookings/{booking}/status", json={"status": "confirmed"})
    first = await client.post(path)
    assert (first.status_code, first.json()) == (200, {"cleaning_created": True})
    assert (await client.post(path)).json() == {"cleaning_created": False}
    tasks = (await client.get("/api/v1/cleaning", params={"property_id": str(prop)})).json()
    items = tasks["items"] if isinstance(tasks, dict) else tasks
    assert [t["booking_id"] for t in items] == [booking]
    assert (await client.get(f"/api/v1/bookings/{booking}")).json()["booking"]["status"] == "confirmed"
