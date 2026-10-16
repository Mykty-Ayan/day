"""Bookings made in Day keep to their apartment's stay rules, unless the operator
confirms the breach (override_rules); the breach is then kept in the audit log."""

import uuid
from datetime import datetime, timedelta
from decimal import Decimal

import pytest

from app.application.booking.create_booking import CreateBookingInput, CreateBookingService
from app.application.booking.move_booking import MoveBookingService
from app.application.booking.stay_rules import company_now
from app.application.booking.update_booking import UpdateBookingInput, UpdateBookingService
from app.domain.auth.permissions import Permission
from app.domain.booking.exceptions import StayRulesError
from app.domain.booking.stay_rules import RuleBreach
from app.domain.booking.value_objects import RentalMode
from app.domain.property.entities import PricingConfig, Property
from app.domain.property.value_objects import PropertyStatus, PropertyType
from app.presentation.api.v1.bookings import _request_hash
from app.presentation.schemas.booking import BookingCreate
from tests.test_booking_services import (
    COMPANY_ID,
    FakeBookingAuditLogRepository,
    FakeBookingRepository,
    FakeGuestRepository,
    FakePricingConfigRepository,
    FakePropertyRepository,
    _build_price_calculator,
)
from tests.test_property_facts import flat  # noqa: F401  (a fixture)


class Flats:
    def __init__(self):
        self.props = FakePropertyRepository()
        self.bookings = FakeBookingRepository()
        self.audit = FakeBookingAuditLogRepository()
        self.pricing = FakePricingConfigRepository()
        prices = _build_price_calculator(pricing_repo=self.pricing)
        self.create = CreateBookingService(self.bookings, FakeGuestRepository(), self.props, self.audit, prices)
        self.update = UpdateBookingService(self.bookings, self.props, self.audit, prices)
        self.move = MoveBookingService(self.bookings, self.props, self.audit)

    async def flat(self, mode=RentalMode.BOTH, **rules) -> Property:
        prop = Property(
            id=uuid.uuid4(),
            company_id=COMPANY_ID,
            name="Студия",
            internal_name=uuid.uuid4().hex[:6],
            status=PropertyStatus.ACTIVE,
            type=PropertyType.APARTMENT,
            rental_mode=mode,
            **rules,
        )
        await self.props.save(prop)
        await self.pricing.save(
            PricingConfig(property_id=prop.id, base_price=Decimal("10000"), hourly_price=Decimal("3000"))
        )
        return prop

    async def book(self, prop, check_in, check_out, mode=RentalMode.DAILY, **extra):
        return await self.create.execute(
            CreateBookingInput(
                company_id=COMPANY_ID,
                property_id=prop.id,
                guest_name="Ерлан",
                check_in=check_in,
                check_out=check_out,
                rental_mode=mode,
                **extra,
            )
        )


FAR = datetime(2030, 3, 10, 14, 0)


async def test_a_stay_shorter_than_the_flat_takes_is_refused_until_confirmed():
    f = Flats()
    prop = await f.flat(min_nights=2)
    with pytest.raises(StayRulesError) as refused:
        await f.book(prop, FAR, FAR + timedelta(days=1) - timedelta(hours=2))
    assert refused.value.breaches == [RuleBreach("min_nights", 2, 1)]
    assert await f.bookings.get_by_property_and_dates(prop.id, FAR, FAR + timedelta(days=1)) == []

    booking = await f.book(prop, FAR, FAR + timedelta(days=1) - timedelta(hours=2), override_rules=True)
    kept = [log for log in f.audit._logs if log.booking_id == booking.id and log.field_name == "stay_rules_overridden"]
    assert [log.new_value for log in kept] == ["min_nights 2 (booking: 1)"]


async def test_a_stay_booked_too_close_to_its_check_in_is_refused():
    f = Flats()
    prop = await f.flat(min_lead_hours=3)
    soon = (await company_now(None, COMPANY_ID)).replace(second=0, microsecond=0) + timedelta(hours=1)
    with pytest.raises(StayRulesError) as refused:
        await f.book(prop, soon, soon + timedelta(hours=2), RentalMode.HOURLY)
    assert [b.rule for b in refused.value.breaches] == ["min_lead_hours"]


