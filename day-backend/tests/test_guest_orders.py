"""A guest's minibar order: placed from the guest's page during the stay, handled
by the host. The price is the server's; the stock goes down on delivery only;
the order is paid apart from the booking.
"""

import copy
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from types import SimpleNamespace
from zoneinfo import ZoneInfo

import pytest

from app.application.inventory.guest_orders import (
    GuestOrderService,
    MinibarClosedError,
    OutOfStockError,
    TooManyOrdersError,
    minibar_open,
)
from app.application.messaging.notifications import NotificationDispatcher, render
from app.domain.booking.entities import Booking
from app.domain.booking.value_objects import BookingStatus
from app.domain.inventory.entities import MovementKind, OrderPayment, OrderStatus, Product
from app.domain.messaging.entities import OutboundNotification
from app.domain.messaging.value_objects import Channel, NotificationEvent
from app.domain.site.entities import CompanySite
from tests.test_inventory import FakeMovements, FakeProducts
from tests.test_property_facts import flat  # noqa: F401  (a fixture)
from tests.test_property_services import COMPANY_ID, _make_property

CODE = "abcdefghjkmnpqrs"
NOW = datetime(2026, 10, 26, 6, tzinfo=timezone.utc)  # 26 Oct, 11:00 in Almaty


class FakeOrders:
    def __init__(self):
        self.rows = {}

    async def add(self, order):
        order.number = 1 + max((o.number for o in self.rows.values() if o.company_id == order.company_id), default=0)
        order.created_at = datetime(2026, 10, 26, 6)
        self.rows[order.id] = order
        return order

    async def count_since(self, booking_id, since):
        return sum(1 for o in self.rows.values() if o.booking_id == booking_id and o.created_at >= since)

    async def get(self, company_id, order_id):
        # A copy, as a fresh read from the database is: the caller's changes are its own.
        found = self.rows.get(order_id)
        return copy.deepcopy(found) if found is not None and found.company_id == company_id else None

    async def list(self, company_id, *, status=None):
        return [o for o in self.rows.values() if o.company_id == company_id and status in (None, o.status)]

    async def move(self, company_id, order_id, allowed, order):
        stored = await self.get(company_id, order_id)
        if stored is None or stored.status not in allowed:
            return None
        self.rows[order_id] = order
        return order


class _Bookings:
    def __init__(self, booking):
        self.booking = booking

    async def get_by_guest_code(self, code):
        return self.booking if code == self.booking.guest_code else None


class _One:
    def __init__(self, row):
        self.row = row

    async def get_by_id(self, row_id):
        return self.row if row_id == self.row.id else None


class _Site:
    def __init__(self, whatsapp="77001234567"):
        self.whatsapp = whatsapp

    async def get(self, company_id):
        return CompanySite(company_id=company_id, slug="munar", title="Munar", whatsapp=self.whatsapp)


class _Settings:
    async def get_by_company(self, company_id):
        return SimpleNamespace(time_zone="Asia/Almaty")


def _booking(status=BookingStatus.CONFIRMED, check_in=datetime(2026, 10, 25, 14), check_out=datetime(2026, 10, 27, 12)):
    return Booking(company_id=COMPANY_ID, property_id=uuid.uuid4(), status=status, check_in=check_in,
                   check_out=check_out, guest_code=CODE)


async def _setup(booking=None, whatsapp="77001234567"):
    booking = booking or _booking()
    flat_ = _make_property(name="Т13")
    flat_.id = booking.property_id
    movements = FakeMovements()
    products = FakeProducts(movements)
    orders = FakeOrders()
    svc = GuestOrderService(orders, products, movements, _Bookings(booking), _One(flat_), _Site(whatsapp), _Settings())
    cola = await products.add(Product(company_id=COMPANY_ID, name="Кола", price=Decimal("800")))
    nuts = await products.add(Product(company_id=COMPANY_ID, name="Арахис", price=Decimal("600")))
    from app.domain.inventory.entities import StockMovement

    for product, qty in ((cola, 5), (nuts, 1)):
        await movements.add(StockMovement(company_id=COMPANY_ID, product_id=product.id, kind=MovementKind.PURCHASE,
                                          quantity=qty))
    return svc, orders, movements, products, cola, nuts


