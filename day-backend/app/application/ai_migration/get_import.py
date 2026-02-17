from __future__ import annotations

import uuid
from dataclasses import dataclass

from app.domain.ai_migration.entities import ImportJob
from app.domain.ai_migration.repositories import ImportJobRepository


@dataclass
class GetImportInput:
    job_id: uuid.UUID
    company_id: uuid.UUID


class GetImportService:
    def __init__(self, import_job_repo: ImportJobRepository) -> None:
        self._import_job_repo = import_job_repo

    async def execute(self, inp: GetImportInput) -> ImportJob:
        job = await self._import_job_repo.get_by_id(inp.job_id)
        if job is None or job.company_id != inp.company_id:
            raise ValueError("Import job not found")
        return job
