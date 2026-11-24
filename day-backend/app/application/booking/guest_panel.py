"""A guest's own page for their booking (/g/<code>): the stay, the address, what is
left to pay, the house rules and, once the stay is paid in full, how to get in.

Opened by a link with no sign-in: the code names one booking of one company. The
door code and the Wi-Fi leave the server only for a confirmed or checked-in stay
paid in full, from N hours before check-in (the company's setting, by the night or
by the hour) until check-out; the page never decides that itself.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from app.application.inventory.guest_orders import billings, minibar_open
from app.domain.booking.entities import Booking, BookingDeposit
from app.domain.booking.repositories import (
    BookingDepositRepository,
    BookingPaymentRepository,
    BookingRepository,
    GuestRepository,
)
from app.domain.booking.value_objects import BookingStatus, RentalMode
from app.domain.inventory.entities import GuestOrder, OrderBilling, Product
from app.domain.inventory.repositories import GuestOrderRepository, ProductRepository
from app.domain.property.entities import Property
from app.domain.property.repositories import PropertyFactRepository, PropertyPhotoRepository, PropertyRepository
from app.domain.property.value_objects import FactAudience, GuestMediaSection, MediaKind
from app.domain.settings.entities import DEFAULT_TIME_ZONE, CompanySettings
from app.domain.settings.repositories import CompanySettingsRepository
from app.domain.site.entities import CompanySite
from app.domain.site.repositories import CompanySiteRepository

# A stay that is over or called off: the page says so, names the stay for the
# messages to the host (documents for the books), and keeps the rest back.
_CLOSED = {BookingStatus.CANCELLED, BookingStatus.CHECKED_OUT, BookingStatus.COMPLETED}
_LIVE = {BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN}
# How far past check-out the page looks for the next guest: "free until" beyond it says nothing useful.
_FREE_AHEAD_DAYS = 60


@dataclass
class GuestMedia:
    """A check-in photo or video: the owner's words with it."""

    url: str
    caption: str | None
    kind: MediaKind = MediaKind.PHOTO


@dataclass
class GuestAccess:
    """How to get in: only for a live stay paid in full."""

    instructions: str | None
    wifi_name: str | None
    wifi_password: str | None
    facts: list[str] = field(default_factory=list)
    # The path to the door: the flat's check-in photos and videos, in order.
    photos: list[GuestMedia] = field(default_factory=list)
    # Beside the door code: how the lock opens.
    door: list[GuestMedia] = field(default_factory=list)
    # How to use the things in the flat: the air conditioner, the stove.
    howto: list[GuestMedia] = field(default_factory=list)
    # Where exactly: the entrance, the block and the flat's number come with the code.
    entrance: str | None = None
    block: str | None = None
    apartment_number: str | None = None


@dataclass
class GuestMinibar:
    """How the minibar takes orders now: the ways to pay and the hours."""

    billings: list[OrderBilling]
    opens: time | None
    closes: time | None
    # Inside the hours at the page's moment.
    open_now: bool


