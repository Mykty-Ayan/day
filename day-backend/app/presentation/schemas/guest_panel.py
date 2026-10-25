"""What a guest's own page shows. Every field is named here on purpose: a new field
on the booking or the flat stays private until it is added to this list."""

from __future__ import annotations

from datetime import date, datetime

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
    remaining: float


class GuestPanelFlat(BaseModel):
    name: str
    address: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    map_url: str | None = None
    check_in_hour: int | None = None
    check_out_hour: int | None = None
    house_rules: str | None = None
    check_out_instructions: str | None = None


class GuestPanelAccess(BaseModel):
    instructions: str | None = None
    wifi_name: str | None = None
    wifi_password: str | None = None
    facts: list[str] = []


class GuestPanelResponse(BaseModel):
    closed: bool
    today: date
    company: GuestPanelCompany | None = None
    guest_name: str | None = None
    booking: GuestPanelBooking | None = None
    flat: GuestPanelFlat | None = None
    # Only for a confirmed or checked-in stay paid in full, from lead_hours before
    # check-in until check-out.
    access: GuestPanelAccess | None = None
    lead_hours: int = 24

    @classmethod
    def from_panel(cls, panel: GuestPanel) -> GuestPanelResponse:
        site = panel.site
        page = cls(
            closed=panel.closed,
            today=panel.today,
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
            remaining=float(panel.remaining),
        )
        if (p := panel.flat) is not None and panel.closed:
            # Its name for the messages; the address and the rules are for a live stay.
            page.flat = GuestPanelFlat(name=p.name)
        elif p is not None:
            page.flat = GuestPanelFlat(
                name=p.name,
                address=p.address_full,
                latitude=p.latitude,
                longitude=p.longitude,
                map_url=p.map_url,
                check_in_hour=p.check_in_hour,
                check_out_hour=p.check_out_hour,
                house_rules=p.house_rules,
                check_out_instructions=p.check_out_instructions,
            )
        if (a := panel.access) is not None:
            page.access = GuestPanelAccess(
                instructions=a.instructions, wifi_name=a.wifi_name, wifi_password=a.wifi_password, facts=a.facts
            )
        return page
