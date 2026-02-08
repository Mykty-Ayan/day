from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime

from app.domain.cleaning.entities import (
    CleaningReport,
    CleaningReportChecklist,
    CleaningReportPhoto,
)
from app.domain.cleaning.repositories import (
    CleaningReportChecklistRepository,
    CleaningReportPhotoRepository,
    CleaningReportRepository,
    CleaningTaskRepository,
)
from app.domain.cleaning.value_objects import CleaningStatus, ReportStatus, RoomType


@dataclass
class ReportPhotoInput:
    url: str
    room_type: RoomType = RoomType.OTHER
    metadata: dict | None = None


@dataclass
class ReportChecklistInput:
    checklist_item_id: uuid.UUID
    is_done: bool = False
    note: str | None = None


@dataclass
class SubmitReportInput:
    task_id: uuid.UUID
    company_id: uuid.UUID
    cleaner_id: uuid.UUID
    notes: str | None = None
    photos: list[ReportPhotoInput] = field(default_factory=list)
    checklist: list[ReportChecklistInput] = field(default_factory=list)


class SubmitReportService:
    def __init__(
        self,
        task_repo: CleaningTaskRepository,
        report_repo: CleaningReportRepository,
        photo_repo: CleaningReportPhotoRepository,
        checklist_repo: CleaningReportChecklistRepository,
    ) -> None:
        self._task_repo = task_repo
        self._report_repo = report_repo
        self._photo_repo = photo_repo
        self._checklist_repo = checklist_repo

    async def execute(self, inp: SubmitReportInput) -> CleaningReport:
        task = await self._task_repo.get_by_id(inp.task_id)
        if task is None:
            raise ValueError("Cleaning task not found")
        if task.company_id != inp.company_id:
            raise ValueError("Task does not belong to company")
        if task.status not in (CleaningStatus.IN_PROGRESS, CleaningStatus.DONE):
            raise ValueError("Task must be in progress or done to submit a report")

        report = await self._report_repo.create(
            CleaningReport(
                task_id=inp.task_id,
                cleaner_id=inp.cleaner_id,
                status=ReportStatus.SUBMITTED,
                notes=inp.notes,
                submitted_at=datetime.utcnow(),
            )
        )

        for photo_inp in inp.photos:
            await self._photo_repo.create(
                CleaningReportPhoto(
                    report_id=report.id,
                    url=photo_inp.url,
                    room_type=photo_inp.room_type,
                    metadata=photo_inp.metadata,
                )
            )

        for cl_inp in inp.checklist:
            await self._checklist_repo.create(
                CleaningReportChecklist(
                    report_id=report.id,
                    checklist_item_id=cl_inp.checklist_item_id,
                    is_done=cl_inp.is_done,
                    note=cl_inp.note,
                )
            )

        # Transition task to done if still in progress
        if task.status == CleaningStatus.IN_PROGRESS:
            task.change_status(CleaningStatus.DONE)
            task.completed_at = datetime.utcnow()
            await self._task_repo.update(task)

        return report
