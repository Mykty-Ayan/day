"""The host's Telegram notice about a booking, shared by the API and the hold sweep."""

from __future__ import annotations

import uuid
from datetime import timezone
from zoneinfo import ZoneInfo

from sqlalchemy.ext.asyncio import AsyncSession

from app.application.booking.guest_hold import OfferBooking
from app.domain.booking.entities import Booking
from app.domain.booking.repositories import GuestRepository
from app.domain.messaging.value_objects import NotificationEvent
from app.domain.property.repositories import PropertyRepository
from app.domain.settings.entities import DEFAULT_TIME_ZONE
from app.domain.settings.repositories import CompanySettingsRepository
from app.infrastructure.messaging.factory import build_notification_service


async def notify_booking(
    session: AsyncSession,
    company_id: uuid.UUID,
    event: NotificationEvent,
    booking: Booking,
    property_repo: PropertyRepository,
    guest_repo: GuestRepository,
) -> None:
    """Queue a host notification in the same transaction as the change itself.

    A company with no bot connected queues nothing, so this is a no-op until
    someone links a chat.
    """
    prop = await property_repo.get_by_id(booking.property_id)
    guest = await guest_repo.get_by_id(booking.guest_id) if booking.guest_id else None
    await build_notification_service(session).notify_company(
        company_id,
        event,
        {
            "property_name": prop.name if prop else "—",
            "guest_name": guest.name if guest else "—",
            "check_in": booking.check_in.strftime("%d.%m.%Y %H:%M"),
            "check_out": booking.check_out.strftime("%d.%m.%Y %H:%M"),
            "total_price": str(booking.total_price) if booking.total_price is not None else None,
            "source": booking.source.value,
            "booking_id": str(booking.id),
        },
    )


async def notify_guest_hold(
    session: AsyncSession,
    held: OfferBooking,
    property_repo: PropertyRepository,
    settings_repo: CompanySettingsRepository,
) -> None:
    """Ask the host to send the Kaspi invoice, queued with the hold itself. The
    host reads the deadline on the company's clock, as the guest does on theirs."""
    booking = held.booking
    prop = await property_repo.get_by_id(booking.property_id)
    company = await settings_repo.get_by_company(booking.company_id)
    zone = ZoneInfo(company.time_zone if company and company.time_zone else DEFAULT_TIME_ZONE)
    until = booking.expires_at.replace(tzinfo=timezone.utc).astimezone(zone) if booking.expires_at else None
    await build_notification_service(session).notify_company(
        booking.company_id,
        NotificationEvent.GUEST_HOLD,
        {
            "property_name": prop.name if prop else "—",
            # Who booked, not the older guest record the phone found.
            "guest_name": held.name or "—",
            "phone": held.phone,
            "check_in": booking.check_in.strftime("%d.%m.%Y %H:%M"),
            "check_out": booking.check_out.strftime("%d.%m.%Y %H:%M"),
            "guests": booking.adults_count,
            "deposit": str(held.deposit) if held.deposit is not None else None,
            "total_price": str(booking.total_price) if booking.total_price else None,
            "until": until.strftime("%H:%M") if until else "—",
            "booking_id": str(booking.id),
        },
    )
