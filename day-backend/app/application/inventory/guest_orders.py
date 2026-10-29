"""A guest's minibar order: placed from the guest's page, handled by the host.

The order lives in Day; the page also opens the host's WhatsApp with its text.
The guest pays one of the ways the company takes (its settings): by a Kaspi
invoice the host sends by hand before delivery (new → awaiting_payment → paid,
accepted → delivered), or added to the booking's bill (new → accepted →
delivered on the tab). At delivery the host may still settle it otherwise. The
stock goes down when the order is delivered, not when it is placed: a cancelled
order never touched it.
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
from app.domain.inventory.entities import (
    MAX_MONEY,
    GuestOrder,
    GuestOrderItem,
    MovementKind,
    OrderBilling,
    OrderPayment,
    OrderPaymentStatus,
    OrderStatus,
    Product,
    StockMovement,
)
from app.domain.inventory.repositories import GuestOrderRepository, ProductRepository, StockMovementRepository
from app.domain.property.repositories import PropertyRepository
from app.domain.settings.entities import DEFAULT_TIME_ZONE, CompanySettings
from app.domain.settings.repositories import CompanySettingsRepository
from app.domain.site.repositories import CompanySiteRepository

MAX_LINES = 30
MAX_PER_LINE = 20
# Orders a booking may place in an hour: more is a stuck button or someone playing.
MAX_PER_HOUR = 5
# A repeat of the same cart within this many seconds is the same order sent twice.
REPEAT_SECONDS = 60

_TEXT = {
    "ru": ("Заказ №{number}, кв. {flat}:", "Итого: {total}", "Комментарий: {note}"),
    "kz": ("Тапсырыс №{number}, пәтер {flat}:", "Барлығы: {total}", "Түсініктеме: {note}"),
    "en": ("Order #{number}, flat {flat}:", "Total: {total}", "Note: {note}"),
}


# Not yet delivered nor cancelled: the host may still deliver or cancel it.
_OPEN = {OrderStatus.NEW, OrderStatus.AWAITING_PAYMENT, OrderStatus.ACCEPTED}


class MinibarClosedError(Exception):
    """The booking is outside the minibar's days, or not live."""


class MinibarAfterHoursError(MinibarClosedError):
    """Outside the company's minibar hours."""


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


def billings(company: CompanySettings | None) -> list[OrderBilling]:
    """The ways the company takes, the invoice first; a company without settings
    takes the invoice, as a new one does."""
    company = company or CompanySettings()
    ways = [OrderBilling.INVOICE] if company.minibar_invoice else []
    return ways + ([OrderBilling.BOOKING] if company.minibar_on_booking else [])


def _money(amount: Decimal) -> str:
    return f"{amount:,.0f}".replace(",", " ") + " ₸"


