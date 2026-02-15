from __future__ import annotations

import abc
import uuid
from datetime import date

from app.domain.cleaning.entities import (
    CleanerRating,
    CleanerRoute,
    CleaningChecklistItem,
    CleaningChecklistTemplate,
    CleaningReport,
    CleaningReportChecklist,
    CleaningReportPhoto,
    CleaningTask,
)
from app.domain.cleaning.value_objects import CleaningStatus


class CleaningTaskRepository(abc.ABC):
    @abc.abstractmethod
    async def create(self, task: CleaningTask) -> CleaningTask: ...

    @abc.abstractmethod
    async def get_by_id(self, task_id: uuid.UUID) -> CleaningTask | None: ...

    @abc.abstractmethod
    async def list_by_company(
        self,
        company_id: uuid.UUID,
        *,
        offset: int = 0,
        limit: int = 50,
        status: CleaningStatus | None = None,
        property_id: uuid.UUID | None = None,
        cleaner_id: uuid.UUID | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
    ) -> list[CleaningTask]: ...

    @abc.abstractmethod
    async def count_by_company(
        self,
        company_id: uuid.UUID,
        *,
        status: CleaningStatus | None = None,
        property_id: uuid.UUID | None = None,
        cleaner_id: uuid.UUID | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
    ) -> int: ...

    @abc.abstractmethod
    async def list_by_property(
        self,
        property_id: uuid.UUID,
        *,
        offset: int = 0,
        limit: int = 50,
    ) -> list[CleaningTask]: ...

    @abc.abstractmethod
    async def update(self, task: CleaningTask) -> CleaningTask: ...


class CleaningChecklistTemplateRepository(abc.ABC):
    @abc.abstractmethod
    async def create(self, template: CleaningChecklistTemplate) -> CleaningChecklistTemplate: ...

    @abc.abstractmethod
    async def get_by_id(self, template_id: uuid.UUID) -> CleaningChecklistTemplate | None: ...

    @abc.abstractmethod
    async def list_by_company(
        self, company_id: uuid.UUID
    ) -> list[CleaningChecklistTemplate]: ...

    @abc.abstractmethod
    async def delete(self, template_id: uuid.UUID) -> None: ...


class CleaningChecklistItemRepository(abc.ABC):
    @abc.abstractmethod
    async def create(self, item: CleaningChecklistItem) -> CleaningChecklistItem: ...

    @abc.abstractmethod
    async def list_by_template(
        self, template_id: uuid.UUID
    ) -> list[CleaningChecklistItem]: ...

    @abc.abstractmethod
    async def reorder(self, template_id: uuid.UUID, item_ids: list[uuid.UUID]) -> None: ...

    @abc.abstractmethod
    async def delete(self, item_id: uuid.UUID) -> None: ...

    @abc.abstractmethod
    async def delete_by_template(self, template_id: uuid.UUID) -> None: ...


class CleaningReportRepository(abc.ABC):
    @abc.abstractmethod
    async def create(self, report: CleaningReport) -> CleaningReport: ...

    @abc.abstractmethod
    async def get_by_id(self, report_id: uuid.UUID) -> CleaningReport | None: ...

    @abc.abstractmethod
    async def get_by_task(self, task_id: uuid.UUID) -> CleaningReport | None: ...

    @abc.abstractmethod
    async def update(self, report: CleaningReport) -> CleaningReport: ...


class CleaningReportPhotoRepository(abc.ABC):
    @abc.abstractmethod
    async def create(self, photo: CleaningReportPhoto) -> CleaningReportPhoto: ...

    @abc.abstractmethod
    async def list_by_report(
        self, report_id: uuid.UUID
    ) -> list[CleaningReportPhoto]: ...


class CleaningReportChecklistRepository(abc.ABC):
    @abc.abstractmethod
    async def create(self, item: CleaningReportChecklist) -> CleaningReportChecklist: ...

    @abc.abstractmethod
    async def list_by_report(
        self, report_id: uuid.UUID
    ) -> list[CleaningReportChecklist]: ...


class CleanerRouteRepository(abc.ABC):
    @abc.abstractmethod
    async def create(self, route: CleanerRoute) -> CleanerRoute: ...

    @abc.abstractmethod
    async def get_by_id(self, route_id: uuid.UUID) -> CleanerRoute | None: ...

    @abc.abstractmethod
    async def get_by_cleaner_and_date(
        self, cleaner_id: uuid.UUID, route_date: date
    ) -> CleanerRoute | None: ...

    @abc.abstractmethod
    async def update(self, route: CleanerRoute) -> CleanerRoute: ...


class CleanerRatingRepository(abc.ABC):
    @abc.abstractmethod
    async def create(self, rating: CleanerRating) -> CleanerRating: ...

    @abc.abstractmethod
    async def list_by_cleaner(
        self,
        cleaner_id: uuid.UUID,
        *,
        offset: int = 0,
        limit: int = 50,
    ) -> list[CleanerRating]: ...

    @abc.abstractmethod
    async def avg_score_by_cleaner(self, cleaner_id: uuid.UUID) -> float: ...

    @abc.abstractmethod
    async def count_by_cleaner(self, cleaner_id: uuid.UUID) -> int: ...
