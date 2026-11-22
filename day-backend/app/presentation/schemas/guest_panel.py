"""What a guest's own page shows. Every field is named here on purpose: a new field
on the booking or the flat stays private until it is added to this list."""

from __future__ import annotations

import uuid
from collections.abc import Callable
from datetime import date, datetime, time

from pydantic import BaseModel

from app.application.booking.guest_panel import GuestPanel


class GuestPanelCompany(BaseModel):
    title: str
    logo_url: str | None = None
    accent_color: str | None = None
    # Digits for wa.me: every button on the page writes here. None hides them.
    whatsapp: str | None = None


class GuestPanelBooking(BaseModel):
    status: str
    rental_mode: str
    check_in: datetime
    check_out: datetime
    adults: int
    total: float
    paid: float
    # Minibar orders owed with the stay (confirmed with the booking, or delivered on
    # the tab; unpaid); part of remaining.
    orders_due: float = 0
    remaining: float
    # The day the next guest arrives after this stay; None when nobody is in sight.
    free_until: date | None = None


class GuestPanelDeposit(BaseModel):
    amount: float
    # pending, paid, returned, held, partially_held. Never the owner's reason.
    status: str
    held: float = 0


class GuestPanelFlat(BaseModel):
    name: str
    # The flat's own page (/s/<code>): to book it again directly.
    code: str | None = None
    # The cover of the flat's listing; None for a closed booking.
    photo_url: str | None = None
    address: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    map_url: str | None = None
    # Public on the flat's page too: the guest finds the complex and the floor.
    complex_name: str | None = None
    floor: int | None = None
    check_in_hour: int | None = None
    check_out_hour: int | None = None
    house_rules: str | None = None
    check_out_instructions: str | None = None


class GuestPanelPhoto(BaseModel):
    url: str
    caption: str | None = None


class GuestPanelAccess(BaseModel):
    instructions: str | None = None
    wifi_name: str | None = None
    wifi_password: str | None = None
    facts: list[str] = []
    # The path to the door, step by step: the flat's check-in photos with the owner's words.
    photos: list[GuestPanelPhoto] = []
    entrance: str | None = None
    block: str | None = None
    apartment_number: str | None = None


class GuestPanelProduct(BaseModel):
    id: uuid.UUID
    name: str
    category: str
    description: str | None = None
    photo_url: str | None = None
    price: float
    # How many may go in the cart: what is left, at most a line's limit.
    max_quantity: int


class GuestPanelMinibar(BaseModel):
    # The ways the company takes: invoice (Kaspi, before delivery), booking (with the stay).
    billings: list[str]
    # Local hours; both null: round the clock.
    opens: time | None = None
    closes: time | None = None
    open_now: bool = True


class GuestPanelOrder(BaseModel):
    number: int
    # new, awaiting_payment, accepted (on its way), delivered, cancelled.
    status: str
    billing: str
    # null until paid or delivered on the tab: paid, on_booking.
    payment_status: str | None = None
    # The host sent the Kaspi invoice.
    invoiced: bool = False
    total: float
    lines: list[str]


class GuestPanelResponse(BaseModel):
    closed: bool
    today: date
    # The company's wall clock at the answer, no zone: check-in and check-out are read on it.
    now: datetime | None = None
    company: GuestPanelCompany | None = None
    guest_name: str | None = None
    booking: GuestPanelBooking | None = None
    flat: GuestPanelFlat | None = None
    # Only for a confirmed or checked-in stay paid in full, from lead_hours before
    # check-in until check-out.
    access: GuestPanelAccess | None = None
    lead_hours: int = 24
    deposit: GuestPanelDeposit | None = None
    # The minibar during the stay; None outside it.
    menu: list[GuestPanelProduct] | None = None
    minibar: GuestPanelMinibar | None = None
    # This booking's own orders, newest first.
    orders: list[GuestPanelOrder] = []

    @classmethod
    def from_panel(cls, panel: GuestPanel, sign: Callable[[str], str] = lambda url: url) -> GuestPanelResponse:
        """`sign`: a stored check-in photo as a link that expires (the bucket keeps them private)."""
        site = panel.site
        page = cls(
            closed=panel.closed,
            today=panel.today,
            now=panel.now,
            lead_hours=panel.lead_hours,
            company=GuestPanelCompany(
                title=site.title, logo_url=site.logo_url, accent_color=site.accent_color, whatsapp=site.whatsapp
            )
            if site
            else None,
        )
        b = panel.booking
        page.guest_name = panel.guest_name
        page.booking = GuestPanelBooking(
            status=b.status.value,
            rental_mode=b.rental_mode.value,
            check_in=b.check_in,
            check_out=b.check_out,
            adults=b.adults_count,
            total=float(b.total_price),
            paid=float(panel.paid),
            orders_due=float(panel.orders_due),
            remaining=float(panel.remaining),
            free_until=panel.free_until,
        )
        if (d := panel.deposit) is not None:
            page.deposit = GuestPanelDeposit(amount=float(d.amount), status=d.status.value, held=float(d.held_amount))
        if (p := panel.flat) is not None and panel.closed:
            # Its name for the messages and its page to book again; the address and the rules are for a live stay.
            page.flat = GuestPanelFlat(name=p.name, code=p.public_code)
        elif p is not None:
            page.flat = GuestPanelFlat(
                name=p.name,
                code=p.public_code,
                photo_url=panel.photo_url,
                address=p.address_full,
                latitude=p.latitude,
                longitude=p.longitude,
                map_url=p.map_url,
                complex_name=p.complex_name,
                floor=p.floor,
                check_in_hour=p.check_in_hour,
                check_out_hour=p.check_out_hour,
                house_rules=p.house_rules,
                check_out_instructions=p.check_out_instructions,
            )
        if panel.menu is not None:
            page.menu = [
                GuestPanelProduct(
                    id=p.id, name=p.name, category=p.category, description=p.description, photo_url=p.photo_url,
                    price=float(p.price), max_quantity=min(p.stock, 20),
                )
                for p in panel.menu
            ]
        if (m := panel.minibar) is not None:
            page.minibar = GuestPanelMinibar(
                billings=[b.value for b in m.billings], opens=m.opens, closes=m.closes, open_now=m.open_now
            )
        page.orders = [
            GuestPanelOrder(
                number=o.number,
                status=o.status.value,
                billing=o.billing.value,
                payment_status=o.payment_status.value if o.payment_status else None,
                invoiced=o.invoiced_at is not None,
                total=float(o.total),
                lines=[f"{i.name} × {i.quantity}" if i.quantity > 1 else i.name for i in o.items],
            )
            for o in panel.orders
        ]
        if (a := panel.access) is not None:
            page.access = GuestPanelAccess(
                instructions=a.instructions,
                wifi_name=a.wifi_name,
                wifi_password=a.wifi_password,
                facts=a.facts,
                photos=[GuestPanelPhoto(url=sign(url), caption=caption) for url, caption in a.photos],
                entrance=a.entrance,
                block=a.block,
                apartment_number=a.apartment_number,
            )
        return page
