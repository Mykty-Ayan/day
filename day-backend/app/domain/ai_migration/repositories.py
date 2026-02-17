from __future__ import annotations

import abc
import uuid

from app.domain.ai_migration.entities import ImportJob


class ImportJobRepository(abc.ABC):
    @abc.abstractmethod
    async def save(self, job: ImportJob) -> ImportJob: ...

    @abc.abstractmethod
    async def update(self, job: ImportJob) -> ImportJob: ...

    @abc.abstractmethod
    async def get_by_id(self, job_id: uuid.UUID) -> ImportJob | None: ...

    @abc.abstractmethod
    async def list_by_company(
        self, company_id: uuid.UUID, *, offset: int = 0, limit: int = 50
    ) -> list[ImportJob]: ...

    @abc.abstractmethod
    async def count_by_company(self, company_id: uuid.UUID) -> int: ...
