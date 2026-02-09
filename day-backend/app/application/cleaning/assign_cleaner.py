from __future__ import annotations

import uuid

from app.domain.cleaning.entities import CleaningTask
from app.domain.cleaning.repositories import CleaningTaskRepository
from app.domain.cleaning.value_objects import CleaningStatus


class AssignCleanerService:
    def __init__(self, task_repo: CleaningTaskRepository) -> None:
        self._task_repo = task_repo

    async def execute(
        self,
        task_id: uuid.UUID,
        company_id: uuid.UUID,
        cleaner_id: uuid.UUID,
    ) -> CleaningTask:
        task = await self._task_repo.get_by_id(task_id)
        if task is None:
            raise ValueError("Cleaning task not found")
        if task.company_id != company_id:
            raise ValueError("Task does not belong to company")
        if task.status != CleaningStatus.PENDING:
            raise ValueError("Can only assign cleaner to pending tasks")

        task.cleaner_id = cleaner_id
        task.change_status(CleaningStatus.ASSIGNED)

        return await self._task_repo.update(task)
