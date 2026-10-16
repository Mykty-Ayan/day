"""An apartment's own check-in and check-out hours, and how the guest gets in."""

from datetime import date, datetime

import pytest
from pydantic import ValidationError

from app.application.booking.create_booking import apply_default_times
from app.domain.booking.value_objects import RentalMode
from app.domain.property.value_objects import CheckInMethod
from app.presentation.schemas.property import PropertyCreate, PropertyUpdate


def test_a_date_only_stay_takes_the_flats_own_hours():
    check_in, check_out = apply_default_times(
        date(2026, 11, 1), date(2026, 11, 3), RentalMode.DAILY, check_in_hour=15, check_out_hour=11
    )
    assert (check_in, check_out) == (datetime(2026, 11, 1, 15), datetime(2026, 11, 3, 11))


def test_without_its_own_hours_the_company_default_applies():
    check_in, check_out = apply_default_times(date(2026, 11, 1), date(2026, 11, 3), RentalMode.DAILY)
    assert (check_in.hour, check_out.hour) == (14, 12)


def test_hours_must_leave_room_for_a_same_day_turnover():
    # Check-out after check-in would make back-to-back stays overlap.
    with pytest.raises(ValidationError):
        PropertyUpdate(check_in_hour=11, check_out_hour=14)
    with pytest.raises(ValidationError):
        PropertyCreate(name="Т", internal_name="t", check_in_hour=24)
    assert PropertyUpdate(check_in_hour=15, check_out_hour=11).check_in_hour == 15


def test_the_check_in_methods_are_the_ones_guests_know():
    assert {m.value for m in CheckInMethod} == {
        "lockbox", "keypad", "smart_lock", "building_staff", "host_greets", "other"
    }


# ---------- the flat's hours everywhere a daily stay gets its times ----------


async def test_a_patch_of_one_hour_is_checked_against_the_saved_other():
    from app.application.property.update_property import UpdatePropertyInput
    from tests.test_property_services import COMPANY_ID, TestUpdatePropertyService

    _, _, svc, prop = await TestUpdatePropertyService()._setup()
    prop.check_in_hour, prop.check_out_hour = 15, 11

    # 10:00 in, 11:00 out: the next guest arrives before the last one leaves.
    with pytest.raises(ValueError, match="Check-out hour"):
        await svc.execute(UpdatePropertyInput(property_id=prop.id, company_id=COMPANY_ID, check_in_hour=10))
    assert prop.check_in_hour == 15


async def test_one_hour_on_create_is_checked_against_the_default_other():
    from app.application.property.create_property import CreatePropertyInput, CreatePropertyService
    from app.domain.property.value_objects import PropertyType
    from tests.test_booking_services import FakePropertyRepository
    from tests.test_property_services import COMPANY_ID, FakePropertyAuditLogRepository

    svc = CreatePropertyService(FakePropertyRepository(), FakePropertyAuditLogRepository())
    # 10:00 in against the default 12:00 out.
    with pytest.raises(ValueError, match="Check-out hour"):
        await svc.execute(
            CreatePropertyInput(
                company_id=COMPANY_ID, name="Т", internal_name="t", type=PropertyType.APARTMENT, check_in_hour=10
            )
        )


async def _flat_with_hours(check_in_hour, check_out_hour):
    from decimal import Decimal

    from app.application.booking.update_booking import UpdateBookingService
    from tests.test_booking_services import (
        FakeBookingAuditLogRepository,
        FakeBookingRepository,
        FakePricingConfigRepository,
        FakePropertyRepository,
        _build_price_calculator,
        _make_pricing_config,
        _make_property,
    )

    flat = _make_property()
    flat.check_in_hour, flat.check_out_hour = check_in_hour, check_out_hour
    properties = FakePropertyRepository()
    await properties.save(flat)
    pricing = FakePricingConfigRepository()
    await pricing.save(_make_pricing_config(flat.id, Decimal("100")))
    bookings = FakeBookingRepository()
    svc = UpdateBookingService(
        bookings, properties, FakeBookingAuditLogRepository(), _build_price_calculator(pricing_repo=pricing)
    )
    return flat, properties, bookings, svc


async def test_moving_a_stay_keeps_the_flats_hours():
    from app.application.booking.update_booking import UpdateBookingInput
    from app.domain.booking.entities import Booking
    from tests.test_booking_services import COMPANY_ID

    flat, _, bookings, svc = await _flat_with_hours(16, 10)
    stay = await bookings.create(
        Booking(company_id=COMPANY_ID, property_id=flat.id, check_in=datetime(2026, 11, 1, 16),
                check_out=datetime(2026, 11, 3, 10))
    )

    moved = await svc.execute(
        UpdateBookingInput(booking_id=stay.id, company_id=COMPANY_ID, check_in=datetime(2026, 11, 5),
                           check_out=datetime(2026, 11, 7))
    )

    assert (moved.check_in, moved.check_out) == (datetime(2026, 11, 5, 16), datetime(2026, 11, 7, 10))