async def test_an_order_takes_the_servers_prices_and_opens_whatsapp_with_its_text():
    svc, _, movements, _, cola, nuts = await _setup()
    placed = await svc.place(CODE, [(cola.id, 2), (nuts.id, 1)], " без льда ", "ru", NOW)

    order = placed.order
    assert (order.number, order.status, order.total) == (1, OrderStatus.NEW, Decimal("2200"))
    assert order.guest_note == "без льда"
    assert [(i.name, i.price, i.quantity) for i in order.items] == [("Кола", Decimal("800"), 2),
                                                                    ("Арахис", Decimal("600"), 1)]
    from urllib.parse import unquote

    text = unquote(placed.whatsapp_url)
    assert placed.whatsapp_url.startswith("https://wa.me/77001234567?text=")
    for part in ("Заказ №1, кв. Т13", "Кола × 2 — 1 600 ₸", "Итого: 2 200 ₸", "Комментарий: без льда"):
        assert part in text
    # Placing touches no stock: it goes down on delivery.
    assert all(m.kind == MovementKind.PURCHASE for m in movements.rows)


async def test_the_order_is_refused_outside_the_stay_or_beyond_the_stock():
    for booking in (_booking(status=BookingStatus.PENDING), _booking(check_in=datetime(2026, 10, 27, 14),
                                                                     check_out=datetime(2026, 10, 29, 12))):
        svc, *_ , cola, _ = await _setup(booking)
        with pytest.raises(MinibarClosedError):
            await svc.place(CODE, [(cola.id, 1)], None, "ru", NOW)
    svc, _, _, _, cola, nuts = await _setup()
    with pytest.raises(OutOfStockError, match="Арахис"):
        await svc.place(CODE, [(nuts.id, 2)], None, "ru", NOW)
    # Two lines of the same product count together.
    with pytest.raises(OutOfStockError):
        await svc.place(CODE, [(cola.id, 3), (cola.id, 3)], None, "ru", NOW)
    with pytest.raises(LookupError):
        await svc.place("nosuchcodeatall0", [(cola.id, 1)], None, "ru", NOW)


async def test_wrong_lines_and_another_companys_product_are_refused():
    svc, _, _, products, cola, _ = await _setup()
    theirs = await products.add(Product(company_id=uuid.uuid4(), name="Чужое", price=Decimal("1")))
    hidden = await products.add(Product(company_id=COMPANY_ID, name="Скрытое", price=Decimal("1"), is_active=False))
    for lines in ([], [(cola.id, 0)], [(cola.id, 21)], [(cola.id, 1)] * 31, [(theirs.id, 1)], [(hidden.id, 1)]):
        with pytest.raises(ValueError):
            await svc.place(CODE, lines, None, "ru", NOW)


async def test_five_orders_an_hour_per_booking():
    svc, *_ , cola, _ = await _setup()
    for _ in range(5):
        await svc.place(CODE, [(cola.id, 1)], None, "en", NOW)
    with pytest.raises(TooManyOrdersError):
        await svc.place(CODE, [(cola.id, 1)], None, "en", NOW)


async def test_delivery_writes_a_sale_per_line_and_may_take_the_stock_below_zero():
    svc, _, movements, products, cola, nuts = await _setup()
    order = (await svc.place(CODE, [(cola.id, 2), (nuts.id, 1)], None, "ru", NOW)).order
    # The last peanuts went elsewhere meanwhile: the guest has them anyway.
    from app.domain.inventory.entities import StockMovement

    await movements.add(StockMovement(company_id=COMPANY_ID, product_id=nuts.id, kind=MovementKind.WRITEOFF,
                                      quantity=-1, note="Разбили"))
    await svc.accept(COMPANY_ID, order.id, None)
    done = await svc.deliver(COMPANY_ID, order.id, OrderPayment.CASH, uuid.uuid4())

    assert (done.status, done.payment_method) == (OrderStatus.DELIVERED, OrderPayment.CASH)
    sales = [(m.product_id, m.quantity, m.order_id) for m in movements.rows if m.kind == MovementKind.SALE]
    assert sales == [(cola.id, -2, order.id), (nuts.id, -1, order.id)]
    assert ((await products.get(COMPANY_ID, cola.id)).stock, (await products.get(COMPANY_ID, nuts.id)).stock) == (3, -1)
    # Delivered once: a second hand changes nothing and writes no second sale.
    with pytest.raises(ValueError):
        await svc.deliver(COMPANY_ID, order.id, OrderPayment.CARD, None)
    with pytest.raises(ValueError):
        await svc.cancel(COMPANY_ID, order.id, None)
    assert len([m for m in movements.rows if m.kind == MovementKind.SALE]) == 2


