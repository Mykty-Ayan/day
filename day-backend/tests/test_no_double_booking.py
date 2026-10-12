"""No two active bookings of one property may share a night.

The services check overlaps with a SELECT before they write, but two requests
that run at the same time both pass that SELECT. Only the database can refuse
the second one, so the constraint itself is tested against PostgreSQL here.
"""

import asyncio
import contextlib
import uuid
from datetime import datetime, timedelta

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.config import settings
from app.domain.auth.permissions import Permission
from app.domain.booking.entities import Booking
from app.domain.booking.exceptions import BookingOverlapError
from app.domain.booking.value_objects import BookingStatus
from app.main import app
from app.presentation.api.deps import Principal, get_principal

COMPANY_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")


# ---------- HTTP: an overlap is a conflict, not a bad request ----------


class _Session:
    async def commit(self):
        pass

    async def rollback(self):
        pass


@pytest.fixture
def overlapping(monkeypatch):
    """Every booking service refuses with an overlap."""
    from app.application.booking import create_booking, move_booking, update_booking
    from app.presentation.api import deps

    async def refuse(*args, **kwargs):
        raise BookingOverlapError("Date range overlaps with existing booking")

    for module, cls in (
        (create_booking, "CreateBookingService"),
        (update_booking, "UpdateBookingService"),
        (move_booking, "MoveBookingService"),
    ):
        monkeypatch.setattr(getattr(module, cls), "execute", refuse)
    app.dependency_overrides[deps.get_session] = lambda: _Session()
    app.dependency_overrides[get_principal] = lambda: Principal(
        company_id=COMPANY_ID,
        permissions=frozenset({Permission.BOOKINGS_WRITE}),
        kind="api_key",
        api_key_id=uuid.uuid4(),
        actor_id=uuid.uuid4(),
    )
    yield
    app.dependency_overrides.pop(deps.get_session, None)
    app.dependency_overrides.pop(get_principal, None)


@pytest.mark.parametrize(
    "method,path,body",
    [
        (
            "POST",
            "/api/v1/bookings",
            {
                "property_id": str(uuid.uuid4()),
                "guest_name": "Guest",
                "check_in": "2026-11-01T14:00:00",
                "check_out": "2026-11-03T12:00:00",
            },
        ),
        ("PATCH", f"/api/v1/bookings/{uuid.uuid4()}", {"check_in": "2026-11-01T14:00:00"}),
        ("POST", f"/api/v1/bookings/{uuid.uuid4()}/move", {"target_property_id": str(uuid.uuid4())}),
    ],
)
async def test_an_overlap_is_a_409(overlapping, method, path, body):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.request(method, path, json=body)
    assert response.status_code == 409
    assert response.json()["detail"] == "Date range overlaps with existing booking"


# ---------- SQL (needs PostgreSQL) ----------


@contextlib.asynccontextmanager
async def _engine():
    engine = create_async_engine(settings.DATABASE_URL, poolclass=NullPool)
    try:
        yield async_sessionmaker(engine, expire_on_commit=False)
    finally:
        await engine.dispose()


async def _property_and_guest(session):
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


def _stay(company, prop_id, guest_id, day_in, day_out, **kw) -> Booking:
    return Booking(
        company_id=company,
        property_id=prop_id,
        guest_id=guest_id,
        check_in=datetime(2026, 11, day_in, 14),
        check_out=datetime(2026, 11, day_out, 12),
        status=kw.pop("status", BookingStatus.CONFIRMED),
        **kw,
    )


@pytest.mark.integration
async def test_the_database_refuses_a_second_stay_on_the_same_nights():
    from app.infrastructure.repositories.booking import SqlBookingRepository

    async with _engine() as maker, maker() as session:
        try:
            company, prop, guest = await _property_and_guest(session)
            repo = SqlBookingRepository(session)
            await repo.create(_stay(company, prop, guest, 1, 5))

            with pytest.raises(BookingOverlapError, match="overlaps"):
                await repo.create(_stay(company, prop, guest, 3, 7))

            # The refusal rolled back only its own savepoint: the transaction
            # is still usable, so the caller can answer and carry on.
            await repo.create(_stay(company, prop, guest, 5, 7))  # 12:00 out, 14:00 in
        finally:
            await session.rollback()


