"""Pages for guests, opened by a link with no sign-in (no company in the request:
the code in the link is the key, and it names one flat of one company)."""

from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.booking.create_booking import CreateBookingService
from app.application.booking.guest_checkout import GuestCheckoutService, NotStayingError
from app.application.booking.guest_hold import GuestHoldService, OfferTakenError
from app.application.booking.guest_offers import OfferExpiredError
from app.application.booking.guest_panel import GuestPanelService
from app.application.booking.price_calculator import PriceCalculatorService
from app.application.inventory.guest_orders import (
    GuestOrderService,
    MinibarClosedError,
    OutOfStockError,
    TooManyOrdersError,
)
from app.application.property.public_stay import GetPublicStayService
from app.domain.booking.exceptions import BookingOverlapError, PropertyBlockedError, StayRulesError
from app.domain.booking.value_objects import RentalMode
from app.domain.messaging.value_objects import NotificationEvent
from app.infrastructure.database import get_session
from app.infrastructure.messaging.booking_notice import notify_guest_hold
from app.infrastructure.messaging.factory import build_notification_service
from app.infrastructure.repositories.booking import (
    SqlBookingAuditLogRepository,
    SqlBookingDepositRepository,
    SqlBookingPaymentRepository,
    SqlBookingRepository,
    SqlGuestOfferRepository,
    SqlGuestRepository,
)
from app.infrastructure.repositories.cleaning import SqlCleaningTaskRepository
from app.infrastructure.repositories.inventory import (
    SqlGuestOrderRepository,
    SqlProductRepository,
    SqlStockMovementRepository,
)
from app.infrastructure.repositories.leads import SqlBlacklistRepository
from app.infrastructure.repositories.property import (
    SqlAmenityRepository,
    SqlDayPriceRepository,
    SqlDiscountRuleRepository,
    SqlPricingConfigRepository,
    SqlPropertyFactRepository,
    SqlPropertyPhotoRepository,
    SqlPropertyRepository,
    SqlSeasonalPriceRepository,
)
from app.infrastructure.repositories.settings import SqlCompanySettingsRepository
from app.infrastructure.repositories.site import SqlCompanySiteRepository
from app.presentation.api.v1.offers import offers_service
from app.presentation.schemas.guest_orders import GuestOrderCreate, GuestOrderPlaced
from app.presentation.schemas.guest_panel import GuestPanelResponse
from app.presentation.schemas.public import (
    PublicOfferBook,
    PublicOfferBooking,
    PublicOfferResponse,
    PublicStayBook,
    PublicStayCompany,
    PublicStayResponse,
)

public_router = APIRouter(prefix="/public", tags=["public"])

# Two months on screen and a bit; more is a crawl, not a guest.
_MAX_NIGHTS = 120
_DEFAULT_NIGHTS = 62
# From yesterday (the server's day may lag the company's), two years ahead at most:
# the flat's past is its bookings, not a guest's business.
_HORIZON_DAYS = 730


@public_router.get("/stays/{code}", response_model=PublicStayResponse)
async def public_stay(
    code: str,
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    session: AsyncSession = Depends(get_session),
):
    """A flat's page for guests: the flat, its prices and its nights in [date_from, date_to)."""
    today = date.today()
    start = date_from or today
    if not today - timedelta(days=1) <= start <= today + timedelta(days=_HORIZON_DAYS):
        raise HTTPException(status_code=422, detail="date_from must be from today, within two years")
    end = date_to or start + timedelta(days=_DEFAULT_NIGHTS)
    if not 0 < (end - start).days <= _MAX_NIGHTS:
        raise HTTPException(status_code=422, detail=f"date_to must be after date_from, at most {_MAX_NIGHTS} nights")
    service = GetPublicStayService(
        SqlPropertyRepository(session),
        SqlPropertyPhotoRepository(session),
        SqlAmenityRepository(session),
        SqlPricingConfigRepository(session),
        SqlSeasonalPriceRepository(session),
        SqlDayPriceRepository(session),
        SqlBookingRepository(session),
    )
    try:
        stay = await service.execute(code, start, end)
    except ValueError:
        # The same answer for a wrong code and a flat not on sale: the code is the key.
        raise HTTPException(status_code=404, detail="Not found")
    page = PublicStayResponse.from_stay(stay)
    site = await SqlCompanySiteRepository(session).get(stay.property.company_id)
    if site is not None:
        page.company = PublicStayCompany(
            slug=site.slug, title=site.title, logo_url=site.logo_url, accent_color=site.accent_color,
            whatsapp=site.whatsapp,
        )
    return page


