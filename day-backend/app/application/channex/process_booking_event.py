from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from app.application.booking.create_booking import apply_default_times
from app.domain.booking.entities import Booking, Guest
from app.domain.booking.repositories import BookingRepository, GuestRepository
from app.domain.booking.value_objects import BookingStatus, RentalMode
from app.domain.channex.entities import ChannexBookingEvent
from app.domain.channex.gateway import ChannexGateway, ChannexGatewayError
from app.domain.channex.repositories import (
    ChannexBookingEventRepository,
    ChannexListingRepository,
)
from app.domain.channex.value_objects import (
    ChannexBookingStatus,
    booking_source_for_ota,
)

logger = logging.getLogger(__name__)


@dataclass
class ProcessBookingEventResult:
    applied: bool
    booking_id: str | None = None
    reason: str | None = None


class ProcessBookingEventService:
    """Apply one Channex booking revision to the Booking aggregate.

    The revision is the source of truth (webhook merely triggers a read), and
    ``revision_id`` makes redelivery harmless. The OTA already charged the
    guest, so external bookings arrive CONFIRMED and their price is taken
    verbatim, never recalculated.
    """

    def __init__(
        self,
        listing_repo: ChannexListingRepository,
        event_repo: ChannexBookingEventRepository,
        booking_repo: BookingRepository,
        guest_repo: GuestRepository,
        gateway: ChannexGateway,
    ) -> None:
        self._listings = listing_repo
        self._events = event_repo
        self._bookings = booking_repo
        self._guests = guest_repo
        self._gateway = gateway

    async def execute(self, revision: dict) -> ProcessBookingEventResult:
        attrs = revision.get("attributes", revision)
        revision_id = str(attrs.get("id") or "")
        if not revision_id:
            return ProcessBookingEventResult(applied=False, reason="no revision id")

        # Tenancy is resolved first — every later query is scoped to the
        # listing's company so one tenant's revision can never touch another's
        # bookings, even on a colliding OTA reservation code.
        channex_property_id = str(attrs.get("property_id") or "")
        listing = await self._listings.get_by_channex_property(channex_property_id)
        if listing is None:
            logger.warning("Channex revision %s for unknown property %s", revision_id, channex_property_id)
            return ProcessBookingEventResult(applied=False, reason="unknown property")

        # Fast-path duplicate check; the unique constraint on revision_id is
        # the real guarantee — a concurrent double delivery fails the save and
        # the transaction rolls back at the webhook boundary.
        if await self._events.exists_revision(listing.company_id, revision_id):
            return ProcessBookingEventResult(applied=False, reason="duplicate revision")

        status = ChannexBookingStatus(str(attrs.get("status") or "new"))
        unique_id = str(attrs.get("unique_id") or "")

        event = ChannexBookingEvent(
            company_id=listing.company_id,
            property_id=listing.property_id,
            revision_id=revision_id,
            channex_booking_id=str(attrs.get("booking_id") or ""),
            unique_id=unique_id,
            ota_name=str(attrs.get("ota_name") or ""),
            status=status,
            payload=attrs,
        )

        previous = await self._events.get_latest_by_unique_id(listing.company_id, unique_id)
        booking = None
        if previous is not None and previous.booking_id is not None:
            booking = await self._bookings.get_by_id(previous.booking_id)

        if status == ChannexBookingStatus.CANCELLED:
            if booking is not None and booking.status != BookingStatus.CANCELLED:
                booking.status = BookingStatus.CANCELLED
                await self._bookings.update(booking)
            event.booking_id = booking.id if booking is not None else None
        elif booking is not None:
            self._apply_revision_fields(booking, attrs)
            await self._bookings.update(booking)
            event.booking_id = booking.id
        else:
            booking = await self._create_booking(listing.company_id, listing.property_id, attrs)
            event.booking_id = booking.id

        await self._events.save(event)

        try:
            await self._gateway.ack_booking_revision(revision_id)
        except ChannexGatewayError as exc:
            # The revision is applied; a failed ack only means Channex will
            # keep it in the feed and we will skip it as a duplicate.
            logger.warning("Channex ack failed for revision %s: %s", revision_id, exc)

        return ProcessBookingEventResult(applied=True, booking_id=str(event.booking_id))

    async def _create_booking(self, company_id, property_id, attrs: dict) -> Booking:
        customer = attrs.get("customer") or {}
        phone = str(customer.get("phone") or "") or None
        name = " ".join(
            part for part in [customer.get("name"), customer.get("surname")] if part
        ) or "OTA guest"

        guest = None
        if phone:
            guest = await self._guests.find_by_phone(company_id, phone)
        if guest is None:
            guest = await self._guests.create(
                Guest(
                    company_id=company_id,
                    name=name,
                    phone=phone,
                    email=str(customer.get("mail") or "") or None,
                )
            )

        check_in, check_out = apply_default_times(
            date.fromisoformat(attrs["arrival_date"]),
            date.fromisoformat(attrs["departure_date"]),
            RentalMode.DAILY,
        )
        occupancy = _occupancy(attrs)
        amount = Decimal(str(attrs.get("amount") or "0"))

        overlapping = await self._bookings.get_by_property_and_dates(
            property_id, check_in, check_out
        )
        notes = f"Channex: {attrs.get('ota_name', '')} {attrs.get('ota_reservation_code', '')}".strip()
        if overlapping:
            # The OTA has already confirmed the stay; losing it silently would
            # be worse than surfacing the conflict to the host.
            notes += " | OVERBOOKING: пересекается с существующей бронью"

        return await self._bookings.create(
            Booking(
                company_id=company_id,
                property_id=property_id,
                guest_id=guest.id,
                check_in=check_in,
                check_out=check_out,
                rental_mode=RentalMode.DAILY,
                source=booking_source_for_ota(str(attrs.get("ota_name") or "")),
                status=BookingStatus.CONFIRMED,
                total_price=amount,
                calculated_price=amount,
                adults_count=occupancy[0],
                children_count=occupancy[1],
                notes=notes,
            )
        )

    def _apply_revision_fields(self, booking: Booking, attrs: dict) -> None:
        check_in, check_out = apply_default_times(
            date.fromisoformat(attrs["arrival_date"]),
            date.fromisoformat(attrs["departure_date"]),
            RentalMode.DAILY,
        )
        booking.check_in = check_in
        booking.check_out = check_out
        amount = attrs.get("amount")
        if amount is not None:
            booking.total_price = Decimal(str(amount))
        adults, children = _occupancy(attrs)
        booking.adults_count = adults
        booking.children_count = children


def _occupancy(attrs: dict) -> tuple[int, int]:
    adults, children = 1, 0
    for room in attrs.get("rooms") or []:
        occ = room.get("occupancy") or {}
        adults = int(occ.get("adults") or 1)
        children = int(occ.get("children") or 0)
        break
    return adults, children
