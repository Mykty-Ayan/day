from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.ai_migration.entities import ImportJob
from app.domain.ai_migration.repositories import ImportJobRepository
from app.domain.ai_migration.value_objects import ImportJobStatus, ImportSource
from app.infrastructure.models.ai_migration import ImportJobModel

# ---------- helpers ----------


def _model_to_job(m: ImportJobModel) -> ImportJob:
    return ImportJob(
        id=m.id,
        company_id=m.company_id,
        source_url=m.source_url,
        user_prompt=m.user_prompt,
        status=ImportJobStatus(m.status),
        source_type=ImportSource(m.source_type) if m.source_type else ImportSource.OTHER,
        extracted_data=m.extracted_data,
        mapped_property=m.mapped_property,
        error_message=m.error_message,
        created_by=m.created_by,
        created_at=m.created_at,
        updated_at=m.updated_at,
    )


def _job_to_dict(j: ImportJob) -> dict:
    return {
        "company_id": j.company_id,
        "source_url": j.source_url,
        "user_prompt": j.user_prompt,
        "status": j.status.value,
        "source_type": j.source_type.value if j.source_type else None,
        "extracted_data": j.extracted_data,
        "mapped_property": j.mapped_property,
        "error_message": j.error_message,
        "created_by": j.created_by,
    }


# ---------- implementation ----------


class SqlImportJobRepository(ImportJobRepository):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def save(self, job: ImportJob) -> ImportJob:
        model = ImportJobModel(id=job.id, **_job_to_dict(job))
        self._session.add(model)
        await self._session.flush()
        await self._session.refresh(model)
        return _model_to_job(model)

    async def update(self, job: ImportJob) -> ImportJob:
        stmt = (
            update(ImportJobModel)
            .where(ImportJobModel.id == job.id)
            .values(**_job_to_dict(job), updated_at=datetime.utcnow())
        )
        await self._session.execute(stmt)
        await self._session.flush()
        result = await self._session.get(ImportJobModel, job.id)
        return _model_to_job(result)  # type: ignore[arg-type]

    async def get_by_id(self, job_id: uuid.UUID) -> ImportJob | None:
        result = await self._session.get(ImportJobModel, job_id)
        return _model_to_job(result) if result else None

    async def list_by_company(
        self, company_id: uuid.UUID, *, offset: int = 0, limit: int = 50
    ) -> list[ImportJob]:
        stmt = (
            select(ImportJobModel)
            .where(ImportJobModel.company_id == company_id)
            .order_by(ImportJobModel.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        result = await self._session.scalars(stmt)
        return [_model_to_job(m) for m in result.all()]

    async def count_by_company(self, company_id: uuid.UUID) -> int:
        stmt = select(func.count()).select_from(ImportJobModel).where(
            ImportJobModel.company_id == company_id
        )
        result = await self._session.scalar(stmt)
        return result or 0
