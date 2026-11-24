"""What a guest's own page shows. Every field is named here on purpose: a new field
on the booking or the flat stays private until it is added to this list."""

from __future__ import annotations

import uuid
from collections.abc import Callable
from datetime import date, datetime, time

from pydantic import BaseModel

from app.application.booking.guest_panel import GuestPanel
from app.domain.property.value_objects import MediaKind
from app.presentation.schemas.property import NearbyPlace


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


class GuestPanelLateCheckOut(BaseModel):
    # Until this hour on the day of check-out; the price the flat asks, or None when free.
    until_hour: int
    price: float | None = None


class GuestPanelDeduction(BaseModel):
    # What was kept and why, as the owner wrote it for the guest, with the photos of it.
    amount: float
    reason: str
    photos: list[str] = []


class GuestPanelDeposit(BaseModel):
    amount: float
    # pending, paid, returned, held, partially_held. Never the owner's own note.
    status: str
    held: float = 0
    deductions: list[GuestPanelDeduction] = []


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
    nearby: list[NearbyPlace] = []


class GuestPanelPhoto(BaseModel):
    url: str
    caption: str | None = None
    kind: MediaKind = MediaKind.PHOTO


class GuestPanelAccess(BaseModel):
    instructions: str | None = None
    wifi_name: str | None = None
    wifi_password: str | None = None
    facts: list[str] = []
    # The path to the door, step by step: the flat's check-in photos and videos with the owner's words.
    photos: list[GuestPanelPhoto] = []
    # Beside the door code: how the lock opens.
    door: list[GuestPanelPhoto] = []
    # How to use the things in the flat, a video or a photo each.
    howto: list[GuestPanelPhoto] = []
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
    # A later check-out the guest may ask for in WhatsApp; None when the day is someone else's.
    late_check_out: GuestPanelLateCheckOut | None = None
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
        if panel.late_check_out is not None:
            hour, price = panel.late_check_out
            page.late_check_out = GuestPanelLateCheckOut(
                until_hour=hour, price=float(price) if price is not None else None
            )
        if (d := panel.deposit) is not None:
            page.deposit = GuestPanelDeposit(
                amount=float(d.amount),
                status=d.status.value,
                held=float(d.held_amount),
                deductions=[
                    GuestPanelDeduction(
                        amount=float(line["amount"]), reason=line["reason"], photos=[sign(u) for u in line["photos"]]
                    )
                    for line in d.deductions
                ],
            )
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
                nearby=p.nearby,
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

            def media(items) -> list[GuestPanelPhoto]:
                return [GuestPanelPhoto(url=sign(m.url), caption=m.caption, kind=m.kind) for m in items]

            page.access = GuestPanelAccess(
                instructions=a.instructions,
                wifi_name=a.wifi_name,
                wifi_password=a.wifi_password,
                facts=a.facts,
                photos=media(a.photos),
                door=media(a.door),
                howto=media(a.howto),
                entrance=a.entrance,
                block=a.block,
                apartment_number=a.apartment_number,
            )
        return page
