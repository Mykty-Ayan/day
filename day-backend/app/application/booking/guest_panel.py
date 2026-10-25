"""A guest's own page for their booking (/g/<code>): the stay, the address, what is
left to pay, the house rules and, once the stay is paid in full, how to get in.

Opened by a link with no sign-in: the code names one booking of one company. The
door code and the Wi-Fi leave the server only for a confirmed or checked-in stay
paid in full, from N hours before check-in (the company's setting, by the night or
by the hour) until check-out; the page never decides that itself.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from app.application.inventory.guest_orders import minibar_open
from app.domain.booking.entities import Booking
from app.domain.booking.repositories import BookingPaymentRepository, BookingRepository, GuestRepository
from app.domain.booking.value_objects import BookingStatus, RentalMode
from app.domain.inventory.entities import Product
from app.domain.inventory.repositories import ProductRepository
from app.domain.property.entities import Property
from app.domain.property.repositories import PropertyFactRepository, PropertyRepository
from app.domain.property.value_objects import FactAudience
from app.domain.settings.entities import DEFAULT_TIME_ZONE
from app.domain.settings.repositories import CompanySettingsRepository
from app.domain.site.entities import CompanySite
from app.domain.site.repositories import CompanySiteRepository

# A stay that is over or called off: the page says so, names the stay for the
# messages to the host (documents for the books), and keeps the rest back.
_CLOSED = {BookingStatus.CANCELLED, BookingStatus.CHECKED_OUT, BookingStatus.COMPLETED}
_LIVE = {BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN}


@dataclass
class GuestAccess:
    """How to get in: only for a live stay paid in full."""

    instructions: str | None
    wifi_name: str | None
    wifi_password: str | None
    facts: list[str] = field(default_factory=list)


@dataclass
class GuestPanel:
    booking: Booking
    site: CompanySite | None
    # The company's own day: which buttons fit (arrival, the stay, departure).
    today: date
    closed: bool
    guest_name: str | None = None
    flat: Property | None = None
    paid: Decimal = Decimal("0")
    access: GuestAccess | None = None
    # How many hours before check-in the way in opens, once paid: for the page's hint.
    lead_hours: int = 24
    # The minibar's menu, during the stay only: active products with something left.
    menu: list[Product] | None = None

    @property
    def remaining(self) -> Decimal:
        return max(self.booking.total_price - self.paid, Decimal("0"))


class GuestPanelService:
    def __init__(
        self,
        bookings: BookingRepository,
        payments: BookingPaymentRepository,
        guests: GuestRepository,
        properties: PropertyRepository,
        facts: PropertyFactRepository,
        sites: CompanySiteRepository,
        company_settings: CompanySettingsRepository,
        products: ProductRepository | None = None,
    ) -> None:
        self._bookings = bookings
        self._payments = payments
        self._guests = guests
        self._properties = properties
        self._facts = facts
        self._sites = sites
        self._settings = company_settings
        self._products = products

    async def execute(self, code: str, now: datetime | None = None) -> GuestPanel:
        """The guest's page; ValueError for a code that names no booking."""
        booking = await self._bookings.get_by_guest_code(code) if len(code) == 16 else None
        if booking is None:
            raise ValueError("Not found")
        site = await self._sites.get(booking.company_id)
        company = await self._settings.get_by_company(booking.company_id)
        zone = ZoneInfo(company.time_zone if company and company.time_zone else DEFAULT_TIME_ZONE)
        # Check-in and check-out are the company's local times, as everywhere in Day.
        local_now = (now or datetime.now(tz=ZoneInfo("UTC"))).astimezone(zone).replace(tzinfo=None)
        today = local_now.date()
        hourly = booking.rental_mode == RentalMode.HOURLY
        defaults = (24, 1)
        lead_hours = (
            (company.secrets_lead_hours_hourly if hourly else company.secrets_lead_hours_daily)
            if company
            else defaults[hourly]
        )
        prop = await self._properties.get_by_id(booking.property_id)
        guest = await self._guests.get_by_id(booking.guest_id)
        paid = (await self._payments.sum_paid_by_bookings([booking.id])).get(booking.id, Decimal("0"))
        panel = GuestPanel(
            booking=booking,
            site=site,
            today=today,
            closed=booking.status in _CLOSED,
            # The name of this booking's guest only: never a phone, never anyone else.
            guest_name=guest.name if guest and guest.company_id == booking.company_id else None,
            flat=prop if prop and prop.company_id == booking.company_id else None,
            paid=paid,
            lead_hours=lead_hours,
        )
        opens = booking.check_in - timedelta(hours=lead_hours)
        if (
            panel.flat is not None
            and booking.status in _LIVE
            and paid >= booking.total_price
            and opens <= local_now < booking.check_out
        ):
            facts = await self._facts.list_by_property(panel.flat.id)
            panel.access = GuestAccess(
                instructions=panel.flat.check_in_instructions,
                wifi_name=panel.flat.wifi_name,
                wifi_password=panel.flat.wifi_password,
                facts=[f.text for f in facts if f.audience == FactAudience.GUEST],
            )
        if self._products is not None and minibar_open(booking, today):
            stock = await self._products.list(booking.company_id)
            panel.menu = [p for p in stock if p.is_active and p.stock > 0]
        return panel
