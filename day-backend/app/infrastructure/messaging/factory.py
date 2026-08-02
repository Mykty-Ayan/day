"""Wiring for the messaging use cases.

The webhooks and the background dispatcher need the same object graph; building
it in one place keeps that from drifting apart.
"""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.application.booking.check_availability import CheckAvailabilityService
from app.application.booking.create_booking import CreateBookingService
from app.application.booking.price_calculator import PriceCalculatorService
from app.application.messaging.guest_bot import GuestBotService
from app.application.messaging.host_bot import HostBotService
from app.application.messaging.link_channel import LinkChannelService
from app.application.messaging.notifications import NotificationDispatcher, NotificationService
from app.domain.messaging.services import MessageProvider
from app.domain.messaging.value_objects import Channel
from app.infrastructure.messaging.providers import TelegramProvider, WhapiProvider
from app.infrastructure.repositories.booking import (
    SqlBookingAuditLogRepository,
    SqlBookingRepository,
    SqlGuestRepository,
)
from app.infrastructure.repositories.messaging import (
    SqlChannelIdentityRepository,
    SqlChannelLinkCodeRepository,
    SqlOutboundNotificationRepository,
)
from app.infrastructure.repositories.property import (
    SqlDiscountRuleRepository,
    SqlPricingConfigRepository,
    SqlPropertyRepository,
    SqlSeasonalPriceRepository,
)

# Providers are stateless HTTP clients, so one instance each is enough.
_PROVIDERS: dict[Channel, MessageProvider] = {
    Channel.TELEGRAM: TelegramProvider(),
    Channel.WHATSAPP: WhapiProvider(),
}


def get_provider(channel: Channel) -> MessageProvider:
    return _PROVIDERS[channel]


def get_providers() -> dict[Channel, MessageProvider]:
    return _PROVIDERS


def build_price_calculator(session: AsyncSession) -> PriceCalculatorService:
    return PriceCalculatorService(
        SqlPricingConfigRepository(session),
        SqlSeasonalPriceRepository(session),
        SqlDiscountRuleRepository(session),
    )


def build_availability(session: AsyncSession) -> CheckAvailabilityService:
    return CheckAvailabilityService(
        SqlPropertyRepository(session),
        SqlBookingRepository(session),
        build_price_calculator(session),
    )


def build_link_service(session: AsyncSession) -> LinkChannelService:
    return LinkChannelService(
        SqlChannelLinkCodeRepository(session),
        SqlChannelIdentityRepository(session),
    )


def build_host_bot(session: AsyncSession) -> HostBotService:
    return HostBotService(
        build_link_service(session),
        build_availability(session),
        SqlBookingRepository(session),
        SqlPropertyRepository(session),
        SqlGuestRepository(session),
    )


def build_guest_bot(session: AsyncSession) -> GuestBotService:
    create_booking = CreateBookingService(
        SqlBookingRepository(session),
        SqlGuestRepository(session),
        SqlPropertyRepository(session),
        SqlBookingAuditLogRepository(session),
        build_price_calculator(session),
    )
    return GuestBotService(build_availability(session), create_booking)


def build_notification_service(session: AsyncSession) -> NotificationService:
    return NotificationService(
        SqlOutboundNotificationRepository(session),
        SqlChannelIdentityRepository(session),
    )


def build_dispatcher(session: AsyncSession) -> NotificationDispatcher:
    return NotificationDispatcher(SqlOutboundNotificationRepository(session), _PROVIDERS)
