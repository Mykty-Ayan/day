from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date, datetime, time

from app.domain.booking.entities import Booking
from app.domain.cleaning.entities import CleaningTask
from app.domain.cleaning.repositories import CleaningTaskRepository
from app.domain.cleaning.value_objects import CleaningStatus, CleaningType
from app.domain.property.repositories import PropertyRepository

_WAITING = {CleaningStatus.PENDING, CleaningStatus.ASSIGNED}
_OPEN = _WAITING | {CleaningStatus.IN_PROGRESS}


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


async def follow_stay(tasks: CleaningTaskRepository, booking: Booking, left_at: datetime) -> list[CleaningTask]:
    """A stay's end moved from left_at: its cleaning moves too, so no maid comes to an
    occupied flat and never before the guest is out. A started cleaning stays. Says
    which moved."""
    moved = []
    for task in await tasks.list_by_property(booking.property_id, limit=100):
        if (
            task.company_id != booking.company_id
            or task.status not in _WAITING
            or task.type != CleaningType.POST_CHECKOUT
        ):
            continue
        # Tied to no stay, it is this guest's only if set for their departure: with hours
        # on sale, one earlier the same day was for the guest before them.
        for_this_departure = (
            task.booking_id is None
            and task.scheduled_date == left_at.date()
            and (task.scheduled_time is None or task.scheduled_time >= left_at.time())
        )
        if task.booking_id != booking.id and not for_this_departure:
            continue
        scheduled_time = task.scheduled_time
        if scheduled_time is not None and scheduled_time < booking.check_out.time():
            scheduled_time = booking.check_out.time()
        if (task.scheduled_date, task.scheduled_time) == (booking.check_out.date(), scheduled_time):
            continue
        task.scheduled_date = booking.check_out.date()
        task.scheduled_time = scheduled_time
        moved.append(await tasks.update(task))
    return moved