async def test_a_cancelled_order_never_touches_the_stock_and_another_company_cannot_see_it():
    svc, _, movements, _, cola, _ = await _setup()
    order = (await svc.place(CODE, [(cola.id, 1)], None, "ru", NOW)).order
    other = uuid.uuid4()
    for call in (svc.accept(other, order.id, None), svc.cancel(other, order.id, None),
                 svc.deliver(other, order.id, OrderPayment.CASH, None)):
        with pytest.raises(LookupError):
            await call
    assert await svc.list(other) == []
    await svc.cancel(COMPANY_ID, order.id, None)
    assert not [m for m in movements.rows if m.kind == MovementKind.SALE]


async def test_an_order_on_the_tab_is_owed_until_paid():
    from app.domain.inventory.entities import OrderPaymentStatus

    svc, _, movements, _, cola, _ = await _setup()
    order = (await svc.place(CODE, [(cola.id, 1)], None, "ru", NOW)).order
    tab = await svc.deliver(COMPANY_ID, order.id, None, None)
    assert (tab.payment_status, tab.payment_method, tab.paid_at) == (OrderPaymentStatus.ON_BOOKING, None, None)
    # Delivered all the same: the cola is with the guest.
    assert [m.quantity for m in movements.rows if m.kind == MovementKind.SALE] == [-1]

    paid = await svc.mark_paid(COMPANY_ID, order.id, OrderPayment.TRANSFER, None)
    assert (paid.payment_status, paid.payment_method, paid.paid_at is not None) == (
        OrderPaymentStatus.PAID, OrderPayment.TRANSFER, True
    )
    with pytest.raises(ValueError, match="tab"):
        await svc.mark_paid(COMPANY_ID, order.id, OrderPayment.CASH, None)
    with pytest.raises(LookupError):
        await svc.mark_paid(uuid.uuid4(), order.id, OrderPayment.CASH, None)


def test_delivered_paid_needs_how_and_on_the_tab_takes_none():
    from pydantic import ValidationError

    from app.presentation.schemas.guest_orders import GuestOrderDeliver

    assert GuestOrderDeliver(payment_method="cash").payment_status == "paid"
    assert GuestOrderDeliver(payment_status="on_booking").payment_method is None
    for wrong in ({}, {"payment_status": "on_booking", "payment_method": "cash"}):
        with pytest.raises(ValidationError):
            GuestOrderDeliver(**wrong)


async def test_no_whatsapp_number_no_link_but_the_order_is_in_day():
    svc, orders, *_ , cola, _ = await _setup(whatsapp=None)
    placed = await svc.place(CODE, [(cola.id, 1)], None, "kz", NOW)
    assert placed.whatsapp_url is None and placed.order.id in orders.rows


def test_the_minibar_is_open_from_the_arrival_day_to_the_departure_day():
    booking = _booking()
    assert [minibar_open(booking, date(2026, 10, d)) for d in (24, 25, 27, 28)] == [False, True, True, False]


def test_the_host_reads_the_order_and_opens_it_in_the_mini_app():
    payload = {"number": 7, "property_name": "Т13", "lines": ["Кола × 2", "<b>x</b> × 1"], "total": "2200",
               "note": "к 22:00", "order_id": "abc"}
    text = render(NotificationEvent.GUEST_ORDER, payload)
    assert "Новый заказ №7" in text and "• Кола × 2" in text and "2 200 ₸" in text and "к 22:00" in text
    assert "&lt;b&gt;x&lt;/b&gt;" in text
    dispatcher = NotificationDispatcher(None, {}, mini_app_url="https://day.test/tma")
    note = OutboundNotification(company_id=COMPANY_ID, channel=Channel.TELEGRAM, target="12345",
                                event=NotificationEvent.GUEST_ORDER, payload=payload)
    [button] = dispatcher._buttons(note)
    assert button.url == "https://day.test/tma?order=abc"


def test_the_order_path_shares_the_guest_booking_limit():
    from starlette.requests import Request

    from app.infrastructure.rate_limiter import _limit_for

    post = Request({"type": "http", "method": "POST", "path": f"/api/v1/public/guest/{CODE}/orders", "headers": []})
    assert _limit_for(post) == ("guestbook", 5)
    read = Request({"type": "http", "method": "GET", "path": f"/api/v1/public/guest/{CODE}", "headers": []})
    assert _limit_for(read)[0] == "get"


