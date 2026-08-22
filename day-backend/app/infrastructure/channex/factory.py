"""Object-graph builders for the Channex context.

Route handlers and the webhook share the same wiring; the gateway is a
module-level singleton because it is stateless (a client per request inside).
"""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.application.channex.onboard_listing import OnboardListingService
from app.application.channex.process_booking_event import ProcessBookingEventService
from app.application.channex.push_ari import PushAriService
from app.infrastructure.channex.client import HttpChannexGateway
from app.infrastructure.repositories.booking import (
    SqlBookingRepository,
    SqlGuestRepository,
)
from app.infrastructure.repositories.channex import (
    SqlChannexBookingEventRepository,
    SqlChannexConnectionRepository,
    SqlChannexListingRepository,
)
from app.infrastructure.repositories.property import (
    SqlPricingConfigRepository,
    SqlPropertyRepository,
)

_GATEWAY: HttpChannexGateway | None = None


def get_gateway() -> HttpChannexGateway:
    global _GATEWAY
    if _GATEWAY is None:
        _GATEWAY = HttpChannexGateway()
    return _GATEWAY


def build_onboard_service(session: AsyncSession) -> OnboardListingService:
    return OnboardListingService(
        connection_repo=SqlChannexConnectionRepository(session),
        listing_repo=SqlChannexListingRepository(session),
        property_repo=SqlPropertyRepository(session),
        gateway=get_gateway(),
    )


def build_push_ari_service(session: AsyncSession) -> PushAriService:
    return PushAriService(
        listing_repo=SqlChannexListingRepository(session),
        booking_repo=SqlBookingRepository(session),
        pricing_repo=SqlPricingConfigRepository(session),
        gateway=get_gateway(),
    )


def build_booking_event_service(session: AsyncSession) -> ProcessBookingEventService:
    return ProcessBookingEventService(
        listing_repo=SqlChannexListingRepository(session),
        event_repo=SqlChannexBookingEventRepository(session),
        booking_repo=SqlBookingRepository(session),
        guest_repo=SqlGuestRepository(session),
        gateway=get_gateway(),
    )
