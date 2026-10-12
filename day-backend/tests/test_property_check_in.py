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

