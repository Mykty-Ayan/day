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
from app.application.leads.check_guest import normalise_phone
from app.domain.booking.entities import Booking, BookingDeposit, GuestOffer
from app.domain.booking.repositories import (
    BookingDepositRepository,
    BookingRepository,
    GuestOfferRepository,
    GuestRepository,
)
from app.domain.booking.value_objects import BookingSource, BookingStatus, DepositStatus, RentalMode
from app.domain.leads.repositories import BlacklistRepository
from app.domain.property.repositories import PricingConfigRepository, PropertyRepository
from app.domain.property.value_objects import PropertyStatus
from app.domain.settings.entities import DEFAULT_TIME_ZONE
from app.domain.settings.repositories import CompanySettingsRepository
from app.domain.site.repositories import CompanySiteRepository

HOLD_MINUTES = 30
# A stay booked from a flat's page: as long and as far ahead as a personal link takes.
SITE_MAX_NIGHTS = 120
SITE_MAX_HOURS = 24
SITE_HORIZON_DAYS = 730
# Unpaid holds from a flat's page at once: real guests rarely wait on more, and
# made-up numbers cannot close a whole calendar.
SITE_LIVE_HOLDS_PER_FLAT = 3
# One answer for every refusal: it must not tell a stranger whether a number holds a booking.
SITE_REFUSED = "These dates cannot be held now"


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
        sites: CompanySiteRepository | None = None,
        blacklist: BlacklistRepository | None = None,
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
        self._sites = sites
        self._blacklist = blacklist

    async def book(
        self, code: str, *, flat: str, guests: int, name: str | None = None, phone: str | None = None
    ) -> OfferBooking:
        """Hold one flat of the link for the link's dates. `name` and `phone` are the
        guest's own when the link's are not theirs (it was forwarded, or someone
        else pays); otherwise the ones aidyn took from the chat."""
        offer = await self._offers.get_by_code(code, lock=True)
        if offer is None:
            raise ValueError("Not found")
        now = await self._company_now(offer.company_id)
        if now.date() > offer.check_in:
            raise OfferExpiredError("Expired")
        # By the hour the link ends when its hours begin, not with the day.
        if offer.rental_mode == RentalMode.HOURLY and offer.starts_at is not None and now >= offer.starts_at:
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
        hourly = offer.rental_mode == RentalMode.HOURLY
        # Let otherwise since the link was made: a link books its own kind of stay, with its deposit.
        if not hourly and prop.rental_mode == RentalMode.HOURLY:
            raise ValueError(f"{prop.name} lets by the hour only")
        if hourly and prop.rental_mode == RentalMode.DAILY:
            raise ValueError(f"{prop.name} lets by the night only")

        pricing = await self._pricing.get_by_property(prop.id)
        amount = (pricing.hourly_deposit if hourly else pricing.default_deposit) if pricing else None
        # 0 is not set, never the other kind's deposit.
        deposit = amount if amount and amount > 0 else None
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
                check_in=offer.starts_at if hourly else offer.check_in,
                check_out=offer.ends_at if hourly else offer.check_out,
                rental_mode=RentalMode.HOURLY if hourly else RentalMode.DAILY,
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

    async def book_stay(
        self,
        flat_code: str,
        *,
        rental_mode: RentalMode,
        guests: int,
        name: str,
        phone: str,
        check_in: date | None = None,
        check_out: date | None = None,
        starts_at: datetime | None = None,
        ends_at: datetime | None = None,
    ) -> OfferBooking:
        """A guest books from the flat's own page (/s/<code>), with no chat before: the
        nights or hours are held for 30 minutes and the host is asked for the Kaspi
        invoice, as from a personal link. One phone holds one such booking at a time,
        so a stranger cannot close a flat's calendar with made-up holds."""
        prop = await self._properties.get_by_public_code(flat_code)
        if prop is None or prop.status != PropertyStatus.ACTIVE:
            raise ValueError("Not found")
        # The company opts in by setting up its site: a flat's page books only then.
        if self._sites is None or await self._sites.get(prop.company_id) is None:
            raise ValueError("Not found")
        name, phone = name.strip(), phone.strip()
        if not name:
            raise ValueError("A name is needed")
        if prop.max_guests is not None and guests > prop.max_guests:
            raise ValueError(f"The flat takes up to {prop.max_guests} guests")
        hourly = rental_mode == RentalMode.HOURLY
        if hourly and prop.rental_mode == RentalMode.DAILY:
            raise ValueError(f"{prop.name} lets by the night only")
        if not hourly and prop.rental_mode == RentalMode.HOURLY:
            raise ValueError(f"{prop.name} lets by the hour only")

        now = await self._company_now(prop.company_id)
        horizon = now.date() + timedelta(days=SITE_HORIZON_DAYS)
        if hourly:
            if starts_at is None or ends_at is None or ends_at <= starts_at:
                raise ValueError("ends_at must be after starts_at")
            if starts_at <= now:
                raise ValueError("starts_at is in the past")
            if ends_at - starts_at > timedelta(hours=SITE_MAX_HOURS) or starts_at.date() > horizon:
                raise ValueError(f"An hourly stay is up to {SITE_MAX_HOURS} hours, within two years")
            start, end = starts_at, ends_at
        else:
            if check_in is None or check_out is None or check_out <= check_in:
                raise ValueError("check_out must be after check_in")
            if check_in < now.date():
                raise ValueError("check_in is in the past")
            if (check_out - check_in).days > SITE_MAX_NIGHTS or check_in > horizon:
                raise ValueError(f"A stay is up to {SITE_MAX_NIGHTS} nights, within two years")
            start, end = check_in, check_out

        same_phone = [g.id for g in await self._guests.list_by_phone(prop.company_id, phone)]
        if (
            await self._bookings.has_live_hold(prop.company_id, same_phone, BookingSource.SITE.value, self._now())
            or await self._bookings.count_live_holds(prop.id, BookingSource.SITE.value, self._now())
            >= SITE_LIVE_HOLDS_PER_FLAT
            or (self._blacklist is not None
                and await self._blacklist.find(prop.company_id, normalise_phone(phone)) is not None)
        ):
            raise OfferTakenError(SITE_REFUSED)

        pricing = await self._pricing.get_by_property(prop.id)
        amount = (pricing.hourly_deposit if hourly else pricing.default_deposit) if pricing else None
        deposit = amount if amount and amount > 0 else None
        booking = await self._create.execute(
            CreateBookingInput(
                company_id=prop.company_id,
                property_id=prop.id,
                guest_name=name,
                guest_phone=phone,
                check_in=start,
                check_out=end,
                rental_mode=RentalMode.HOURLY if hourly else RentalMode.DAILY,
                adults_count=guests,
                source=BookingSource.SITE,
                # The guest found by phone keeps its own name: who booked is told here.
                notes=f"Гость забронировал на странице квартиры /s/{prop.public_code}. С формы: {name}, {phone}",
                expires_at=self._now() + timedelta(minutes=HOLD_MINUTES),
            )
        )
        if deposit is not None:
            await self._deposits.create(BookingDeposit(booking_id=booking.id, amount=deposit))
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

    async def _company_now(self, company_id) -> datetime:
        """The company's local time, without a zone as a stay's times: from midnight to
        05:00 in Almaty the server's UTC date is still yesterday, and a link would book a
        stay already begun."""
        company = await self._settings.get_by_company(company_id) if self._settings else None
        zone = ZoneInfo(company.time_zone if company and company.time_zone else DEFAULT_TIME_ZONE)
        return self._now().replace(tzinfo=timezone.utc).astimezone(zone).replace(tzinfo=None)

    async def _live_booking(self, offer: GuestOffer) -> Booking | None:
        if offer.booking_id is None:
            return None
        booking = await self._bookings.get_by_id(offer.booking_id)
        if booking is None or booking.status == BookingStatus.CANCELLED or booking.company_id != offer.company_id:
            return None
        return booking
