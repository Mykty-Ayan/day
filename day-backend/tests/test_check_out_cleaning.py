"""Checking a guest out in the cabinet puts a cleaning on the flat: the owner
checked out a stay on production and no cleaning appeared."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool

from app.application.booking.change_booking_status import ChangeBookingStatusService
from app.config import settings
from app.domain.booking.value_objects import BookingStatus
from app.domain.cleaning.value_objects import CleaningStatus, CleaningType
from app.domain.settings.entities import DEFAULT_TIME_ZONE
from app.infrastructure.models.cleaning import CleaningTaskModel
from tests.test_booking_services import COMPANY_ID, FakeBookingAuditLogRepository, FakeBookingRepository, _make_booking
from tests.test_cleaning_services import FakeCleaningTaskRepository, FakePropertyRepository, _make_property, _make_task
from tests.test_crm_booking_create import _body, crm  # noqa: F401  (a fixture)


def _today() -> date:
    return datetime.now(ZoneInfo(DEFAULT_TIME_ZONE)).date()


async def _setup(check_out: date, status=BookingStatus.CHECKED_IN):
    bookings = FakeBookingRepository()
    properties = FakePropertyRepository()
    tasks = FakeCleaningTaskRepository()
    prop = _make_property()
    await properties.save(prop)
    booking = await bookings.create(
        _make_booking(prop.id, check_in=check_out - timedelta(days=2), check_out=check_out, status=status)
    )
    service = ChangeBookingStatusService(
        bookings, FakeBookingAuditLogRepository(), task_repo=tasks, property_repo=properties
    )
    return service, booking, tasks, prop


@pytest.mark.asyncio
async def test_a_check_out_puts_a_cleaning_on_the_flat():
    today = _today()
    service, booking, tasks, prop = await _setup(today)

    await service.execute(booking.id, COMPANY_ID, BookingStatus.CHECKED_OUT)

    [task] = await tasks.list_by_property(prop.id)
    assert task.type == CleaningType.POST_CHECKOUT
    assert task.booking_id == booking.id
    assert task.scheduled_date == today
    assert task.status == CleaningStatus.PENDING


@pytest.mark.asyncio
async def test_an_open_cleaning_is_not_doubled():
    service, booking, tasks, prop = await _setup(_today())
    await tasks.create(_make_task(property_id=prop.id))

    await service.execute(booking.id, COMPANY_ID, BookingStatus.CHECKED_OUT)

    assert len(await tasks.list_by_property(prop.id)) == 1


@pytest.mark.asyncio
async def test_a_stay_the_maid_already_cleaned_is_not_cleaned_twice():
    service, booking, tasks, prop = await _setup(_today())
    await tasks.create(_make_task(property_id=prop.id, status=CleaningStatus.DONE, booking_id=booking.id))

    await service.execute(booking.id, COMPANY_ID, BookingStatus.CHECKED_OUT)

    assert len(await tasks.list_by_property(prop.id)) == 1


@pytest.mark.asyncio
async def test_a_stay_closed_the_next_morning_still_gets_its_cleaning():
    service, booking, tasks, prop = await _setup(_today() - timedelta(days=1))

    await service.execute(booking.id, COMPANY_ID, BookingStatus.CHECKED_OUT)

    assert len(await tasks.list_by_property(prop.id)) == 1


@pytest.mark.asyncio
async def test_a_stay_closed_days_late_gets_no_cleaning():
    service, booking, tasks, prop = await _setup(_today() - timedelta(days=3))

    await service.execute(booking.id, COMPANY_ID, BookingStatus.CHECKED_OUT)

    assert await tasks.list_by_property(prop.id) == []


@pytest.mark.asyncio
async def test_other_status_changes_make_no_cleaning():
    service, booking, tasks, prop = await _setup(_today(), status=BookingStatus.CHECKED_OUT)

    await service.execute(booking.id, COMPANY_ID, BookingStatus.COMPLETED)

    assert await tasks.list_by_property(prop.id) == []


@pytest.mark.integration
async def test_a_check_out_through_the_api_leaves_a_cleaning(crm):  # noqa: F811  (the imported fixture)
    client, prop = crm
    tomorrow = _today() + timedelta(days=1)
    created = await client.post(
        "/api/v1/bookings",
        json=_body(prop, check_in=f"{tomorrow}T14:00:00", check_out=f"{tomorrow + timedelta(days=1)}T12:00:00"),
    )
    assert created.status_code == 201, created.text
    path = f"/api/v1/bookings/{created.json()['id']}/status"

    for status in ("confirmed", "checked_in", "checked_out"):
        changed = await client.post(path, json={"target_status": status})
        assert changed.status_code == 200, changed.text

    engine = create_async_engine(settings.DATABASE_URL, poolclass=NullPool)
    async with AsyncSession(engine) as session:
        tasks = (await session.scalars(select(CleaningTaskModel).where(CleaningTaskModel.property_id == prop))).all()
        assert [task.status for task in tasks] == ["pending"]
        await session.execute(delete(CleaningTaskModel).where(CleaningTaskModel.property_id == prop))
        await session.commit()
    await engine.dispose()
