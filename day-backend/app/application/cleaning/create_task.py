from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date, time

from app.domain.booking.entities import Booking
from app.domain.cleaning.entities import CleaningTask
from app.domain.cleaning.repositories import CleaningTaskRepository
from app.domain.cleaning.value_objects import CleaningStatus, CleaningType
from app.domain.property.repositories import PropertyRepository

_OPEN = {CleaningStatus.PENDING, CleaningStatus.ASSIGNED, CleaningStatus.IN_PROGRESS}


@dataclass
class CreateCleaningTaskInput:
    company_id: uuid.UUID
    property_id: uuid.UUID
    type: CleaningType = CleaningType.POST_CHECKOUT
    booking_id: uuid.UUID | None = None
    cleaner_id: uuid.UUID | None = None
    scheduled_date: date | None = None
    scheduled_time: time | None = None
    notes: str | None = None


class CreateCleaningTaskService:
    def __init__(
        self,
        task_repo: CleaningTaskRepository,
        property_repo: PropertyRepository,
    ) -> None:
        self._task_repo = task_repo
        self._property_repo = property_repo

    async def execute(self, inp: CreateCleaningTaskInput) -> CleaningTask:
        prop = await self._property_repo.get_by_id(inp.property_id)
        if prop is None:
            raise ValueError("Property not found")
        if prop.company_id != inp.company_id:
            raise ValueError("Property does not belong to company")

        status = CleaningStatus.ASSIGNED if inp.cleaner_id else CleaningStatus.PENDING

        task = await self._task_repo.create(
            CleaningTask(
                company_id=inp.company_id,
                property_id=inp.property_id,
                booking_id=inp.booking_id,
                cleaner_id=inp.cleaner_id,
                type=inp.type,
                status=status,
                scheduled_date=inp.scheduled_date,
                scheduled_time=inp.scheduled_time,
                notes=inp.notes,
            )
        )
        return task


async def clean_after_stay(
    tasks: CleaningTaskRepository,
    properties: PropertyRepository,
    booking: Booking,
    *,
    today: date,
    notes: str,
) -> bool:
    """A guest left: the flat gets a cleaning for today, unless one is open or this stay
    already had one (the guest marked leaving and the maid finished). Says if it made one."""
    flat_tasks = await tasks.list_by_property(booking.property_id, limit=100)
    if any(t.status in _OPEN or t.booking_id == booking.id for t in flat_tasks):
        return False
    await CreateCleaningTaskService(tasks, properties).execute(
        CreateCleaningTaskInput(
            company_id=booking.company_id,
            property_id=booking.property_id,
            type=CleaningType.POST_CHECKOUT,
            booking_id=booking.id,
            scheduled_date=today,
            notes=notes,
        )
    )
    return True