@pytest.mark.integration
async def test_what_does_not_hold_the_nights():
    from app.infrastructure.repositories.booking import SqlBookingRepository

    async with _engine() as maker, maker() as session:
        try:
            company, prop, guest = await _property_and_guest(session)
            repo = SqlBookingRepository(session)
            await repo.create(_stay(company, prop, guest, 1, 5, status=BookingStatus.CANCELLED))
            await repo.create(_stay(company, prop, guest, 1, 5, status=BookingStatus.COMPLETED))
            await repo.create(_stay(company, prop, guest, 1, 5))
            # An OTA stay Day had to accept on top of another one.
            flagged = await repo.create(_stay(company, prop, guest, 2, 4, overbooking=True))
            assert flagged.overbooking is True

            # Same nights on another property are fine.
            _, other_prop, other_guest = await _property_and_guest(session)
            await repo.create(_stay(company, other_prop, other_guest, 1, 5))
        finally:
            await session.rollback()


@pytest.mark.integration
async def test_an_update_into_taken_nights_is_refused():
    from app.infrastructure.repositories.booking import SqlBookingRepository

    async with _engine() as maker, maker() as session:
        try:
            company, prop, guest = await _property_and_guest(session)
            repo = SqlBookingRepository(session)
            await repo.create(_stay(company, prop, guest, 1, 5))
            later = await repo.create(_stay(company, prop, guest, 10, 12))

            later.check_in = datetime(2026, 11, 4, 14)
            with pytest.raises(BookingOverlapError):
                await repo.update(later)
        finally:
            await session.rollback()


@pytest.mark.integration
async def test_two_transactions_racing_for_the_same_nights_give_one_booking():
    """The race the SELECT-then-INSERT check cannot see."""
    from app.infrastructure.models.booking import BookingModel, GuestModel
    from app.infrastructure.models.property import PropertyModel
    from app.infrastructure.repositories.booking import SqlBookingRepository

    async with _engine() as maker:
        async with maker() as setup:
            company, prop, guest = await _property_and_guest(setup)
            await setup.commit()
        try:
            async with maker() as a, maker() as b:
                # Both requests already passed the overlap SELECT: neither sees
                # the other's uncommitted row.
                await SqlBookingRepository(a).create(_stay(company, prop, guest, 1, 5))
                second = asyncio.create_task(SqlBookingRepository(b).create(_stay(company, prop, guest, 2, 6)))
                await asyncio.sleep(0.3)
                assert not second.done()  # b waits on a's row
                await a.commit()

                with pytest.raises(BookingOverlapError):
                    await second
                await b.rollback()
        finally:
            async with maker() as cleanup:
                await cleanup.execute(delete(BookingModel).where(BookingModel.company_id == company))
                await cleanup.execute(delete(GuestModel).where(GuestModel.company_id == company))
                await cleanup.execute(delete(PropertyModel).where(PropertyModel.company_id == company))
                await cleanup.commit()


@pytest.mark.integration
async def test_hourly_stays_on_one_day_can_follow_each_other():
    from app.domain.booking.value_objects import RentalMode
    from app.infrastructure.repositories.booking import SqlBookingRepository

    async with _engine() as maker, maker() as session:
        try:
            company, prop, guest = await _property_and_guest(session)
            repo = SqlBookingRepository(session)
            day = datetime(2026, 11, 1)

            def hours(start, end):
                return Booking(
                    company_id=company, property_id=prop, guest_id=guest,
                    check_in=day + timedelta(hours=start), check_out=day + timedelta(hours=end),
                    rental_mode=RentalMode.HOURLY, status=BookingStatus.CONFIRMED,
                )

            await repo.create(hours(10, 13))
            await repo.create(hours(13, 15))
            with pytest.raises(BookingOverlapError):
                await repo.create(hours(14, 16))
        finally:
            await session.rollback()