# ---------- HTTP ----------


@pytest.mark.integration
async def test_a_guest_orders_from_the_page_and_the_host_delivers(flat):  # noqa: F811  (the imported fixture)
    from app.domain.auth.permissions import Permission
    from tests.test_guest_panel import _guest_code

    client, prop, use = flat
    use(Permission.BOOKINGS_READ, Permission.BOOKINGS_WRITE, Permission.PROPERTIES_READ, Permission.INVENTORY_MANAGE)
    cola = (await client.post("/api/v1/inventory/products", json={"name": "Кола", "price": 800})).json()["id"]
    await client.post(f"/api/v1/inventory/products/{cola}/movements",
                      json={"kind": "purchase", "quantity": 3, "unit_cost": 0})
    today = datetime.now(ZoneInfo("Asia/Almaty")).date()
    stay = {"property_id": str(prop), "guest_name": "Жалгас", "guest_phone": "+77079011161",
            "check_in": f"{today}T14:00:00", "check_out": f"{today + timedelta(days=2)}T12:00:00",
            "rental_mode": "daily", "adults_count": 1, "total_price": 40000}
    made = await client.post("/api/v1/bookings", json=stay)
    assert made.status_code == 201, made.text
    booking = made.json()["id"]
    from app.infrastructure.models.booking import BookingModel

    code = await _guest_code(BookingModel, booking)
    path = f"/api/v1/public/guest/{code}/orders"
    assert (await client.get(f"/api/v1/public/guest/{code}")).json()["menu"] is None
    assert (await client.post(path, json={"items": [{"product_id": cola, "quantity": 1}]})).status_code == 409

    confirmed = await client.post(f"/api/v1/bookings/{booking}/status", json={"status": "confirmed"})
    assert confirmed.status_code == 200, confirmed.text
    [item] = (await client.get(f"/api/v1/public/guest/{code}")).json()["menu"]
    assert (item["name"], item["price"], item["max_quantity"]) == ("Кола", 800, 3)

    assert (await client.post(path, json={"items": [{"product_id": cola, "quantity": 4}]})).status_code == 409
    unknown = {"items": [{"product_id": str(uuid.uuid4()), "quantity": 1}]}
    assert (await client.post(path, json=unknown)).status_code == 422
    # A price sent by the page is ignored: the server's counts.
    order_body = {"items": [{"product_id": cola, "quantity": 2, "price": 1}], "note": "к 22:00"}
    placed = await client.post(path, json=order_body)
    assert placed.status_code == 201, placed.text
    assert (placed.json()["number"], placed.json()["total"]) == (1, 1600)

    # Placing it takes nothing from the stock: the host's delivery does.
    assert (await client.get("/api/v1/inventory/products")).json()[0]["stock"] == 3

    [order] = (await client.get("/api/v1/guest-orders", params={"status": "new"})).json()
    assert (order["guest_name"], order["property_name"], order["guest_note"]) == ("Жалгас", "t13", "к 22:00")
    use(Permission.BOOKINGS_READ)
    assert (await client.post(f"/api/v1/guest-orders/{order['id']}/accept")).status_code == 403
    use(Permission.BOOKINGS_READ, Permission.BOOKINGS_WRITE)
    assert (await client.post(f"/api/v1/guest-orders/{order['id']}/accept")).json()["status"] == "accepted"
    done = await client.post(f"/api/v1/guest-orders/{order['id']}/deliver", json={"payment_method": "card"})
    assert (done.json()["status"], done.json()["payment_method"]) == ("delivered", "card")
    again = await client.post(f"/api/v1/guest-orders/{order['id']}/deliver", json={"payment_method": "card"})
    assert again.status_code == 409
    [listed] = (await client.get("/api/v1/inventory/products")).json()
    assert listed["stock"] == 1
    # Paid apart: the booking's money is untouched.
    assert (await client.get(f"/api/v1/bookings/{booking}/payments")).json() == []

    # The next one on the guest's tab: owed in the bookings and on the guest's page until paid.
    second = await client.post(path, json={"items": [{"product_id": cola, "quantity": 1}]})
    assert second.status_code == 201, second.text
    [new] = (await client.get("/api/v1/guest-orders", params={"status": "new"})).json()
    tab = await client.post(f"/api/v1/guest-orders/{new['id']}/deliver", json={"payment_status": "on_booking"})
    assert tab.json()["payment_status"] == "on_booking"
    owed = lambda body: body["orders_due"]  # noqa: E731
    assert owed((await client.get(f"/api/v1/bookings/{booking}")).json()["booking"]) == 800
    assert [owed(b) for b in (await client.get("/api/v1/bookings")).json()["items"]] == [800]
    page = (await client.get(f"/api/v1/public/guest/{code}")).json()["booking"]
    assert (page["orders_due"], page["remaining"]) == (800, 40800)
    assert (await client.post(f"/api/v1/guest-orders/{new['id']}/deliver", json={})).status_code == 422
    paid = await client.post(f"/api/v1/guest-orders/{new['id']}/paid", json={"payment_method": "cash"})
    assert (paid.status_code, paid.json()["payment_status"]) == (200, "paid")
    assert owed((await client.get(f"/api/v1/bookings/{booking}")).json()["booking"]) == 0
    again = await client.post(f"/api/v1/guest-orders/{new['id']}/paid", json={"payment_method": "cash"})
    assert again.status_code == 409
    assert (await client.post(f"/api/v1/guest-orders/{uuid.uuid4()}/cancel")).status_code == 404