async def test_changing_the_party_leaves_saved_times_alone():
    from app.application.booking.update_booking import UpdateBookingInput
    from app.domain.booking.entities import Booking
    from tests.test_booking_services import COMPANY_ID

    # Midnight is a legal hour of the flat; it must not read as "no time given".
    flat, _, bookings, svc = await _flat_with_hours(0, 0)
    stay = await bookings.create(
        Booking(company_id=COMPANY_ID, property_id=flat.id, check_in=datetime(2026, 11, 1),
                check_out=datetime(2026, 11, 3))
    )

    updated = await svc.execute(UpdateBookingInput(booking_id=stay.id, company_id=COMPANY_ID, adults_count=2))

    assert (updated.check_in, updated.check_out) == (datetime(2026, 11, 1), datetime(2026, 11, 3))


class _CompanyRange:
    """Bookings of a company that overlap a date range, as the SQL repository returns them:
    the dates compare as midnight."""

    def __init__(self, rows):
        self._rows = rows

    async def list_company_blocks(self, company_id, date_from, date_to):
        return []  # no flat is closed in these cases

    async def list_by_company_date_range(self, company_id, start_date, end_date):
        return [
            b for b in self._rows
            if b.company_id == company_id
            and b.check_in < datetime.combine(end_date, datetime.min.time())
            and b.check_out > datetime.combine(start_date, datetime.min.time())
        ]


async def test_a_flat_free_from_its_own_check_in_hour_is_offered():
    from app.application.booking.check_availability import CheckAvailabilityService
    from app.domain.booking.entities import Booking
    from app.domain.booking.value_objects import BookingStatus
    from tests.test_booking_services import COMPANY_ID, _build_price_calculator

    flat, properties, _, _ = await _flat_with_hours(16, 15)
    # The last guest leaves at 15:00; this flat takes the next one at 16:00.
    leaving = Booking(company_id=COMPANY_ID, property_id=flat.id, check_in=datetime(2026, 10, 30, 16),
                      check_out=datetime(2026, 11, 1, 15), status=BookingStatus.CONFIRMED)
    svc = CheckAvailabilityService(properties, _CompanyRange([leaving]), _build_price_calculator())

    for check_in, check_out in [(date(2026, 11, 1), date(2026, 11, 2)), (datetime(2026, 11, 1), datetime(2026, 11, 2))]:
        found = await svc.execute(COMPANY_ID, check_in, check_out, with_prices=False)
        assert [item.property.id for item in found] == [flat.id]


async def test_a_flat_still_occupied_at_its_check_in_hour_is_not_offered():
    from app.application.booking.check_availability import CheckAvailabilityService
    from app.domain.booking.entities import Booking
    from app.domain.booking.value_objects import BookingStatus
    from tests.test_booking_services import COMPANY_ID, _build_price_calculator

    flat, properties, _, _ = await _flat_with_hours(12, 12)
    leaving = Booking(company_id=COMPANY_ID, property_id=flat.id, check_in=datetime(2026, 10, 30, 12),
                      check_out=datetime(2026, 11, 1, 13), status=BookingStatus.CONFIRMED)
    svc = CheckAvailabilityService(properties, _CompanyRange([leaving]), _build_price_calculator())

    assert await svc.execute(COMPANY_ID, date(2026, 11, 1), date(2026, 11, 2), with_prices=False) == []


async def test_an_ota_stay_takes_the_flats_hours_and_is_not_a_false_overbooking():
    from app.domain.booking.entities import Booking
    from app.domain.booking.value_objects import BookingStatus
    from tests.test_booking_services import _make_property
    from tests.test_channex_services import (
        COMPANY_ID,
        PROPERTY_ID,
        FakeBookingRepository,
        FakeListingRepository,
        _active_listing,
        _event_service,
        _revision,
    )

    flat = _make_property(company_id=COMPANY_ID)
    flat.id, flat.check_in_hour, flat.check_out_hour = PROPERTY_ID, 16, 15
    listings = FakeListingRepository()
    await listings.create(_active_listing())
    bookings = FakeBookingRepository()
    await bookings.create(
        Booking(company_id=COMPANY_ID, property_id=PROPERTY_ID, check_in=datetime(2026, 8, 30, 16),
                check_out=datetime(2026, 9, 1, 15), status=BookingStatus.CONFIRMED)
    )
    service, _ = _event_service(listings, bookings=bookings, properties=[flat])

    await service.execute(_revision())  # 1–4 Sep
    ota = next(b for b in bookings.items.values() if b.notes)
    assert (ota.check_in, ota.check_out) == (datetime(2026, 9, 1, 16), datetime(2026, 9, 4, 15))
    assert ota.overbooking is False

    await service.execute(
        _revision(revision_id="rev-2", status="modified", arrival_date="2026-09-02", departure_date="2026-09-05")
    )
    assert (ota.check_in, ota.check_out) == (datetime(2026, 9, 2, 16), datetime(2026, 9, 5, 15))


