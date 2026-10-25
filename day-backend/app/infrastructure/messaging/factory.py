"""Wiring for the messaging use cases.

The webhooks and the background dispatcher need the same object graph; building
it in one place keeps that from drifting apart.
"""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.application.assistant.ask import AskAssistantService
from app.application.booking.check_availability import CheckAvailabilityService
from app.application.booking.create_booking import CreateBookingService
from app.application.booking.price_calculator import PriceCalculatorService
from app.application.messaging.guest_bot import GuestBotService
from app.application.messaging.host_bot import HostBotService
from app.application.messaging.link_channel import LinkChannelService
from app.application.messaging.notifications import NotificationDispatcher, NotificationService
from app.config import settings
from app.domain.auth.permissions import Permission, permissions_for_role
from app.domain.messaging.services import MessageProvider
from app.domain.messaging.value_objects import Channel
from app.infrastructure.assistant.factory import build_assistant_tools
from app.infrastructure.assistant.openrouter import OpenRouterAssistantGateway
from app.infrastructure.messaging.providers import TelegramProvider, WhapiProvider
from app.infrastructure.repositories.auth import SqlCompanyRepository, SqlUserRepository
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
    SqlDayPriceRepository,
    SqlDiscountRuleRepository,
    SqlPricingConfigRepository,
    SqlPropertyRepository,
    SqlSeasonalPriceRepository,
)
from app.infrastructure.repositories.settings import SqlCompanySettingsRepository

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
        SqlDayPriceRepository(session),
    )


def build_availability(session: AsyncSession) -> CheckAvailabilityService:
    return CheckAvailabilityService(
        SqlPropertyRepository(session),
        SqlBookingRepository(session),
        build_price_calculator(session),
        SqlCompanySettingsRepository(session),
    )


def build_link_service(session: AsyncSession) -> LinkChannelService:
    return LinkChannelService(
        SqlChannelLinkCodeRepository(session),
        SqlChannelIdentityRepository(session),
        SqlUserRepository(session),
    )


def build_host_bot(session: AsyncSession) -> HostBotService:
    async def assistant_for(identity):
        # No key, no assistant: the bot keeps answering commands and says it did
        # not understand anything else, exactly as before.
        if not settings.ASSISTANT_API_KEY:
            return None
        user = await SqlUserRepository(session).get_by_id(identity.user_id) if identity.user_id else None
        sees_secrets = (
            user is not None
            and user.is_active
            and Permission.PROPERTY_SECRETS_READ in permissions_for_role(user.role)
        )
        return AskAssistantService(
            OpenRouterAssistantGateway(),
            build_assistant_tools(session, identity.company_id, sees_secrets=sees_secrets),
        )

    return HostBotService(
        build_link_service(session),
        assistant_for=assistant_for,
        company_repo=SqlCompanyRepository(session),
        user_repo=SqlUserRepository(session),
        mini_app_url=f"{settings.PUBLIC_APP_URL.rstrip('/')}/tma",
    )


def build_guest_bot(session: AsyncSession) -> GuestBotService:
    create_booking = CreateBookingService(
        SqlBookingRepository(session),
        SqlGuestRepository(session),
        SqlPropertyRepository(session),
        SqlBookingAuditLogRepository(session),
        build_price_calculator(session),
        SqlCompanySettingsRepository(session),
    )
    return GuestBotService(build_availability(session), create_booking)


def build_notification_service(session: AsyncSession) -> NotificationService:
    return NotificationService(
        SqlOutboundNotificationRepository(session),
        SqlChannelIdentityRepository(session),
        SqlUserRepository(session),
    )


def build_dispatcher(session: AsyncSession) -> NotificationDispatcher:
    return NotificationDispatcher(
        SqlOutboundNotificationRepository(session),
        _PROVIDERS,
        mini_app_url=f"{settings.PUBLIC_APP_URL.rstrip('/')}/tma",
        identity_repo=SqlChannelIdentityRepository(session),
        user_repo=SqlUserRepository(session),
    )
