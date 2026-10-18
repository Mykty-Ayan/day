"""Unit tests for Gantt data service."""

import uuid
from datetime import date
from decimal import Decimal
from unittest.mock import AsyncMock

import pytest

from app.application.booking.get_gantt_data import GetGanttDataService
from app.domain.booking.entities import Booking, Guest
from app.domain.booking.value_objects import BookingSource, BookingStatus
from app.domain.property.entities import Property
from app.domain.property.value_objects import PropertyStatus, PropertyType


@pytest.mark.asyncio
async def test_gantt_returns_active_and_paused_properties_only():
    company_id = uuid.uuid4()
    start_date = date(2026, 2, 1)
    end_date = date(2026, 2, 28)

    active_property = Property(
        id=uuid.uuid4(),
        company_id=company_id,
        name="Active Property",
        internal_name="active-property",
        type=PropertyType.APARTMENT,
        status=PropertyStatus.ACTIVE,
    )
    paused_property = Property(
        id=uuid.uuid4(),
        company_id=company_id,
        name="Paused Property",
        internal_name="paused-property",
        type=PropertyType.APARTMENT,
        status=PropertyStatus.PAUSED,
    )
    new_property = Property(
        id=uuid.uuid4(),
        company_id=company_id,
        name="New Property",
        internal_name="new-property",
        type=PropertyType.APARTMENT,
        status=PropertyStatus.NEW,
    )

    guest_id = uuid.uuid4()
    active_booking = Booking(
        id=uuid.uuid4(),
        company_id=company_id,
        property_id=active_property.id,
        guest_id=guest_id,
        check_in=date(2026, 2, 10),
        check_out=date(2026, 2, 12),
        source=BookingSource.DIRECT,
        status=BookingStatus.CONFIRMED,
        total_price=Decimal("120.00"),
    )
    paused_booking = Booking(
        id=uuid.uuid4(),
        company_id=company_id,
        property_id=paused_property.id,
        guest_id=guest_id,
        check_in=date(2026, 2, 13),
        check_out=date(2026, 2, 15),
        source=BookingSource.DIRECT,
        status=BookingStatus.CONFIRMED,
        total_price=Decimal("180.00"),
    )
    guest = Guest(id=guest_id, company_id=company_id, name="Test Guest")

    property_repo = AsyncMock()
    booking_repo = AsyncMock()
    guest_repo = AsyncMock()

    property_repo.list_by_company.return_value = [active_property, paused_property, new_property]
    booking_repo.list_by_property_date_range.side_effect = [
        [active_booking],
        [paused_booking],
    ]
    guest_repo.get_by_id.return_value = guest

    service = GetGanttDataService(property_repo, booking_repo, guest_repo, AsyncMock())  # type: ignore[arg-type]
    result = await service.execute(company_id, start_date, end_date)

    property_repo.list_by_company.assert_any_await(
        company_id,
        offset=0,
        limit=200,
    )
    booking_repo.list_by_property_date_range.assert_any_await(
        active_property.id,
        start_date,
        end_date,
        company_id=company_id,
    )
    booking_repo.list_by_property_date_range.assert_any_await(
        paused_property.id,
        start_date,
        end_date,
        company_id=company_id,
    )
    assert guest_repo.get_by_id.await_count == 2

    assert len(result.properties) == 2
    statuses = {p.id: p.status for p in result.properties}
    assert statuses[active_property.id] == "active"
    assert statuses[paused_property.id] == "paused"
    assert new_property.id not in statuses


