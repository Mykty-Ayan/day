"""Unit tests for the Channex context (fakes, no DB)."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

import pytest

from app.application.channex.onboard_listing import (
    OnboardListingInput,
    OnboardListingService,
)
from app.application.channex.process_booking_event import ProcessBookingEventService
from app.application.channex.push_ari import PushAriInput, PushAriService
from app.domain.booking.entities import Booking, Guest
from app.domain.booking.repositories import BookingRepository, GuestRepository
from app.domain.booking.value_objects import BookingSource, BookingStatus
from app.domain.channex.entities import (
    ChannexBookingEvent,
    ChannexConnection,
    ChannexListing,
)
from app.domain.channex.gateway import ChannexGatewayError
from app.domain.channex.repositories import (
    ChannexBookingEventRepository,
    ChannexConnectionRepository,
    ChannexListingRepository,
)
from app.domain.channex.value_objects import ListingSyncState
from app.domain.property.entities import PricingConfig, Property
from app.domain.property.value_objects import PropertyStatus

COMPANY_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")
OTHER_COMPANY_ID = uuid.UUID("00000000-0000-0000-0000-000000000002")
PROPERTY_ID = uuid.UUID("00000000-0000-0000-0000-000000000011")


class FakeConnectionRepository(ChannexConnectionRepository):
    def __init__(self):
        self.items: dict[uuid.UUID, ChannexConnection] = {}

    async def get_by_company(self, company_id):
        return self.items.get(company_id)

    async def save(self, connection):
        self.items[connection.company_id] = connection
        return connection


class FakeListingRepository(ChannexListingRepository):
    def __init__(self):
        self.items: dict[uuid.UUID, ChannexListing] = {}

    async def create(self, listing):
        self.items[listing.id] = listing
        return listing

    async def get_by_property(self, property_id):
        return next((x for x in self.items.values() if x.property_id == property_id), None)

    async def get_by_channex_property(self, channex_property_id):
        return next(
            (x for x in self.items.values() if x.channex_property_id == channex_property_id),
            None,
        )

    async def list_by_company(self, company_id):
        return [x for x in self.items.values() if x.company_id == company_id]

    async def update(self, listing):
        self.items[listing.id] = listing
        return listing


class FakeEventRepository(ChannexBookingEventRepository):
    def __init__(self):
        self.items: list[ChannexBookingEvent] = []

    async def exists_revision(self, company_id, revision_id):
        return any(
            x.company_id == company_id and x.revision_id == revision_id for x in self.items
        )

    async def get_latest_by_unique_id(self, company_id, unique_id):
        matches = [
            x for x in self.items if x.company_id == company_id and x.unique_id == unique_id
        ]
        return matches[-1] if matches else None

    async def save(self, event):
        self.items.append(event)
        return event


class FakePropertyRepository:
    def __init__(self, properties):
        self.items = {p.id: p for p in properties}

    async def get_by_id(self, property_id):
        return self.items.get(property_id)


class FakePricingRepository:
    def __init__(self, config=None):
        self.config = config

    async def get_by_property(self, property_id):
        return self.config


class FakeBookingRepository(BookingRepository):
    def __init__(self):
        self.items: dict[uuid.UUID, Booking] = {}

    async def create(self, booking):
        self.items[booking.id] = booking
        return booking

    async def get_by_id(self, booking_id):
        return self.items.get(booking_id)

    async def get_by_property_and_dates(self, property_id, check_in, check_out, *, exclude_id=None):
        result = []
        for b in self.items.values():
            if b.property_id != property_id or b.status == BookingStatus.CANCELLED:
                continue
            if b.check_in < check_out and check_in < b.check_out:
                result.append(b)
        return result

    async def list_by_company(self, company_id, **kwargs):
        return [b for b in self.items.values() if b.company_id == company_id]

    async def count_by_company(self, company_id, **kwargs):
        return len(await self.list_by_company(company_id))

    async def list_by_property_date_range(self, property_id, start_date, end_date, *, company_id=None):
        return [
            b
            for b in self.items.values()
            if b.property_id == property_id
            and (company_id is None or b.company_id == company_id)
        ]

    async def list_by_company_date_range(self, company_id, start_date, end_date):
        return [b for b in self.items.values() if b.company_id == company_id]

    async def update(self, booking):
        self.items[booking.id] = booking
        return booking


class FakeGuestRepository(GuestRepository):
    def __init__(self):
        self.items: dict[uuid.UUID, Guest] = {}

    async def create(self, guest):
        self.items[guest.id] = guest
        return guest

    async def get_by_id(self, guest_id):
        return self.items.get(guest_id)

    async def get_by_company(self, company_id, **kwargs):
        return [g for g in self.items.values() if g.company_id == company_id]

    async def count_by_company(self, company_id, **kwargs):
        return len(await self.get_by_company(company_id))

    async def search_by_name_or_phone(self, company_id, query):
        return []

    async def find_by_phone(self, company_id, phone):
        return next(
            (g for g in self.items.values() if g.company_id == company_id and g.phone == phone),
            None,
        )


class FakeGateway:
    def __init__(self, fail_on=None):
        self.fail_on = fail_on
        self.calls: list[tuple] = []
        self.acked: list[str] = []

    async def _maybe_fail(self, name):
        if self.fail_on == name:
            raise ChannexGatewayError(f"forced failure in {name}")

    async def create_group(self, title):
        await self._maybe_fail("create_group")
        self.calls.append(("create_group", title))
        return "group-1"

    async def create_property(self, **kwargs):
        await self._maybe_fail("create_property")
        self.calls.append(("create_property", kwargs))
        return "prop-1"

    async def create_room_type(self, **kwargs):
        await self._maybe_fail("create_room_type")
        self.calls.append(("create_room_type", kwargs))
        return "room-1"

    async def create_rate_plan(self, **kwargs):
        await self._maybe_fail("create_rate_plan")
        self.calls.append(("create_rate_plan", kwargs))
        return "rate-1"

    async def update_availability(self, **kwargs):
        self.calls.append(("update_availability", kwargs))

    async def update_restrictions(self, **kwargs):
        self.calls.append(("update_restrictions", kwargs))

    async def get_booking_revisions_feed(self, *, property_id):
        return []

    async def ack_booking_revision(self, revision_id):
        self.acked.append(revision_id)


def _property(**overrides):
    defaults = dict(
        id=PROPERTY_ID,
        company_id=COMPANY_ID,
        name="Абая 15",
        status=PropertyStatus.ACTIVE,
        beds=4,
        address_full="Abay ave 15",
    )
    defaults.update(overrides)
    return Property(**defaults)


def _revision(revision_id="rev-1", status="new", unique_id="BDC-1", **overrides):
    payload = {
        "id": revision_id,
        "status": status,
        "unique_id": unique_id,
        "booking_id": "cb-1",
        "property_id": "prop-1",
        "ota_name": "Booking.com",
        "ota_reservation_code": "OTA-1",
        "arrival_date": "2026-09-01",
        "departure_date": "2026-09-04",
        "amount": "135000.00",
        "customer": {"name": "Aigerim", "surname": "Testova", "phone": "77010000000"},
        "rooms": [{"occupancy": {"adults": 2, "children": 1}}],
    }
    payload.update(overrides)
    return payload


def _active_listing():
    return ChannexListing(
        company_id=COMPANY_ID,
        property_id=PROPERTY_ID,
        channex_property_id="prop-1",
        channex_room_type_id="room-1",
        channex_rate_plan_id="rate-1",
        sync_state=ListingSyncState.ACTIVE,
    )


class TestOnboardListing:
    async def test_creates_group_property_room_rate(self):
        connections = FakeConnectionRepository()
        listings = FakeListingRepository()
        gateway = FakeGateway()
        service = OnboardListingService(
            connections, listings, FakePropertyRepository([_property()]), gateway
        )

        listing = await service.execute(
            OnboardListingInput(company_id=COMPANY_ID, property_id=PROPERTY_ID, city="Almaty")
        )

        assert listing.sync_state == ListingSyncState.ACTIVE
        assert listing.channex_property_id == "prop-1"
        assert listing.channex_room_type_id == "room-1"
        assert listing.channex_rate_plan_id == "rate-1"
        assert connections.items[COMPANY_ID].channex_group_id == "group-1"
        room_call = next(c for c in gateway.calls if c[0] == "create_room_type")
        assert room_call[1]["occ_adults"] == 4

    async def test_is_idempotent_per_property(self):
        connections = FakeConnectionRepository()
        listings = FakeListingRepository()
        service = OnboardListingService(
            connections, listings, FakePropertyRepository([_property()]), FakeGateway()
        )
        inp = OnboardListingInput(company_id=COMPANY_ID, property_id=PROPERTY_ID)

        first = await service.execute(inp)
        second = await service.execute(inp)

        assert first.id == second.id
        assert len(listings.items) == 1

    async def test_rejects_foreign_property(self):
        service = OnboardListingService(
            FakeConnectionRepository(),
            FakeListingRepository(),
            FakePropertyRepository([_property(company_id=OTHER_COMPANY_ID)]),
            FakeGateway(),
        )
        with pytest.raises(ValueError):
            await service.execute(
                OnboardListingInput(company_id=COMPANY_ID, property_id=PROPERTY_ID)
            )

    async def test_gateway_failure_is_recorded_not_raised(self):
        listings = FakeListingRepository()
        service = OnboardListingService(
            FakeConnectionRepository(),
            listings,
            FakePropertyRepository([_property()]),
            FakeGateway(fail_on="create_rate_plan"),
        )

        listing = await service.execute(
            OnboardListingInput(company_id=COMPANY_ID, property_id=PROPERTY_ID)
        )

        assert listing.sync_state == ListingSyncState.ERROR
        assert "create_rate_plan" in (listing.last_error or "")
        # ids created before the failure are preserved for retry/cleanup
        assert listing.channex_property_id == "prop-1"


class TestPushAri:
    async def test_pushes_rate_and_blocks_booked_nights(self):
        listings = FakeListingRepository()
        await listings.create(_active_listing())
        bookings = FakeBookingRepository()
        await bookings.create(
            Booking(
                company_id=COMPANY_ID,
                property_id=PROPERTY_ID,
                check_in=datetime(2026, 9, 2, 14),
                check_out=datetime(2026, 9, 4, 12),
                status=BookingStatus.CONFIRMED,
            )
        )
        gateway = FakeGateway()
        service = PushAriService(
            listings,
            bookings,
            FakePricingRepository(PricingConfig(base_price=Decimal("45000"))),
            gateway,
        )

        result = await service.execute(
            PushAriInput(
                company_id=COMPANY_ID,
                property_id=PROPERTY_ID,
                date_from=date(2026, 9, 1),
                date_to=date(2026, 9, 6),
            )
        )

        assert result.blocked_dates == [date(2026, 9, 2), date(2026, 9, 3)]
        restrictions = next(c for c in gateway.calls if c[0] == "update_restrictions")
        assert restrictions[1]["rate"] == "45000.00"
        assert restrictions[1]["date_to"] == date(2026, 9, 5)  # inclusive trim
        availability = [c[1] for c in gateway.calls if c[0] == "update_availability"]
        # runs: 1 free, 2-3 blocked, 4-5 free
        assert [(a["date_from"], a["date_to"], a["availability"]) for a in availability] == [
            (date(2026, 9, 1), date(2026, 9, 1), 1),
            (date(2026, 9, 2), date(2026, 9, 3), 0),
            (date(2026, 9, 4), date(2026, 9, 5), 1),
        ]

    async def test_requires_onboarded_listing(self):
        service = PushAriService(
            FakeListingRepository(), FakeBookingRepository(), FakePricingRepository(), FakeGateway()
        )
        with pytest.raises(ValueError):
            await service.execute(
                PushAriInput(
                    company_id=COMPANY_ID,
                    property_id=PROPERTY_ID,
                    date_from=date(2026, 9, 1),
                    date_to=date(2026, 9, 6),
                )
            )

    async def test_requires_rate_or_base_price(self):
        listings = FakeListingRepository()
        await listings.create(_active_listing())
        service = PushAriService(
            listings, FakeBookingRepository(), FakePricingRepository(None), FakeGateway()
        )
        with pytest.raises(ValueError):
            await service.execute(
                PushAriInput(
                    company_id=COMPANY_ID,
                    property_id=PROPERTY_ID,
                    date_from=date(2026, 9, 1),
                    date_to=date(2026, 9, 6),
                )
            )


def _event_service(listings=None, events=None, bookings=None, guests=None, gateway=None):
    listings = listings or FakeListingRepository()
    return (
        ProcessBookingEventService(
            listings,
            events or FakeEventRepository(),
            bookings or FakeBookingRepository(),
            guests or FakeGuestRepository(),
            gateway or FakeGateway(),
        ),
        listings,
    )


class TestProcessBookingEvent:
    async def test_new_revision_creates_confirmed_booking_and_guest(self):
        listings = FakeListingRepository()
        await listings.create(_active_listing())
        bookings = FakeBookingRepository()
        guests = FakeGuestRepository()
        events = FakeEventRepository()
        gateway = FakeGateway()
        service, _ = _event_service(listings, events, bookings, guests, gateway)

        result = await service.execute(_revision())

        assert result.applied
        booking = next(iter(bookings.items.values()))
        assert booking.status == BookingStatus.CONFIRMED
        assert booking.source == BookingSource.BOOKING
        assert booking.total_price == Decimal("135000.00")
        assert booking.adults_count == 2 and booking.children_count == 1
        guest = next(iter(guests.items.values()))
        assert guest.name == "Aigerim Testova"
        assert gateway.acked == ["rev-1"]

    async def test_duplicate_revision_is_ignored(self):
        listings = FakeListingRepository()
        await listings.create(_active_listing())
        bookings = FakeBookingRepository()
        service, _ = _event_service(listings, bookings=bookings)

        await service.execute(_revision())
        result = await service.execute(_revision())

        assert not result.applied
        assert result.reason == "duplicate revision"
        assert len(bookings.items) == 1

    async def test_modification_updates_dates_and_amount(self):
        listings = FakeListingRepository()
        await listings.create(_active_listing())
        bookings = FakeBookingRepository()
        service, _ = _event_service(listings, bookings=bookings)

        await service.execute(_revision())
        await service.execute(
            _revision(
                revision_id="rev-2",
                status="modified",
                departure_date="2026-09-03",
                amount="90000.00",
            )
        )

        booking = next(iter(bookings.items.values()))
        assert booking.check_out.date() == date(2026, 9, 3)
        assert booking.total_price == Decimal("90000.00")
        assert len(bookings.items) == 1

    async def test_cancellation_cancels_booking(self):
        listings = FakeListingRepository()
        await listings.create(_active_listing())
        bookings = FakeBookingRepository()
        service, _ = _event_service(listings, bookings=bookings)

        await service.execute(_revision())
        await service.execute(_revision(revision_id="rev-2", status="cancelled"))

        booking = next(iter(bookings.items.values()))
        assert booking.status == BookingStatus.CANCELLED

    async def test_unknown_property_is_skipped(self):
        service, _ = _event_service()
        result = await service.execute(_revision())
        assert not result.applied
        assert result.reason == "unknown property"

    async def test_same_unique_id_in_other_company_is_isolated(self):
        # Two tenants, both with OTA code BDC-1: a cancellation for company B
        # must not touch company A's booking.
        listings = FakeListingRepository()
        await listings.create(_active_listing())
        other_property = uuid.uuid4()
        await listings.create(
            ChannexListing(
                company_id=OTHER_COMPANY_ID,
                property_id=other_property,
                channex_property_id="prop-2",
                channex_room_type_id="room-2",
                channex_rate_plan_id="rate-2",
                sync_state=ListingSyncState.ACTIVE,
            )
        )
        bookings = FakeBookingRepository()
        service, _ = _event_service(listings, bookings=bookings)

        await service.execute(_revision())  # company A, unique_id BDC-1
        await service.execute(
            _revision(revision_id="rev-b1", property_id="prop-2")
        )  # company B, same unique_id
        await service.execute(
            _revision(revision_id="rev-b2", status="cancelled", property_id="prop-2")
        )  # cancel company B's booking

        by_company = {b.company_id: b for b in bookings.items.values()}
        assert by_company[COMPANY_ID].status == BookingStatus.CONFIRMED
        assert by_company[OTHER_COMPANY_ID].status == BookingStatus.CANCELLED

    async def test_overlap_is_flagged_not_dropped(self):
        listings = FakeListingRepository()
        await listings.create(_active_listing())
        bookings = FakeBookingRepository()
        await bookings.create(
            Booking(
                company_id=COMPANY_ID,
                property_id=PROPERTY_ID,
                check_in=datetime(2026, 9, 1, 14),
                check_out=datetime(2026, 9, 5, 12),
                status=BookingStatus.CONFIRMED,
            )
        )
        service, _ = _event_service(listings, bookings=bookings)

        result = await service.execute(_revision())

        assert result.applied
        created = [b for b in bookings.items.values() if b.notes]
        assert any("OVERBOOKING" in (b.notes or "") for b in created)
