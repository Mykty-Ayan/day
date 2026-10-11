"""Background sweep that cancels holds nobody confirmed in time.

Runs inside the API process on a timer, like the notification dispatcher.
Each pass opens its own session and commits; holds are taken with
SKIP LOCKED, so several API instances can sweep at once.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.application.booking.expire_holds import ExpireHoldsService
from app.domain.messaging.value_objects import NotificationEvent
from app.infrastructure.database import async_session
from app.infrastructure.messaging.booking_notice import notify_booking
from app.infrastructure.repositories.booking import (
    SqlBookingAuditLogRepository,
    SqlBookingRepository,
    SqlGuestRepository,
)
from app.infrastructure.repositories.property import SqlPropertyRepository

logger = logging.getLogger(__name__)

POLL_INTERVAL_SECONDS = 60


async def run_once(maker: async_sessionmaker[AsyncSession] = async_session) -> int:
    async with maker() as session:
        cancelled = await ExpireHoldsService(
            SqlBookingRepository(session), SqlBookingAuditLogRepository(session)
        ).execute(datetime.utcnow())
        properties, guests = SqlPropertyRepository(session), SqlGuestRepository(session)
        for booking in cancelled:
            await notify_booking(
                session, booking.company_id, NotificationEvent.BOOKING_CANCELLED, booking, properties, guests
            )
        await session.commit()
        return len(cancelled)


async def hold_worker(stop: asyncio.Event) -> None:
    logger.info("Hold expiry sweep started")
    while not stop.is_set():
        try:
            cancelled = await run_once()
            if cancelled:
                logger.info("Cancelled %d expired hold(s)", cancelled)
        except asyncio.CancelledError:
            raise
        except Exception:
            # The holds stay pending; the next pass picks them up.
            logger.exception("Hold expiry pass failed")

        try:
            await asyncio.wait_for(stop.wait(), timeout=POLL_INTERVAL_SECONDS)
        except asyncio.TimeoutError:
            continue

    logger.info("Hold expiry sweep stopped")
