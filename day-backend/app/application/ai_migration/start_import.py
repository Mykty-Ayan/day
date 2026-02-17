from __future__ import annotations

import uuid
from dataclasses import dataclass

from app.domain.ai_migration.entities import ImportJob
from app.domain.ai_migration.repositories import ImportJobRepository
from app.domain.ai_migration.value_objects import ImportJobStatus, ImportSource
from app.infrastructure.ai_service_client import AIServiceClient


@dataclass
class StartImportInput:
    company_id: uuid.UUID
    source_url: str
    user_prompt: str | None = None
    created_by: uuid.UUID | None = None


class StartImportService:
    def __init__(
        self,
        import_job_repo: ImportJobRepository,
        ai_client: AIServiceClient,
    ) -> None:
        self._import_job_repo = import_job_repo
        self._ai_client = ai_client

    async def execute(self, inp: StartImportInput) -> ImportJob:
        normalized_url = ImportSource.normalize_url(inp.source_url)
        source_type = ImportSource.detect_from_url(normalized_url)

        job = ImportJob(
            id=uuid.uuid4(),
            company_id=inp.company_id,
            source_url=normalized_url,
            user_prompt=inp.user_prompt,
            status=ImportJobStatus.PENDING,
            source_type=source_type,
            created_by=inp.created_by,
        )

        job = await self._import_job_repo.save(job)

        try:
            job.status = ImportJobStatus.PROCESSING
            job = await self._import_job_repo.update(job)

            result = await self._ai_client.parse_listing(
                url=normalized_url,
                user_prompt=inp.user_prompt,
            )

            job.extracted_data = result.get("extracted_data", result)
            job.mapped_property = result.get("mapped_property", result)
            job.status = ImportJobStatus.COMPLETED
            job = await self._import_job_repo.update(job)
        except Exception as exc:
            job.error_message = str(exc)
            job.status = ImportJobStatus.FAILED
            job = await self._import_job_repo.update(job)

        return job
