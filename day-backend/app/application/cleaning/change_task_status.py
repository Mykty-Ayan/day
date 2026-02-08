from __future__ import annotations

import uuid
from datetime import datetime

from app.domain.cleaning.entities import CleaningTask
from app.domain.cleaning.repositories import CleaningTaskRepository
from app.domain.cleaning.value_objects import CleaningStatus


class ChangeCleaningTaskStatusService:
    def __init__(self, task_repo: CleaningTaskRepository) -> None:
        self._task_repo = task_repo

    async def execute(
        self,
        task_id: uuid.UUID,
        company_id: uuid.UUID,
        target_status: CleaningStatus,
    ) -> CleaningTask:
        task = await self._task_repo.get_by_id(task_id)
        if task is None:
            raise ValueError("Cleaning task not found")
        if task.company_id != company_id:
            raise ValueError("Task does not belong to company")

        task.change_status(target_status)

        now = datetime.utcnow()
        if target_status == CleaningStatus.IN_PROGRESS:
            task.started_at = now
        elif target_status == CleaningStatus.DONE:
            task.completed_at = now
        elif target_status == CleaningStatus.VERIFIED:
            task.verified_at = now

        return await self._task_repo.update(task)