async def test_an_hourly_booking_keeps_the_cleaning_buffer():
    f = Flats()
    prop = await f.flat(buffer_hours=2)
    morning = FAR.replace(hour=10)
    await f.book(prop, morning, morning + timedelta(hours=2), RentalMode.HOURLY)
    with pytest.raises(StayRulesError) as refused:
        await f.book(prop, morning + timedelta(hours=3), morning + timedelta(hours=5), RentalMode.HOURLY)
    assert refused.value.breaches == [RuleBreach("buffer_hours", 2, 1)]
    await f.book(prop, morning + timedelta(hours=4), morning + timedelta(hours=6), RentalMode.HOURLY)


async def test_an_edit_that_keeps_the_dates_is_not_checked():
    # A stay confirmed against the rules stays editable: the form sends the saved
    # dates back with a new guest count.
    f = Flats()
    prop = await f.flat(min_nights=2)
    booking = await f.book(prop, FAR, FAR + timedelta(days=1), override_rules=True)
    edited = await f.update.execute(
        UpdateBookingInput(
            booking_id=booking.id,
            company_id=COMPANY_ID,
            check_in=booking.check_in,
            check_out=booking.check_out,
            adults_count=3,
        )
    )
    assert edited.adults_count == 3


async def test_new_dates_that_break_the_rules_are_refused_until_confirmed():
    f = Flats()
    prop = await f.flat(min_nights=2)
    booking = await f.book(prop, FAR, FAR + timedelta(days=3))
    shorter = UpdateBookingInput(booking_id=booking.id, company_id=COMPANY_ID, check_out=FAR + timedelta(days=1))
    with pytest.raises(StayRulesError):
        await f.update.execute(shorter)
    shorter.override_rules = True
    assert (await f.update.execute(shorter)).check_out.date() == (FAR + timedelta(days=1)).date()


async def test_a_later_check_out_is_not_held_to_the_lead_time():
    # The guest is in and stays a night longer: the check-in has not moved.
    f = Flats()
    prop = await f.flat(min_lead_hours=24)
    now = (await company_now(None, COMPANY_ID)).replace(minute=0, second=0, microsecond=0)
    booking = await f.book(prop, now - timedelta(hours=20), now + timedelta(hours=4), override_rules=True)
    later = booking.check_out + timedelta(days=1)
    longer = await f.update.execute(UpdateBookingInput(booking_id=booking.id, company_id=COMPANY_ID, check_out=later))
    assert longer.check_out == later


async def test_a_move_keeps_to_the_target_flat_rules():
    f = Flats()
    here = await f.flat()
    there = await f.flat(min_nights=3)
    booking = await f.book(here, FAR, FAR + timedelta(days=2))
    with pytest.raises(StayRulesError) as refused:
        await f.move.execute(booking.id, COMPANY_ID, there.id)
    assert refused.value.breaches == [RuleBreach("min_nights", 3, 2)]
    moved = await f.move.execute(booking.id, COMPANY_ID, there.id, override_rules=True)
    assert moved.property_id == there.id


def test_the_override_flag_does_not_change_an_idempotency_key_body():
    # A request refused for the rules made nothing; a key saved before the flag
    # existed must still match its retry.
    body = {
        "property_id": str(uuid.uuid4()),
        "guest_name": "Ерлан",
        "check_in": "2030-03-10T14:00:00",
        "check_out": "2030-03-12T12:00:00",
    }
    assert _request_hash(BookingCreate(**body)) == _request_hash(BookingCreate(**body, override_rules=True))


@pytest.mark.integration
async def test_the_api_names_the_broken_rules_and_takes_a_confirmed_stay(flat):  # noqa: F811  (the imported fixture)
    client, prop, use = flat
    use(Permission.PROPERTIES_READ, Permission.PROPERTIES_WRITE, Permission.BOOKINGS_READ, Permission.BOOKINGS_WRITE)
    assert (await client.patch(f"/api/v1/properties/{prop}", json={"min_nights": 2})).status_code == 200
    stay = {
        "property_id": str(prop),
        "guest_name": "Ерлан",
        "guest_phone": "+77010000016",
        "check_in": "2030-03-10T14:00:00",
        "check_out": "2030-03-11T12:00:00",
    }
    refused = await client.post("/api/v1/bookings", json=stay)
    assert refused.status_code == 422, refused.text
    detail = refused.json()["detail"]
    assert detail["code"] == "stay_rules"
    assert detail["breaches"] == [{"rule": "min_nights", "limit": 2, "actual": 1}]

    confirmed = await client.post("/api/v1/bookings", json={**stay, "override_rules": True})
    assert confirmed.status_code == 201, confirmed.text
