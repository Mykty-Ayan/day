"""What WhatsApp, Telegram and Instagram show for a guest link pasted in a chat.

Their robots read the page's Open Graph tags and run no script, so the app shell
shows them nothing. The web server sends those robots here (see nginx.conf); a
person opening the same link gets the app as before. A personal link's preview
tells the dates and the flats' photo, never the guest's name or phone.
"""

from __future__ import annotations

import html
from datetime import date, timedelta
from urllib.parse import urlsplit, urlunsplit

from fastapi import APIRouter, Depends
from fastapi.responses import HTMLResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.booking.guest_offers import OfferExpiredError
from app.application.property.public_stay import GetPublicStayService
from app.config import settings
from app.domain.booking.value_objects import RentalMode
from app.infrastructure.database import get_session
from app.infrastructure.repositories.booking import SqlBookingRepository
from app.infrastructure.repositories.property import (
    SqlAmenityRepository,
    SqlDayPriceRepository,
    SqlPricingConfigRepository,
    SqlPropertyPhotoRepository,
    SqlPropertyRepository,
    SqlSeasonalPriceRepository,
)
from app.presentation.api.v1.offers import offers_service

preview_router = APIRouter(prefix="/public/preview", tags=["public"])

_MONTHS = ("января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября",
           "ноября", "декабря")


def preview_image(url: str | None) -> str | None:
    """A photo small enough for a chat preview. Airbnb's CDN resizes on request: its
    originals weigh some 600 KB, past what WhatsApp shows; 720 px wide is about 50 KB."""
    if not url:
        return None
    parts = urlsplit(url)
    if parts.netloc.endswith("muscache.com"):
        return urlunsplit((parts.scheme, parts.netloc, parts.path, "im_w=720", ""))
    return url


def tenge(amount) -> str:
    return f"{int(amount):,}".replace(",", " ") + " ₸"


def render(title: str, description: str, image: str | None, url: str) -> str:
    e = html.escape
    tags = [
        f'<meta property="og:title" content="{e(title)}">',
        f'<meta property="og:description" content="{e(description)}">',
        f'<meta property="og:url" content="{e(url)}">',
        '<meta property="og:type" content="website">',
        '<meta property="og:locale" content="ru_RU">',
        f'<meta name="description" content="{e(description)}">',
    ]
    if image:
        tags += [
            f'<meta property="og:image" content="{e(image)}">',
            '<meta name="twitter:card" content="summary_large_image">',
        ]
    return (
        '<!doctype html><html lang="ru"><head><meta charset="utf-8">'
        f"<title>{e(title)}</title>{''.join(tags)}</head>"
        f'<body><a href="{e(url)}">{e(title)}</a></body></html>'
    )


def _page(body: str, status: int = 200) -> HTMLResponse:
    # A robot caches what it saw; an hour keeps a changed price from lingering for days.
    # One address answers a robot with this and a person with the app: a cache must tell them apart.
    return HTMLResponse(
        body, status_code=status, headers={"Cache-Control": "public, max-age=3600", "Vary": "User-Agent"}
    )


def _link(kind: str, code: str) -> str:
    return f"{settings.PUBLIC_APP_URL.rstrip('/')}/{kind}/{code}"


_NOT_FOUND = render("Day", "Ссылка не найдена или больше не действует.", None, settings.PUBLIC_APP_URL)


@preview_router.get("/s/{code}", response_class=HTMLResponse, include_in_schema=False)
async def flat_preview(code: str, session: AsyncSession = Depends(get_session)):
    """A flat's page: its name, rooms and guests, its price, its cover photo."""
    service = GetPublicStayService(
        SqlPropertyRepository(session),
        SqlPropertyPhotoRepository(session),
        SqlAmenityRepository(session),
        SqlPricingConfigRepository(session),
        SqlSeasonalPriceRepository(session),
        SqlDayPriceRepository(session),
        SqlBookingRepository(session),
    )
    today = date.today()
    try:
        stay = await service.execute(code, today, today + timedelta(days=1))
    except ValueError:
        return _page(_NOT_FOUND, 404)
    p, pricing = stay.property, stay.pricing
    facts = []
    if p.rooms:
        facts.append(f"{p.rooms}-комн.")
    if p.max_guests:
        facts.append(f"до {p.max_guests} гостей")
    if pricing and stay.by_night and pricing.base_price > 0:
        facts.append(f"{tenge(pricing.base_price)} за ночь")
    if pricing and stay.by_hour and pricing.hourly_price > 0:
        facts.append(f"{tenge(pricing.hourly_price)} за час")
    title = f"{p.name} · {p.complex_name}" if p.complex_name else p.name
    description = " · ".join(facts) or "Свободные даты и цена — на странице"
    return _page(render(title, description, preview_image(stay.photos[0] if stay.photos else None), _link("s", code)))


@preview_router.get("/o/{code}", response_class=HTMLResponse, include_in_schema=False)
async def offer_preview(code: str, session: AsyncSession = Depends(get_session)):
    """A personal link: the dates and how many flats, the first flat's photo. Nothing
    of the guest: a forwarded link shows no more than the page does."""
    try:
        public = await offers_service(session).public(code)
    except OfferExpiredError:
        return _page(render("Day", "Срок этой ссылки истёк.", None, _link("o", code)), 410)
    except ValueError:
        return _page(_NOT_FOUND, 404)
    o = public.offer
    if o.rental_mode == RentalMode.HOURLY and o.starts_at and o.ends_at:
        when = f"{o.starts_at.day} {_MONTHS[o.starts_at.month - 1]}, {o.starts_at:%H:%M}–{o.ends_at:%H:%M}"
    else:
        when = f"{o.check_in.day} {_MONTHS[o.check_in.month - 1]} – {o.check_out.day} {_MONTHS[o.check_out.month - 1]}"
    count = len(public.flats)
    title = "Квартира на ваши даты" if count == 1 else "Квартиры на ваши даты"
    description = f"{when} · гостей: {o.guests} · " + (f"вариантов: {count}" if count else "свободных вариантов нет")
    photo = next((f.photo for f in public.flats if f.photo), None)
    return _page(render(title, description, preview_image(photo), _link("o", code)))
