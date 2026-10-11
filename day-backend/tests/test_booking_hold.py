"""A hold: a pending booking that lets its nights go if nobody confirms it.

The CRM's AI holds dates at night and the owner confirms in the morning. A hold
the owner never confirms must not keep the flat off sale forever.
"""

import contextlib
import uuid
from datetime import date, datetime, timedelta

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.application.booking.create_booking import CreateBookingInput, CreateBookingService
from app.application.booking.expire_holds import ExpireHoldsService
from app.application.booking.update_booking import UpdateBookingInput, UpdateBookingService
from app.config import settings
from app.domain.booking.entities import Booking
from app.domain.booking.value_objects import BookingAuditAction, BookingStatus
from tests.test_booking_services import (
    COMPANY_ID,
    FakeBookingAuditLogRepository,
    FakeBookingRepository,
    FakeGuestRepository,
    FakePricingConfigRepository,
    FakePropertyRepository,
    _build_price_calculator,
    _make_booking,
    _make_pricing_config,
    _make_property,
)
from tests.test_crm_booking_create import _body, crm  # noqa: F401  (a fixture)

NOW = datetime(2026, 10, 11, 21, 0)  # 02:00 in Almaty


# ---------- the entity ----------


def test_confirming_ends_the_hold():
    booking = Booking(status=BookingStatus.PENDING, expires_at=NOW)
    booking.change_status(BookingStatus.CONFIRMED)
    assert booking.expires_at is None


def test_cancelling_keeps_the_expiry_for_the_record():
    booking = Booking(status=BookingStatus.PENDING, expires_at=NOW)
    booking.change_status(BookingStatus.CANCELLED)
    assert booking.expires_at == NOW


# ---------- create and update ----------


async def _services():
    bookings, props, pricing, audit = (
        FakeBookingRepository(), FakePropertyRepository(), FakePricingConfigRepository(),
        FakeBookingAuditLogRepository(),
    )
    prop = _make_property()
    await props.save(prop)
    await pricing.save(_make_pricing_config(prop.id))
    calc = _build_price_calculator(pricing_repo=pricing)
    create = CreateBookingService(bookings, FakeGuestRepository(), props, audit, calc)
    update = UpdateBookingService(bookings, props, audit, calc)
    return bookings, audit, create, update, prop


def _hold(prop_id, expires_at) -> CreateBookingInput:
    return CreateBookingInput(
        company_id=COMPANY_ID, property_id=prop_id, guest_name="Guest",
        check_in=date(2026, 11, 1), check_out=date(2026, 11, 3), expires_at=expires_at,
    )


async def test_a_booking_can_be_created_as_a_hold():
    _, _, create, _, prop = await _services()
    until = datetime.utcnow() + timedelta(hours=8)
    booking = await create.execute(_hold(prop.id, until))
    assert (booking.status, booking.expires_at) == (BookingStatus.PENDING, until)


async def test_a_hold_that_has_already_expired_is_refused():
    _, _, create, _, prop = await _services()
    with pytest.raises(ValueError, match="expires_at must be in the future"):
        await create.execute(_hold(prop.id, datetime.utcnow() - timedelta(minutes=1)))


async def test_a_hold_can_be_extended_and_released():
    bookings, _, create, update, prop = await _services()
    booking = await create.execute(_hold(prop.id, datetime.utcnow() + timedelta(hours=1)))
    later = datetime.utcnow() + timedelta(hours=10)

    extended = await update.execute(UpdateBookingInput(booking_id=booking.id, company_id=COMPANY_ID, expires_at=later))
    assert extended.expires_at == later

    released = await update.execute(UpdateBookingInput(booking_id=booking.id, company_id=COMPANY_ID, expires_at=None))
    assert released.expires_at is None