@dataclass
class GuestPanel:
    booking: Booking
    site: CompanySite | None
    # The company's own day: which buttons fit (arrival, the stay, departure).
    today: date
    closed: bool
    # The company's wall clock now: the page counts down by it, not by the phone's zone.
    now: datetime | None = None
    guest_name: str | None = None
    flat: Property | None = None
    paid: Decimal = Decimal("0")
    # Minibar orders owed with the stay (the repository's one rule): on top of it.
    orders_due: Decimal = Decimal("0")
    access: GuestAccess | None = None
    # How many hours before check-in the way in opens, once paid: for the page's hint.
    lead_hours: int = 24
    # The minibar's menu, during the stay only: active products with something left.
    menu: list[Product] | None = None
    # With the menu: the ways to pay and the hours.
    minibar: GuestMinibar | None = None
    # The booking's own orders, newest first: their state for the guest.
    orders: list[GuestOrder] = field(default_factory=list)
    # The flat's cover for the page's header: a listing photo, never a check-in one.
    photo_url: str | None = None
    # The day the next guest arrives (or the flat closes) after this stay, within
    # _FREE_AHEAD_DAYS: how long the stay may be extended. None: nobody in sight.
    free_until: date | None = None
    # The stay's deposit, its latest record: the amount and what became of it.
    deposit: BookingDeposit | None = None
    # A later check-out the flat sells, offered while nobody comes that day: (until hour, price or None).
    late_check_out: tuple[int, Decimal | None] | None = None

    @property
    def remaining(self) -> Decimal:
        return max(self.booking.total_price - self.paid, Decimal("0")) + self.orders_due


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
        orders: GuestOrderRepository | None = None,
        photos: PropertyPhotoRepository | None = None,
        deposits: BookingDepositRepository | None = None,
    ) -> None:
        self._bookings = bookings
        self._payments = payments
        self._guests = guests
        self._properties = properties
        self._facts = facts
        self._sites = sites
        self._settings = company_settings
        self._products = products
        self._orders = orders
        self._photos = photos
        self._deposits = deposits

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
            now=local_now.replace(microsecond=0),
            closed=booking.status in _CLOSED,
            # The name of this booking's guest only: never a phone, never anyone else.
            guest_name=guest.name if guest and guest.company_id == booking.company_id else None,
            flat=prop if prop and prop.company_id == booking.company_id else None,
            paid=paid,
            lead_hours=lead_hours,
        )
        if self._orders is not None:
            due = await self._orders.due_by_bookings(booking.company_id, [booking.id])
            panel.orders_due = due.get(booking.id, Decimal("0"))
            if not panel.closed:
                panel.orders = list(await self._orders.list_for_booking(booking.company_id, booking.id))
        pictures = (
            await self._photos.list_by_property(panel.flat.id)
            if panel.flat is not None and not panel.closed and self._photos is not None
            else []
        )
        listing = sorted(
            (p for p in pictures if p.audience == FactAudience.PUBLIC), key=lambda p: (not p.is_cover, p.sort_order)
        )
        panel.photo_url = listing[0].url if listing else None
        if panel.flat is not None and not panel.closed:
            panel.free_until = await self._free_until(booking)
            flat_ = panel.flat
            # Only by the night, later than this stay already ends, and only while the day of
            # check-out is nobody else's.
            if (
                flat_.late_check_out_hour is not None
                and flat_.late_check_out_hour > booking.check_out.hour
                and booking.rental_mode != RentalMode.HOURLY
                and (panel.free_until is None or panel.free_until > booking.check_out.date())
            ):
                panel.late_check_out = (flat_.late_check_out_hour, flat_.late_check_out_price)
        if self._deposits is not None:
            records = await self._deposits.get_by_booking(booking.id)
            panel.deposit = records[0] if records else None
        opens = booking.check_in - timedelta(hours=lead_hours)
        if (
            panel.flat is not None
            and booking.status in _LIVE
            and paid >= booking.total_price
            and opens <= local_now < booking.check_out
        ):
            facts = await self._facts.list_by_property(panel.flat.id)
            check_in = [p for p in sorted(pictures, key=lambda p: p.sort_order) if p.audience == FactAudience.GUEST]

            def placed(section: GuestMediaSection) -> list[GuestMedia]:
                return [GuestMedia(p.url, p.caption, p.kind) for p in check_in if p.section == section]

            panel.access = GuestAccess(
                instructions=panel.flat.check_in_instructions,
                wifi_name=panel.flat.wifi_name,
                wifi_password=panel.flat.wifi_password,
                facts=[f.text for f in facts if f.audience == FactAudience.GUEST],
                photos=placed(GuestMediaSection.PATH),
                door=placed(GuestMediaSection.DOOR),
                howto=placed(GuestMediaSection.HOWTO),
                entrance=panel.flat.entrance,
                block=panel.flat.block,
                apartment_number=panel.flat.apartment_number,
            )
        if self._products is not None and minibar_open(booking, today):
            stock = await self._products.list(booking.company_id)
            panel.menu = [p for p in stock if p.is_active and p.stock > 0]
            rules = company or CompanySettings()
            panel.minibar = GuestMinibar(
                billings=billings(company),
                opens=rules.minibar_opens,
                closes=rules.minibar_closes,
                open_now=rules.minibar_takes_orders(local_now.time()),
            )
        return panel

    async def _free_until(self, booking: Booking) -> date | None:
        """The first day after this stay that the flat is taken: another booking or a block."""
        start = booking.check_out.date()
        end = start + timedelta(days=_FREE_AHEAD_DAYS)
        later = await self._bookings.get_by_property_and_dates(booking.property_id, start, end, exclude_id=booking.id)
        blocks = await self._bookings.list_blocks(booking.property_id, start, end)
        # Only stays after this one: an hourly stay earlier the same day ends before it.
        days = [b.check_in.date() for b in later if b.check_out > booking.check_out] + [b.start_date for b in blocks]
        # A stay or block already running at check-out leaves no room: the stay ends as booked.
        return min((max(day, start) for day in days), default=None)
