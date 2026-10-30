"""The cleaner's Telegram notice about a cleaning given to them."""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.cleaning.entities import CleaningTask
from app.domain.messaging.value_objects import NotificationEvent
from app.domain.property.repositories import PropertyRepository
from app.infrastructure.messaging.factory import build_notification_service


async def notify_cleaner(session: AsyncSession, task: CleaningTask, property_repo: PropertyRepository) -> None:
    """Queue the notice in the same transaction as the assignment.

    A task with nobody on it, or a cleaner who has not linked Telegram, queues nothing.
    """
    if task.cleaner_id is None:
        return
    prop = await property_repo.get_by_id(task.property_id)
    await build_notification_service(session).notify_user(
        task.company_id,
        task.cleaner_id,
        NotificationEvent.CLEANING_ASSIGNED,
        {
            "property_name": prop.name if prop else "—",
            "date": task.scheduled_date.strftime("%d.%m.%Y") if task.scheduled_date else None,
            "time": task.scheduled_time.strftime("%H:%M") if task.scheduled_time else None,
            "type": task.type.value,
            "notes": task.notes,
            "task_id": str(task.id),
        },
    )
