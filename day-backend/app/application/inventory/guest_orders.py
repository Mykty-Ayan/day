"""A guest's minibar order, placed from the guest's page during the stay.

The order lives in Day; the page also opens the host's WhatsApp with its text.
It is paid apart from the booking, at the door. Placing it takes nothing from
the stock: that happens when the host delivers it.
"""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from decimal import Decimal
from urllib.parse import quote
from zoneinfo import ZoneInfo

from app.domain.booking.entities import Booking
from app.domain.booking.repositories import BookingRepository
from app.domain.booking.value_objects import BookingSource, BookingStatus
from app.domain.inventory.entities import GuestOrder, GuestOrderItem, Product
from app.domain.inventory.repositories import GuestOrderRepository, ProductRepository, StockMovementRepository
from app.domain.property.repositories import PropertyRepository
from app.domain.settings.entities import DEFAULT_TIME_ZONE
from app.domain.settings.repositories import CompanySettingsRepository
from app.domain.site.repositories import CompanySiteRepository

MAX_LINES = 30
MAX_PER_LINE = 20
# Orders a booking may place in an hour: more is a stuck button or someone playing.
MAX_PER_HOUR = 5

_TEXT = {
    "ru": ("Заказ №{number}, кв. {flat}:", "Итого: {total}", "Комментарий: {note}"),
    "kz": ("Тапсырыс №{number}, пәтер {flat}:", "Барлығы: {total}", "Түсініктеме: {note}"),
    "en": ("Order #{number}, flat {flat}:", "Total: {total}", "Note: {note}"),
}


class MinibarClosedError(Exception):
    """The booking is outside the minibar's days, or not live."""


class OutOfStockError(Exception):
    pass


class TooManyOrdersError(Exception):
    pass


def minibar_open(booking: Booking, today: date) -> bool:
    """From the arrival day to the departure day, for a confirmed or checked-in stay.
    Never for an Airbnb guest: Airbnb forbids taking money past the platform."""
    if booking.status not in (BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN):
        return False
    if booking.source == BookingSource.AIRBNB:
        return False
    return booking.check_in.date() <= today <= booking.check_out.date()


def _money(amount: Decimal) -> str:
    return f"{amount:,.0f}".replace(",", " ") + " ₸"


@dataclass
class PlacedOrder:
    order: GuestOrder
    flat_name: str
    # wa.me with the order's text; None when the company gave no WhatsApp number.
    whatsapp_url: str | None


class GuestOrderService:
    def __init__(
        self,
        orders: GuestOrderRepository,
        products: ProductRepository,
        movements: StockMovementRepository,
        bookings: BookingRepository,
        properties: PropertyRepository,
        sites: CompanySiteRepository,
        company_settings: CompanySettingsRepository,
    ) -> None:
        self._orders = orders
        self._products = products
        self._movements = movements
        self._bookings = bookings
        self._properties = properties
        self._sites = sites
        self._settings = company_settings

    async def menu(self, company_id: uuid.UUID) -> list[Product]:
        """What a guest may order: active products with something left."""
        return [p for p in await self._products.list(company_id) if p.is_active and p.stock > 0]

    async def today(self, company_id: uuid.UUID, now: datetime | None = None) -> date:
        company = await self._settings.get_by_company(company_id)
        zone = ZoneInfo(company.time_zone if company and company.time_zone else DEFAULT_TIME_ZONE)
        return (now or datetime.now(tz=ZoneInfo("UTC"))).astimezone(zone).date()

    async def place(
        self,
        code: str,
        lines: Sequence[tuple[uuid.UUID, int]],
        note: str | None,
        language: str = "ru",
        now: datetime | None = None,
    ) -> PlacedOrder:
        booking = await self._bookings.get_by_guest_code(code) if len(code) == 16 else None
        if booking is None:
            raise LookupError("Not found")
        if not minibar_open(booking, await self.today(booking.company_id, now)):
            raise MinibarClosedError("The minibar takes orders during the stay")
        if not 0 < len(lines) <= MAX_LINES:
            raise ValueError(f"An order has 1 to {MAX_LINES} lines")
        wanted: dict[uuid.UUID, int] = {}
        for product_id, quantity in lines:
            if not 0 < quantity <= MAX_PER_LINE:
                raise ValueError(f"A line has 1 to {MAX_PER_LINE} pieces")
            wanted[product_id] = wanted.get(product_id, 0) + quantity
        utc_now = (now or datetime.now(tz=ZoneInfo("UTC"))).astimezone(ZoneInfo("UTC")).replace(tzinfo=None)
        if await self._orders.count_since(booking.id, utc_now - timedelta(hours=1)) >= MAX_PER_HOUR:
            raise TooManyOrdersError("Too many orders in an hour")

        items = []
        for product_id, quantity in wanted.items():
            # The booking's own company only; the price is the server's, never the page's.
            product = await self._products.get(booking.company_id, product_id)
            if product is None or not product.is_active or product.archived_at is not None:
                raise ValueError("No such product")
            if not 0 < quantity <= MAX_PER_LINE:
                raise ValueError(f"A line has 1 to {MAX_PER_LINE} pieces")
            if product.stock < quantity:
                raise OutOfStockError(f"Not enough {product.name}: {max(product.stock, 0)} left")
            items.append(
                GuestOrderItem(product_id=product.id, name=product.name, price=product.price, quantity=quantity)
            )
        order = await self._orders.add(
            GuestOrder(
                company_id=booking.company_id,
                booking_id=booking.id,
                property_id=booking.property_id,
                total=sum((i.price * i.quantity for i in items), Decimal(0)),
                items=items,
                guest_note=(note or "").strip() or None,
            )
        )
        prop = await self._properties.get_by_id(booking.property_id)
        flat = prop.name if prop and prop.company_id == booking.company_id else ""
        site = await self._sites.get(booking.company_id)
        url = None
        if site is not None and site.whatsapp:
            head, total, comment = _TEXT.get(language, _TEXT["ru"])
            text = "\n".join(
                [head.format(number=order.number, flat=flat)]
                + [f"• {i.name} × {i.quantity} — {_money(i.price * i.quantity)}" for i in order.items]
                + [total.format(total=_money(order.total))]
                + ([comment.format(note=order.guest_note)] if order.guest_note else [])
            )
            url = f"https://wa.me/{''.join(c for c in site.whatsapp if c.isdigit())}?text={quote(text)}"
        return PlacedOrder(order=order, flat_name=flat, whatsapp_url=url)
