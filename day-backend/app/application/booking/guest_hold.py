"""A guest books from a personal link (/o/<code>): Day holds the dates for 30
minutes and asks the host to send a Kaspi invoice for the deposit, by hand. Paid,
the operator marks the deposit and confirms the booking; unpaid, the hold sweep
lets the nights go and the link books again. One link, one booking at a time.

Nights are paid at check-in: the booking carries their price, the deposit is all
the guest pays now.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from zoneinfo import ZoneInfo

from app.application.booking.create_booking import CreateBookingInput, CreateBookingService
from app.application.booking.guest_offers import OfferExpiredError
from app.domain.booking.entities import Booking, BookingDeposit, GuestOffer
from app.domain.booking.repositories import (
    BookingDepositRepository,
    BookingRepository,
    GuestOfferRepository,
    GuestRepository,
)
from app.domain.booking.value_objects import BookingSource, BookingStatus, DepositStatus, RentalMode
from app.domain.property.repositories import PricingConfigRepository, PropertyRepository
from app.domain.property.value_objects import PropertyStatus
from app.domain.settings.entities import DEFAULT_TIME_ZONE
from app.domain.settings.repositories import CompanySettingsRepository

HOLD_MINUTES = 30


class OfferTakenError(Exception):
    """The link has a booking that still holds its dates. The HTTP layer answers 409."""


@dataclass
class OfferBooking:
    booking: Booking
    # The flat's public code: the page shows which flat of the link it is.
    flat: str
    deposit: Decimal | None
    # The number the invoice goes to.
    phone: str
    # Who booked: the name on the form, or the one aidyn took from the chat. The
    # booking's guest is found by phone and may carry an older name.
    name: str = ""


class GuestHoldService:
    def __init__(
        self,
        offer_repo: GuestOfferRepository,
        property_repo: PropertyRepository,
        booking_repo: BookingRepository,
        guest_repo: GuestRepository,
        pricing_repo: PricingConfigRepository,
        deposit_repo: BookingDepositRepository,
        create_booking: CreateBookingService,
        settings_repo: CompanySettingsRepository | None = None,
        *,
        now: Callable[[], datetime] = datetime.utcnow,
    ) -> None:
        self._offers = offer_repo
        self._properties = property_repo
        self._bookings = booking_repo
        self._guests = guest_repo
        self._pricing = pricing_repo
        self._deposits = deposit_repo
        self._create = create_booking
        self._settings = settings_repo
        self._now = now

    async def book(
        self, code: str, *, flat: str, guests: int, name: str | None = None, phone: str | None = None
    ) -> OfferBooking:
        """Hold one flat of the link for the link's dates. `name` and `phone` are the
        guest's own when the link's are not theirs (it was forwarded, or someone
        else pays); otherwise the ones aidyn took from the chat."""
        offer = await self._offers.get_by_code(code, lock=True)
        if offer is None:
            raise ValueError("Not found")
        if await self._company_today(offer.company_id) > offer.check_in:
            raise OfferExpiredError("Expired")
        if await self._live_booking(offer) is not None:
            raise OfferTakenError("This link has a booking already")
        prop = await self._properties.get_by_public_code(flat)
        if (
            prop is None
            or prop.id not in offer.property_ids
            or prop.company_id != offer.company_id
            or prop.status != PropertyStatus.ACTIVE
        ):
            raise ValueError("Not found")
        if prop.max_guests is not None and guests > prop.max_guests:
            raise ValueError(f"The flat takes up to {prop.max_guests} guests")
        # Let by the hour since the link was made: a link books nights, with their deposit.
        if prop.rental_mode == RentalMode.HOURLY:
            raise ValueError(f"{prop.name} lets by the hour only")

        pricing = await self._pricing.get_by_property(prop.id)
        deposit = pricing.default_deposit if pricing and pricing.default_deposit > 0 else None
        name, phone = (name or "").strip(), (phone or "").strip()
        notes = f"Гость забронировал по личной ссылке /o/{offer.code}"
        if name or phone:
            # The guest found by phone keeps its own name: who booked is told here.
            notes += f". С формы: {name or offer.guest_name}, {phone or offer.guest_phone}"
        name, phone = name or offer.guest_name, phone or offer.guest_phone
        booking = await self._create.execute(
            CreateBookingInput(
                company_id=offer.company_id,
                property_id=prop.id,
                guest_name=name,
                guest_phone=phone,
                check_in=offer.check_in,
                check_out=offer.check_out,
                adults_count=guests,
                source=BookingSource.OFFER,
                notes=notes,
                # The CRM finds its conversation by it in the feed.
                external_id=offer.external_id,
                expires_at=self._now() + timedelta(minutes=HOLD_MINUTES),
            )
        )
        if deposit is not None:
            # Expected, not received: the operator marks it once the Kaspi invoice is paid.
            await self._deposits.create(BookingDeposit(booking_id=booking.id, amount=deposit))
        await self._offers.set_booking(offer.id, booking.id)
        offer.booking_id = booking.id
        return OfferBooking(booking=booking, flat=prop.public_code, deposit=deposit, phone=phone, name=name)

    async def current(self, offer: GuestOffer) -> OfferBooking | None:
        """The link's booking while it holds its dates: waiting for payment or confirmed."""
        booking = await self._live_booking(offer)
        if booking is None:
            return None
        prop = await self._properties.get_by_id(booking.property_id)
        guest = await self._guests.get_by_id(booking.guest_id) if booking.guest_id else None
        deposits = [d for d in await self._deposits.get_by_booking(booking.id) if d.status != DepositStatus.RETURNED]
        return OfferBooking(
            booking=booking,
            flat=prop.public_code if prop else "",
            deposit=deposits[0].amount if deposits else None,
            phone=(guest.phone if guest and guest.phone else offer.guest_phone),
        )

    async def _company_today(self, company_id) -> date:
        """The company's date: from midnight to 05:00 in Almaty the server's UTC
        date is still yesterday, and a link would book a stay already begun."""
        company = await self._settings.get_by_company(company_id) if self._settings else None
        zone = ZoneInfo(company.time_zone if company and company.time_zone else DEFAULT_TIME_ZONE)
        return self._now().replace(tzinfo=timezone.utc).astimezone(zone).date()

    async def _live_booking(self, offer: GuestOffer) -> Booking | None:
        if offer.booking_id is None:
            return None
        booking = await self._bookings.get_by_id(offer.booking_id)
        if booking is None or booking.status == BookingStatus.CANCELLED or booking.company_id != offer.company_id:
            return None
        return booking
