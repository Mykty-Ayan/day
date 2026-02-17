from __future__ import annotations

import uuid
from dataclasses import dataclass

from app.domain.ai_migration.entities import ImportJob
from app.domain.ai_migration.repositories import ImportJobRepository


@dataclass
class ListImportsInput:
    company_id: uuid.UUID
    offset: int = 0
    limit: int = 50


@dataclass
class ListImportsResult:
    items: list[ImportJob]
    total: int


class ListImportsService:
    def __init__(self, import_job_repo: ImportJobRepository) -> None:
        self._import_job_repo = import_job_repo

    async def execute(self, inp: ListImportsInput) -> ListImportsResult:
        items = await self._import_job_repo.list_by_company(
            inp.company_id, offset=inp.offset, limit=inp.limit
        )
        total = await self._import_job_repo.count_by_company(inp.company_id)
        return ListImportsResult(items=items, total=total)