async def test_a_stay_that_starts_on_the_last_day_still_blocks_a_late_check_out():
    from app.application.booking.check_availability import CheckAvailabilityService
    from app.domain.booking.entities import Booking
    from app.domain.booking.value_objects import BookingStatus
    from tests.test_booking_services import COMPANY_ID, _build_price_calculator

    flat, properties, _, _ = await _flat_with_hours(16, 15)
    # Taken before the flat moved to 16/15: arrives 3 Nov at 14:00.
    next_guest = Booking(company_id=COMPANY_ID, property_id=flat.id, check_in=datetime(2026, 11, 3, 14),
                         check_out=datetime(2026, 11, 5, 12), status=BookingStatus.CONFIRMED)
    svc = CheckAvailabilityService(properties, _CompanyRange([next_guest]), _build_price_calculator())

    # 1–3 Nov at this flat ends at 15:00 on the 3rd, after that guest arrives.
    assert await svc.execute(COMPANY_ID, date(2026, 11, 1), date(2026, 11, 3), with_prices=False) == []


async def test_availability_says_each_flats_own_hours():
    from app.application.booking.check_availability import CheckAvailabilityService
    from tests.test_booking_services import COMPANY_ID, _build_price_calculator

    flat, properties, _, _ = await _flat_with_hours(16, 10)
    svc = CheckAvailabilityService(properties, _CompanyRange([]), _build_price_calculator())

    (found,) = await svc.execute(COMPANY_ID, date(2026, 11, 1), date(2026, 11, 3), with_prices=False)

    # The offer text tells the guest these, not a company-wide 14:00/12:00.
    assert (found.check_in, found.check_out) == (datetime(2026, 11, 1, 16), datetime(2026, 11, 3, 10))


async def test_resending_saved_dates_with_an_edit_moves_nothing():
    from app.application.booking.update_booking import UpdateBookingInput
    from app.domain.booking.entities import Booking
    from app.domain.booking.value_objects import RentalMode
    from tests.test_booking_services import COMPANY_ID

    flat, _, bookings, svc = await _flat_with_hours(0, 0)
    stay = await bookings.create(
        Booking(company_id=COMPANY_ID, property_id=flat.id, check_in=datetime(2026, 11, 1),
                check_out=datetime(2026, 11, 3))
    )
    flat.check_in_hour, flat.check_out_hour = 14, 12

    # The web form sends the saved dates and mode back with a note.
    updated = await svc.execute(
        UpdateBookingInput(booking_id=stay.id, company_id=COMPANY_ID, check_in=datetime(2026, 11, 1),
                           check_out=datetime(2026, 11, 3), rental_mode=RentalMode.DAILY.value, notes="Поздний заезд")
    )

    assert (updated.check_in, updated.check_out) == (datetime(2026, 11, 1), datetime(2026, 11, 3))


async def test_extending_a_stay_keeps_the_saved_arrival_time():
    from app.application.booking.update_booking import UpdateBookingInput
    from app.domain.booking.entities import Booking
    from app.domain.booking.value_objects import BookingStatus
    from tests.test_booking_services import COMPANY_ID

    flat, _, bookings, svc = await _flat_with_hours(None, None)
    await bookings.create(
        Booking(company_id=COMPANY_ID, property_id=flat.id, check_in=datetime(2026, 10, 30, 14),
                check_out=datetime(2026, 11, 1, 12), status=BookingStatus.CONFIRMED)
    )
    stay = await bookings.create(
        Booking(company_id=COMPANY_ID, property_id=flat.id, check_in=datetime(2026, 11, 1, 14),
                check_out=datetime(2026, 11, 3, 12), status=BookingStatus.CONFIRMED)
    )
    flat.check_in_hour, flat.check_out_hour = 10, 10

    # The web calendar sends both days as bare dates; only the departure moved.
    extended = await svc.execute(
        UpdateBookingInput(booking_id=stay.id, company_id=COMPANY_ID, check_in=datetime(2026, 11, 1),
                           check_out=datetime(2026, 11, 4))
    )

    # Arrival stays 14:00 (10:00 would clash with the guest leaving at noon).
    assert (extended.check_in, extended.check_out) == (datetime(2026, 11, 1, 14), datetime(2026, 11, 4, 10))