@pytest.mark.asyncio
async def test_gantt_shows_which_bookings_clash():
    # A booking an OTA sent onto nights already taken is flagged, not dropped;
    # the grid must say so, or nobody notices two guests for one flat.
    company_id = uuid.uuid4()
    flat = Property(
        id=uuid.uuid4(),
        company_id=company_id,
        name="P",
        internal_name="p",
        type=PropertyType.APARTMENT,
        status=PropertyStatus.ACTIVE,
    )
    clash = Booking(
        id=uuid.uuid4(),
        company_id=company_id,
        property_id=flat.id,
        guest_id=uuid.uuid4(),
        check_in=date(2026, 2, 10),
        check_out=date(2026, 2, 12),
        source=BookingSource.AIRBNB,
        status=BookingStatus.CONFIRMED,
        total_price=Decimal("1"),
        overbooking=True,
    )
    property_repo, booking_repo, guest_repo = AsyncMock(), AsyncMock(), AsyncMock()
    property_repo.list_by_company.return_value = [flat]
    booking_repo.list_by_property_date_range.return_value = [clash]
    guest_repo.get_by_id.return_value = None

    result = await GetGanttDataService(property_repo, booking_repo, guest_repo, AsyncMock()).execute(  # type: ignore[arg-type]
        company_id, date(2026, 2, 1), date(2026, 2, 28)
    )
    assert result.properties[0].bookings[0].overbooking is True


def test_the_booking_answer_carries_the_clash_flag():
    from app.presentation.api.v1.bookings import _to_booking_response

    booking = Booking(
        company_id=uuid.uuid4(),
        property_id=uuid.uuid4(),
        guest_id=uuid.uuid4(),
        check_in=date(2026, 2, 10),
        check_out=date(2026, 2, 12),
        overbooking=True,
    )
    assert _to_booking_response(booking).overbooking is True


async def test_the_chessboard_shows_each_flats_closed_nights():
    from app.domain.booking.entities import PropertyBlock

    company_id = uuid.uuid4()
    flat = Property(
        id=uuid.uuid4(), company_id=company_id, name="Студия", internal_name="62auc",
        type=PropertyType.APARTMENT, status=PropertyStatus.ACTIVE,
    )
    other = Property(
        id=uuid.uuid4(), company_id=company_id, name="Двушка", internal_name="89auc",
        type=PropertyType.APARTMENT, status=PropertyStatus.ACTIVE,
    )
    block = PropertyBlock(
        company_id=company_id, property_id=flat.id, start_date=date(2026, 2, 10), end_date=date(2026, 2, 12),
        reason="Ремонт",
    )
    property_repo, booking_repo, guest_repo = AsyncMock(), AsyncMock(), AsyncMock()
    property_repo.list_by_company.return_value = [flat, other]
    booking_repo.list_by_property_date_range.return_value = []
    booking_repo.list_company_blocks.return_value = [block]

    result = await GetGanttDataService(property_repo, booking_repo, guest_repo, AsyncMock()).execute(  # type: ignore[arg-type]
        company_id, date(2026, 2, 1), date(2026, 2, 28)
    )
    booking_repo.list_company_blocks.assert_awaited_once_with(company_id, date(2026, 2, 1), date(2026, 2, 28))
    by_flat = {p.internal_name: p.blocks for p in result.properties}
    assert [(b.start_date, b.end_date, b.reason) for b in by_flat["62auc"]] == [
        (date(2026, 2, 10), date(2026, 2, 12), "Ремонт")
    ]
    assert by_flat["89auc"] == []


async def test_the_chessboard_knows_an_hourly_flat():
    # An hourly flat's cell opens the hourly form, and a block's first and last
    # days stay open by the hour: the page needs the flat's rental mode.
    from app.domain.booking.value_objects import RentalMode
    from app.presentation.api.v1.bookings import _build_gantt_response

    company_id = uuid.uuid4()
    flat = Property(
        id=uuid.uuid4(), company_id=company_id, name="Студия", internal_name="28auc",
        type=PropertyType.APARTMENT, status=PropertyStatus.ACTIVE, rental_mode=RentalMode.HOURLY,
    )
    property_repo, booking_repo, guest_repo = AsyncMock(), AsyncMock(), AsyncMock()
    property_repo.list_by_company.return_value = [flat]
    booking_repo.list_by_property_date_range.return_value = []
    booking_repo.list_company_blocks.return_value = []

    result = await GetGanttDataService(property_repo, booking_repo, guest_repo, AsyncMock()).execute(  # type: ignore[arg-type]
        company_id, date(2026, 2, 1), date(2026, 2, 28)
    )
    assert _build_gantt_response(result).properties[0].rental_mode == RentalMode.HOURLY