@pytest.mark.integration
async def test_a_guest_cannot_order_another_companys_product(flat):  # noqa: F811  (the imported fixture)
    from app.domain.auth.permissions import Permission
    from app.infrastructure.models.auth import CompanyModel
    from app.infrastructure.models.booking import BookingModel
    from app.infrastructure.models.inventory import ProductModel, StockMovementModel
    from tests.test_guest_panel import _guest_code
    from tests.test_property_tag_filter import _seed

    client, prop, use = flat
    theirs, product = uuid.uuid4(), uuid.uuid4()
    await _seed(
        CompanyModel(id=theirs, name=f"Orders other {theirs.hex[:6]}"),
        ProductModel(id=product, company_id=theirs, name="Чужая кола", price=800),
        StockMovementModel(company_id=theirs, product_id=product, kind="purchase", quantity=5),
    )
    use(Permission.BOOKINGS_READ, Permission.BOOKINGS_WRITE, Permission.PROPERTIES_READ)
    today = datetime.now(ZoneInfo("Asia/Almaty")).date()
    stay = {"property_id": str(prop), "guest_name": "Жалгас", "guest_phone": "+77079011162",
            "check_in": f"{today}T14:00:00", "check_out": f"{today + timedelta(days=1)}T12:00:00",
            "rental_mode": "daily", "adults_count": 1}
    booking = (await client.post("/api/v1/bookings", json=stay)).json()["id"]
    await client.post(f"/api/v1/bookings/{booking}/status", json={"status": "confirmed"})
    code = await _guest_code(BookingModel, booking)

    res = await client.post(f"/api/v1/public/guest/{code}/orders", json={"items": [{"product_id": str(product),
                                                                                    "quantity": 1}]})
    assert res.status_code == 422
    assert (await client.get(f"/api/v1/public/guest/{code}")).json()["menu"] == []


async def test_an_airbnb_guest_gets_no_minibar():
    from app.domain.booking.value_objects import BookingSource

    booking = _booking()
    booking.source = BookingSource.AIRBNB
    assert minibar_open(booking, date(2026, 10, 26)) is False
    svc, *_, cola, _ = await _setup(booking)
    with pytest.raises(MinibarClosedError):
        await svc.place(CODE, [(cola.id, 1)], None, "ru", NOW)


async def test_the_guest_page_counts_orders_on_the_tab_in_what_is_left():
    from tests.test_guest_panel import CODE as PANEL_CODE
    from tests.test_guest_panel import NOW as PANEL_NOW
    from tests.test_guest_panel import _setup as panel_setup

    class _Due:
        async def due_by_bookings(self, company_id, booking_ids):
            return {booking_ids[0]: Decimal("1600")}

    svc = panel_setup(paid=Decimal("40000"))
    svc._orders = _Due()
    panel = await svc.execute(PANEL_CODE, PANEL_NOW)
    # The stay is paid: the code shows; the minibar's tab is still owed.
    assert (panel.orders_due, panel.remaining, panel.access is not None) == (Decimal("1600"), Decimal("1600"), True)
