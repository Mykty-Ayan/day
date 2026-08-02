"""Background drain of the notification outbox.

Runs inside the API process on a timer. Each pass opens its own session and
commits, so a failure in one pass cannot poison the next; `claim_due` takes row
locks with `SKIP LOCKED`, so running several API instances is safe.
"""

from __future__ import annotations

import asyncio
import logging

from app.infrastructure.database import async_session
from app.infrastructure.messaging.factory import build_dispatcher

logger = logging.getLogger(__name__)

POLL_INTERVAL_SECONDS = 10


async def _run_once() -> int:
    async with async_session() as session:
        dispatcher = build_dispatcher(session)
        sent = await dispatcher.dispatch_due()
        await session.commit()
        return sent


async def notification_worker(stop: asyncio.Event) -> None:
    logger.info("Notification dispatcher started")
    while not stop.is_set():
        try:
            sent = await _run_once()
            if sent:
                logger.info("Dispatched %d notification(s)", sent)
        except asyncio.CancelledError:
            raise
        except Exception:
            # The queue is durable; losing a pass costs a few seconds of delay.
            logger.exception("Notification dispatch pass failed")

        try:
            await asyncio.wait_for(stop.wait(), timeout=POLL_INTERVAL_SECONDS)
        except asyncio.TimeoutError:
            continue

    logger.info("Notification dispatcher stopped")