async def test_an_ota_change_of_price_only_moves_no_time():
    from app.domain.booking.entities import Booking
    from app.domain.booking.value_objects import BookingStatus
    from tests.test_booking_services import _make_property
    from tests.test_channex_services import (
        COMPANY_ID,
        PROPERTY_ID,
        FakeBookingRepository,
        FakeListingRepository,
        _active_listing,
        _event_service,
        _revision,
    )

    flat = _make_property(company_id=COMPANY_ID)
    flat.id = PROPERTY_ID
    listings = FakeListingRepository()
    await listings.create(_active_listing())
    bookings = FakeBookingRepository()
    service, _ = _event_service(listings, bookings=bookings, properties=[flat])
    await service.execute(_revision())  # 1–4 Sep at 14/12
    await bookings.create(
        Booking(company_id=COMPANY_ID, property_id=PROPERTY_ID, check_in=datetime(2026, 9, 4, 14),
                check_out=datetime(2026, 9, 6, 12), status=BookingStatus.CONFIRMED)
    )
    flat.check_in_hour, flat.check_out_hour = 16, 15

    await service.execute(_revision(revision_id="rev-2", status="modified", amount="140000.00"))

    ota = next(b for b in bookings.items.values() if b.notes)
    assert (ota.check_in, ota.check_out) == (datetime(2026, 9, 1, 14), datetime(2026, 9, 4, 12))
    assert ota.overbooking is False


async def test_an_hourly_booking_takes_the_time_it_is_given():
    from app.application.booking.update_booking import UpdateBookingInput
    from app.domain.booking.entities import Booking
    from app.domain.booking.value_objects import RentalMode
    from tests.test_booking_services import COMPANY_ID

    flat, _, bookings, svc = await _flat_with_hours(None, None)
    flat.rental_mode = RentalMode.HOURLY
    stay = await bookings.create(
        Booking(company_id=COMPANY_ID, property_id=flat.id, check_in=datetime(2026, 11, 1, 2),
                check_out=datetime(2026, 11, 1, 4), rental_mode=RentalMode.HOURLY)
    )

    # Midnight is a real start for an hourly booking, not "same day as before".
    moved = await svc.execute(
        UpdateBookingInput(booking_id=stay.id, company_id=COMPANY_ID, check_in=datetime(2026, 11, 1))
    )

    assert (moved.check_in, moved.check_out) == (datetime(2026, 11, 1), datetime(2026, 11, 1, 4))


async def test_channex_availability_counts_nights_by_the_flats_hours():
    from decimal import Decimal

    from app.application.channex.push_ari import PushAriInput, PushAriService
    from app.domain.booking.entities import Booking
    from app.domain.booking.value_objects import BookingStatus
    from app.domain.property.entities import PricingConfig
    from tests.test_booking_services import _make_property
    from tests.test_channex_services import (
        COMPANY_ID,
        PROPERTY_ID,
        FakeBookingRepository,
        FakeGateway,
        FakeListingRepository,
        FakePricingRepository,
        FakePropertyRepository,
        _active_listing,
    )

    flat = _make_property(company_id=COMPANY_ID)
    flat.id, flat.check_in_hour, flat.check_out_hour = PROPERTY_ID, 10, 10
    listings = FakeListingRepository()
    await listings.create(_active_listing())
    bookings = FakeBookingRepository()
    # Taken at 14/12; the flat now turns over at 10:00.
    await bookings.create(
        Booking(company_id=COMPANY_ID, property_id=PROPERTY_ID, check_in=datetime(2026, 11, 1, 14),
                check_out=datetime(2026, 11, 3, 12), status=BookingStatus.CONFIRMED)
    )
    service = PushAriService(
        listings, bookings, FakePricingRepository(PricingConfig(base_price=Decimal("25000"))), FakeGateway(),
        FakePropertyRepository([flat]),
    )

    result = await service.execute(
        PushAriInput(company_id=COMPANY_ID, property_id=PROPERTY_ID, date_from=date(2026, 11, 1),
                     date_to=date(2026, 11, 6))
    )

    # A guest arriving 3 Nov at 10:00 would meet this one leaving at noon.
    assert result.blocked_dates == [date(2026, 11, 1), date(2026, 11, 2), date(2026, 11, 3)]