@public_router.get("/offers/{code}", response_model=PublicOfferResponse)
async def public_offer(code: str, session: AsyncSession = Depends(get_session)):
    """A guest's personal link: the flats for the guest's dates, each with the stay's
    price and whether it is still free. 410 once the check-in day has passed."""
    try:
        offer = await offers_service(session).public(code)
    except OfferExpiredError:
        raise HTTPException(status_code=410, detail="Expired")
    except ValueError:
        raise HTTPException(status_code=404, detail="Not found")
    return PublicOfferResponse.from_offer(offer, await _holds(session).current(offer.offer))


def _holds(session: AsyncSession) -> GuestHoldService:
    bookings, guests = SqlBookingRepository(session), SqlGuestRepository(session)
    properties, pricing = SqlPropertyRepository(session), SqlPricingConfigRepository(session)
    prices = PriceCalculatorService(
        pricing,
        SqlSeasonalPriceRepository(session),
        SqlDiscountRuleRepository(session),
        SqlDayPriceRepository(session),
    )
    audit, settings_repo = SqlBookingAuditLogRepository(session), SqlCompanySettingsRepository(session)
    return GuestHoldService(
        SqlGuestOfferRepository(session),
        properties,
        bookings,
        guests,
        pricing,
        SqlBookingDepositRepository(session),
        CreateBookingService(bookings, guests, properties, audit, prices, settings_repo),
        settings_repo,
        sites=SqlCompanySiteRepository(session),
        blacklist=SqlBlacklistRepository(session),
    )


@public_router.post("/offers/{code}/book", response_model=PublicOfferBooking, status_code=201)
async def book_from_offer(code: str, body: PublicOfferBook, session: AsyncSession = Depends(get_session)):
    """The guest books one flat of the link: the dates are held for 30 minutes and
    the host is asked to send a Kaspi invoice for the deposit. 409 while the link
    has a booking that holds its dates, or when the flat was taken meanwhile."""
    try:
        held = await _holds(session).book(code, flat=body.flat, guests=body.guests, name=body.name, phone=body.phone)
        await notify_guest_hold(
            session,
            held,
            SqlPropertyRepository(session),
            SqlCompanySettingsRepository(session),
        )
    except OfferExpiredError:
        await session.rollback()
        raise HTTPException(status_code=410, detail="Expired")
    except OfferTakenError as e:
        await session.rollback()
        raise HTTPException(status_code=409, detail=str(e))
    except (BookingOverlapError, PropertyBlockedError):
        await session.rollback()
        raise HTTPException(status_code=409, detail="The flat is taken for these dates")
    except StayRulesError as e:
        await session.rollback()
        raise HTTPException(status_code=422, detail=str(e))
    except ValueError as e:
        await session.rollback()
        raise HTTPException(status_code=404 if str(e) == "Not found" else 422, detail=str(e))
    await session.commit()
    return PublicOfferBooking.from_hold(held)


@public_router.post("/stays/{code}/book", response_model=PublicOfferBooking, status_code=201)
async def book_from_stay(code: str, body: PublicStayBook, session: AsyncSession = Depends(get_session)):
    """The guest books the flat from its own page: the nights or hours are held for
    30 minutes and the host is asked for the Kaspi invoice. 409 when the dates were
    taken meanwhile or this phone holds a booking from a flat's page already."""
    try:
        held = await _holds(session).book_stay(
            code,
            rental_mode=RentalMode(body.rental_mode),
            check_in=body.check_in,
            check_out=body.check_out,
            starts_at=body.starts_at,
            ends_at=body.ends_at,
            guests=body.guests,
            name=body.name,
            phone=body.phone,
        )
        await notify_guest_hold(session, held, SqlPropertyRepository(session), SqlCompanySettingsRepository(session))
    except OfferTakenError as e:
        await session.rollback()
        raise HTTPException(status_code=409, detail=str(e))
    except (BookingOverlapError, PropertyBlockedError):
        await session.rollback()
        raise HTTPException(status_code=409, detail="The flat is taken for these dates")
    except StayRulesError as e:
        await session.rollback()
        raise HTTPException(status_code=422, detail=str(e))
    except ValueError as e:
        await session.rollback()
        raise HTTPException(status_code=404 if str(e) == "Not found" else 422, detail=str(e))
    await session.commit()
    return PublicOfferBooking.from_hold(held)


