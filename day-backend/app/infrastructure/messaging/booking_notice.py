"""The host's Telegram notice about a booking, shared by the API and the hold sweep."""

from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.booking.entities import Booking
from app.domain.booking.repositories import GuestRepository
from app.domain.messaging.value_objects import NotificationEvent
from app.domain.property.repositories import PropertyRepository
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