async def test_only_a_pending_booking_can_hold():
    bookings, _, _, update, prop = await _services()
    booking = _make_booking(prop.id, status=BookingStatus.CONFIRMED)
    await bookings.create(booking)
    with pytest.raises(ValueError, match="Only a pending booking can hold dates"):
        await update.execute(
            UpdateBookingInput(
                booking_id=booking.id, company_id=COMPANY_ID, expires_at=datetime.utcnow() + timedelta(hours=1)
            )
        )


# ---------- the sweep ----------


async def test_the_sweep_cancels_only_pending_holds_that_ran_out():
    bookings, audit = FakeBookingRepository(), FakeBookingAuditLogRepository()
    prop = uuid.uuid4()
    ran_out = _make_booking(prop, expires_at=NOW - timedelta(seconds=1))
    running = _make_booking(
        prop, check_in=date(2025, 7, 1), check_out=date(2025, 7, 3), expires_at=NOW + timedelta(hours=1)
    )
    confirmed = _make_booking(
        prop, check_in=date(2025, 8, 1), check_out=date(2025, 8, 3), status=BookingStatus.CONFIRMED,
        expires_at=NOW - timedelta(hours=1),
    )
    no_hold = _make_booking(prop, check_in=date(2025, 9, 1), check_out=date(2025, 9, 3))
    for b in (ran_out, running, confirmed, no_hold):
        await bookings.create(b)

    cancelled = await ExpireHoldsService(bookings, audit).execute(NOW)

    assert [b.id for b in cancelled] == [ran_out.id]
    assert (await bookings.get_by_id(ran_out.id)).status == BookingStatus.CANCELLED
    assert (await bookings.get_by_id(running.id)).status == BookingStatus.PENDING
    assert (await bookings.get_by_id(confirmed.id)).status == BookingStatus.CONFIRMED
    assert (await bookings.get_by_id(no_hold.id)).status == BookingStatus.PENDING
    [log] = await audit.list_by_booking(ran_out.id)
    assert (log.action, log.old_value, log.new_value, log.changed_by) == (
        BookingAuditAction.STATUS_CHANGE, "pending", "cancelled", None,
    )


# ---------- HTTP ----------


@pytest.mark.parametrize("value", ["2026-10-12T09:00:00", "tomorrow"])
async def test_expires_at_must_carry_its_zone(value):
    from app.domain.auth.permissions import Permission
    from app.main import app
    from app.presentation.api.deps import Principal, get_principal

    app.dependency_overrides[get_principal] = lambda: Principal(
        company_id=COMPANY_ID, permissions=frozenset({Permission.BOOKINGS_WRITE}), kind="api_key",
        api_key_id=uuid.uuid4(), actor_id=uuid.uuid4(),
    )
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                "/api/v1/bookings",
                json={
                    "property_id": str(uuid.uuid4()), "guest_name": "G",
                    "check_in": "2026-11-01T14:00:00", "check_out": "2026-11-03T12:00:00",
                    "expires_at": value,
                },
            )
    finally:
        app.dependency_overrides.pop(get_principal, None)
    assert response.status_code == 422


# ---------- PostgreSQL ----------


@contextlib.asynccontextmanager
async def _maker():
    engine = create_async_engine(settings.DATABASE_URL, poolclass=NullPool)
    try:
        yield async_sessionmaker(engine, expire_on_commit=False)
    finally:
        await engine.dispose()


async def _flat(session):
    from app.infrastructure.models.booking import GuestModel
    from app.infrastructure.models.property import PropertyModel

    company = uuid.uuid4()
    prop = PropertyModel(
        id=uuid.uuid4(), company_id=company, name="P", internal_name=f"p-{company}",
        type="apartment", status="active", rental_mode="daily",
    )
    guest = GuestModel(id=uuid.uuid4(), company_id=company, name="G")
    session.add_all([prop, guest])
    await session.flush()
    return company, prop.id, guest.id