@public_router.get("/guest/{code}", response_model=GuestPanelResponse)
async def guest_panel(code: str, session: AsyncSession = Depends(get_session)):
    """A guest's own page for their booking. How to get in (instructions, Wi-Fi,
    the flat's guest facts) only for a confirmed or checked-in stay paid in full."""
    service = GuestPanelService(
        SqlBookingRepository(session),
        SqlBookingPaymentRepository(session),
        SqlGuestRepository(session),
        SqlPropertyRepository(session),
        SqlPropertyFactRepository(session),
        SqlCompanySiteRepository(session),
        SqlCompanySettingsRepository(session),
        SqlProductRepository(session),
        SqlGuestOrderRepository(session),
    )
    try:
        panel = await service.execute(code)
    except ValueError:
        raise HTTPException(status_code=404, detail="Not found")
    return GuestPanelResponse.from_panel(panel)


@public_router.post("/guest/{code}/checked-out")
async def guest_checked_out(code: str, session: AsyncSession = Depends(get_session)):
    """The guest says they left: the host is told in the bot, and the flat gets a
    cleaning task if none is open. The booking's status stays the host's to change."""
    service = GuestCheckoutService(
        SqlBookingRepository(session),
        SqlGuestRepository(session),
        SqlPropertyRepository(session),
        SqlCleaningTaskRepository(session),
        SqlCompanySettingsRepository(session),
    )
    try:
        left = await service.execute(code)
        await build_notification_service(session).notify_company(
            left.booking.company_id,
            NotificationEvent.GUEST_CHECKED_OUT,
            {
                "property_name": left.flat_name or "—",
                "guest_name": left.guest_name or "—",
                "cleaning_created": left.cleaning_created,
                "booking_id": str(left.booking.id),
            },
        )
    except LookupError:
        await session.rollback()
        raise HTTPException(status_code=404, detail="Not found")
    except NotStayingError as e:
        await session.rollback()
        raise HTTPException(status_code=409, detail=str(e))
    await session.commit()
    return {"cleaning_created": left.cleaning_created}


def guest_orders(session: AsyncSession) -> GuestOrderService:
    return GuestOrderService(
        SqlGuestOrderRepository(session),
        SqlProductRepository(session),
        SqlStockMovementRepository(session),
        SqlBookingRepository(session),
        SqlPropertyRepository(session),
        SqlCompanySiteRepository(session),
        SqlCompanySettingsRepository(session),
    )


@public_router.post("/guest/{code}/orders", response_model=GuestOrderPlaced, status_code=201)
async def place_guest_order(code: str, body: GuestOrderCreate, session: AsyncSession = Depends(get_session)):
    """A minibar order from the guest's page, during the stay. The host is told in
    the bot; the answer holds the WhatsApp link with the order's text."""
    try:
        placed = await guest_orders(session).place(
            code, [(line.product_id, line.quantity) for line in body.items], body.note, body.language
        )
        order = placed.order
        if not placed.repeated:
            await build_notification_service(session).notify_company(
                order.company_id,
                NotificationEvent.GUEST_ORDER,
                {
                    "number": order.number,
                    "property_name": placed.flat_name or "—",
                    "lines": [f"{i.name} × {i.quantity}" for i in order.items],
                    "total": str(order.total),
                    "note": order.guest_note,
                    "order_id": str(order.id),
                },
            )
    except LookupError:
        await session.rollback()
        raise HTTPException(status_code=404, detail="Not found")
    except (MinibarClosedError, OutOfStockError) as e:
        await session.rollback()
        raise HTTPException(status_code=409, detail=str(e))
    except TooManyOrdersError as e:
        await session.rollback()
        raise HTTPException(status_code=429, detail=str(e))
    except ValueError as e:
        await session.rollback()
        raise HTTPException(status_code=422, detail=str(e))
    await session.commit()
    return GuestOrderPlaced(number=order.number, total=float(order.total), whatsapp_url=placed.whatsapp_url)