@dataclass
class PlacedOrder:
    order: GuestOrder
    flat_name: str
    # wa.me with the order's text; None when the company gave no WhatsApp number.
    whatsapp_url: str | None
    # The same order sent again (a double tap, a retry): the one already made, told once.
    repeated: bool = False


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

    async def place(
        self,
        code: str,
        lines: Sequence[tuple[uuid.UUID, int]],
        note: str | None,
        language: str = "ru",
        now: datetime | None = None,
        billing: OrderBilling | None = None,
    ) -> PlacedOrder:
        """`billing` None: the company's first way (one way on: that one)."""
        booking = await self._bookings.get_by_guest_code(code) if len(code) == 16 else None
        if booking is None:
            raise LookupError("Not found")
        company = await self._settings.get_by_company(booking.company_id)
        zone = ZoneInfo(company.time_zone if company and company.time_zone else DEFAULT_TIME_ZONE)
        local = (now or datetime.now(tz=ZoneInfo("UTC"))).astimezone(zone)
        if not minibar_open(booking, local.date()):
            raise MinibarClosedError("The minibar takes orders during the stay")
        if not (company or CompanySettings()).minibar_takes_orders(local.time().replace(tzinfo=None)):
            raise MinibarAfterHoursError("The minibar takes no orders at this hour")
        ways = billings(company)
        if billing is None:
            billing = ways[0]
        elif billing not in ways:
            raise ValueError("The company does not take this way of paying")
        if not 0 < len(lines) <= MAX_LINES:
            raise ValueError(f"An order has 1 to {MAX_LINES} lines")
        wanted: dict[uuid.UUID, int] = {}
        for product_id, quantity in lines:
            if not 0 < quantity <= MAX_PER_LINE:
                raise ValueError(f"A line has 1 to {MAX_PER_LINE} pieces")
            wanted[product_id] = wanted.get(product_id, 0) + quantity
        utc_now = (now or datetime.now(tz=ZoneInfo("UTC"))).astimezone(ZoneInfo("UTC")).replace(tzinfo=None)
        note = (note or "").strip() or None
        # One booking's orders one at a time, to the transaction's end: a double tap
        # waits for the first and then finds it.
        await self._orders.hold(booking.id)
        cart = sorted(wanted.items())
        for prior in await self._orders.recent_new(booking.id, utc_now - timedelta(seconds=REPEAT_SECONDS)):
            if prior.guest_note == note and sorted((i.product_id, i.quantity) for i in prior.items) == cart:
                return await self._placed(booking, prior, language, repeated=True)
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
        total = sum((i.price * i.quantity for i in items), Decimal(0))
        # The column is Numeric(12, 2): a larger total would come back as a 500.
        if total > MAX_MONEY:
            raise ValueError("The order's total is too large")
        order = await self._orders.add(
            GuestOrder(
                company_id=booking.company_id,
                booking_id=booking.id,
                property_id=booking.property_id,
                total=total,
                items=items,
                billing=billing,
                guest_note=note,
            )
        )
        return await self._placed(booking, order, language)

    async def _placed(self, booking, order: GuestOrder, language: str, repeated: bool = False) -> PlacedOrder:
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
        return PlacedOrder(order=order, flat_name=flat, whatsapp_url=url, repeated=repeated)

    async def list(self, company_id: uuid.UUID, *, status: OrderStatus | None = None) -> Sequence[GuestOrder]:
        return await self._orders.list(company_id, status=status)

    async def cancel_by_guest(self, code: str, number: int) -> PlacedOrder:
        """The guest calls off their own order, while it waits for the host or for
        the invoice's payment and nothing is paid. LookupError for another booking's
        order or a wrong code; ValueError when it is past that."""
        booking = await self._bookings.get_by_guest_code(code) if len(code) == 16 else None
        if booking is None:
            raise LookupError("Not found")
        found = [o for o in await self._orders.list_for_booking(booking.company_id, booking.id) if o.number == number]
        if not found:
            raise LookupError("Order not found")
        order = found[0]
        if order.payment_status is not None:
            raise ValueError("The order is paid or on the tab")
        order.status, order.cancelled_at = OrderStatus.CANCELLED, datetime.utcnow()
        moved = await self._orders.move(
            booking.company_id, order.id, {OrderStatus.NEW, OrderStatus.AWAITING_PAYMENT}, order, None
        )
        if moved is None:
            raise ValueError("The host has the order on its way")
        prop = await self._properties.get_by_id(booking.property_id)
        flat = prop.name if prop and prop.company_id == booking.company_id else ""
        return PlacedOrder(order=moved, flat_name=flat, whatsapp_url=None)

    async def list_for_booking(self, company_id: uuid.UUID, booking_id: uuid.UUID) -> Sequence[GuestOrder]:
        return await self._orders.list_for_booking(company_id, booking_id)

    async def accept(self, company_id: uuid.UUID, order_id: uuid.UUID, by: uuid.UUID | None) -> GuestOrder:
        """Confirmed: by invoice it now waits for the guest's payment; on the
        booking's bill it goes straight on its way."""
        order = await self._get(company_id, order_id)
        was = order.payment_status
        order.accepted_at = datetime.utcnow()
        order.status = OrderStatus.AWAITING_PAYMENT if order.billing == OrderBilling.INVOICE else OrderStatus.ACCEPTED
        return await self._move(company_id, order_id, {OrderStatus.NEW}, order, was)

    async def invoiced(self, company_id: uuid.UUID, order_id: uuid.UUID, by: uuid.UUID | None) -> GuestOrder:
        """The host sent the Kaspi invoice (by hand: Kaspi Pay has no API); the
        guest's page says it is in their Kaspi app."""
        order = await self._get(company_id, order_id)
        was = order.payment_status
        order.invoiced_at, order.handled_by = datetime.utcnow(), by
        return await self._move(company_id, order_id, {OrderStatus.AWAITING_PAYMENT}, order, was)

    async def cancel(self, company_id: uuid.UUID, order_id: uuid.UUID, by: uuid.UUID | None) -> GuestOrder:
        order = await self._get(company_id, order_id)
        was = order.payment_status
        order.status, order.cancelled_at, order.handled_by = OrderStatus.CANCELLED, datetime.utcnow(), by
        return await self._move(company_id, order_id, _OPEN, order, was)

    async def deliver(
        self, company_id: uuid.UUID, order_id: uuid.UUID, payment: OrderPayment | None, by: uuid.UUID | None
    ) -> GuestOrder:
        """Delivered: paid at the door (`payment`, how) or on the guest's tab (None),
        whatever way was chosen when ordering — the host settles it as it went. An
        order already paid by its invoice stays paid as it was. A sale per line, in
        the same transaction. The stock may go below zero — the goods are with the
        guest; the purchase was not recorded."""
        order = await self._get(company_id, order_id)
        was = order.payment_status
        now = datetime.utcnow()
        order.status, order.delivered_at, order.handled_by = OrderStatus.DELIVERED, now, by
        if order.payment_status != OrderPaymentStatus.PAID:
            order.payment_method = payment
            order.payment_status = OrderPaymentStatus.PAID if payment else OrderPaymentStatus.ON_BOOKING
            order.paid_at = now if payment else None
        delivered = await self._move(company_id, order_id, _OPEN, order, was)
        for item in delivered.items:
            await self._movements.add(
                StockMovement(
                    company_id=company_id,
                    product_id=item.product_id,
                    kind=MovementKind.SALE,
                    quantity=-item.quantity,
                    order_id=delivered.id,
                    note=f"№{delivered.number}",
                    created_by=by,
                )
            )
        return delivered

    async def mark_paid(
        self, company_id: uuid.UUID, order_id: uuid.UUID, payment: OrderPayment, by: uuid.UUID | None
    ) -> GuestOrder:
        """The guest paid: the invoice of an order awaiting payment (it goes on its
        way), or an order delivered on the tab."""
        order = await self._get(company_id, order_id)
        was = order.payment_status
        if order.status == OrderStatus.AWAITING_PAYMENT:
            order.status, allowed = OrderStatus.ACCEPTED, {OrderStatus.AWAITING_PAYMENT}
        elif order.payment_status == OrderPaymentStatus.ON_BOOKING:
            allowed = {OrderStatus.DELIVERED}
        else:
            raise ValueError("The order is not awaiting payment nor on the tab")
        order.payment_status, order.payment_method, order.paid_at = OrderPaymentStatus.PAID, payment, datetime.utcnow()
        order.handled_by = by
        return await self._move(company_id, order_id, allowed, order, was)

    async def _get(self, company_id: uuid.UUID, order_id: uuid.UUID) -> GuestOrder:
        order = await self._orders.get(company_id, order_id)
        if order is None:
            raise LookupError("Order not found")
        return order

    async def _move(
        self,
        company_id: uuid.UUID,
        order_id: uuid.UUID,
        allowed: set[OrderStatus],
        order: GuestOrder,
        was: OrderPaymentStatus | None,
    ) -> GuestOrder:
        """Write the step if the order is still in `allowed` and its payment is still
        `was`, as read: a payment another hand recorded meanwhile is never lost."""
        moved = await self._orders.move(company_id, order_id, allowed, order, was)
        if moved is None:
            raise ValueError("The order is not in a state for this")
        return moved