async def _cleanup(maker, company):
    from app.infrastructure.models.booking import BookingAuditLogModel, BookingModel, GuestModel
    from app.infrastructure.models.property import PropertyModel

    async with maker() as s:
        ids = (await s.scalars(select(BookingModel.id).where(BookingModel.company_id == company))).all()
        await s.execute(delete(BookingAuditLogModel).where(BookingAuditLogModel.booking_id.in_(ids)))
        await s.execute(delete(BookingModel).where(BookingModel.company_id == company))
        await s.execute(delete(GuestModel).where(GuestModel.company_id == company))
        await s.execute(delete(PropertyModel).where(PropertyModel.company_id == company))
        await s.commit()


@pytest.mark.integration
async def test_two_sweepers_never_take_the_same_hold():
    from app.infrastructure.repositories.booking import SqlBookingRepository

    async with _maker() as maker:
        async with maker() as setup:
            company, prop, guest = await _flat(setup)
            repo = SqlBookingRepository(setup)
            for week in range(3):
                start = datetime(2026, 11, 1, 14) + timedelta(weeks=week)
                await repo.create(
                    Booking(
                        company_id=company, property_id=prop, guest_id=guest,
                        check_in=start, check_out=start + timedelta(days=2),
                        status=BookingStatus.PENDING, expires_at=NOW - timedelta(minutes=week),
                    )
                )
            await setup.commit()
        try:
            async with maker() as a, maker() as b:
                first = await SqlBookingRepository(a).list_expired_holds(NOW, limit=2)
                second = await SqlBookingRepository(b).list_expired_holds(NOW, limit=10)
                mine = [x for x in first + second if x.company_id == company]
                assert len(mine) == 3
                assert len({x.id for x in mine}) == 3  # SKIP LOCKED: no hold twice
                await a.rollback()
                await b.rollback()
        finally:
            await _cleanup(maker, company)


@pytest.mark.integration
async def test_a_sweep_pass_cancels_and_commits():
    from app.infrastructure.hold_worker import run_once
    from app.infrastructure.repositories.booking import SqlBookingRepository

    async with _maker() as maker:
        async with maker() as setup:
            company, prop, guest = await _flat(setup)
            hold = await SqlBookingRepository(setup).create(
                Booking(
                    company_id=company, property_id=prop, guest_id=guest,
                    check_in=datetime(2026, 11, 1, 14), check_out=datetime(2026, 11, 3, 12),
                    status=BookingStatus.PENDING, expires_at=datetime.utcnow() - timedelta(seconds=5),
                )
            )
            await setup.commit()
        try:
            await run_once(maker)
            async with maker() as check:
                after = await SqlBookingRepository(check).get_by_id(hold.id)
            assert after.status == BookingStatus.CANCELLED
            assert after.updated_at > hold.updated_at  # so the feed shows it
        finally:
            await _cleanup(maker, company)


@pytest.mark.integration
async def test_a_hold_through_the_api(crm):  # noqa: F811  (the imported fixture)
    client, prop = crm

    created = await client.post("/api/v1/bookings", json=_body(prop, expires_at="2099-01-01T09:00:00+05:00"))
    assert created.status_code == 201, created.text
    assert created.json()["expires_at"] == "2099-01-01T04:00:00Z"
    path = f"/api/v1/bookings/{created.json()['id']}"

    extended = await client.patch(path, json={"expires_at": "2099-01-02T09:00:00+05:00"})
    assert extended.json()["expires_at"] == "2099-01-02T04:00:00Z"

    confirmed = await client.post(f"{path}/status", json={"target_status": "confirmed"})
    assert confirmed.json()["expires_at"] is None

    again = await client.patch(path, json={"expires_at": "2099-01-03T09:00:00+05:00"})
    assert again.status_code == 400
    assert again.json()["detail"] == "Only a pending booking can hold dates"

    past = await client.post(
        "/api/v1/bookings",
        json=_body(prop, check_in="2026-12-01T14:00:00", check_out="2026-12-03T12:00:00",
                   expires_at="2020-01-01T00:00:00Z"),
    )
    assert past.status_code == 400
    assert past.json()["detail"] == "expires_at must be in the future"
