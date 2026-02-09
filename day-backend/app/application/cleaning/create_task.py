from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date, time

from app.domain.cleaning.entities import CleaningTask
from app.domain.cleaning.repositories import CleaningTaskRepository
from app.domain.cleaning.value_objects import CleaningStatus, CleaningType
from app.domain.property.repositories import PropertyRepository


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
