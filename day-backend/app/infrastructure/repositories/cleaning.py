from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

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
from app.domain.cleaning.repositories import (
    CleanerRatingRepository,
    CleanerRouteRepository,
    CleaningChecklistItemRepository,
    CleaningChecklistTemplateRepository,
    CleaningReportChecklistRepository,
    CleaningReportPhotoRepository,
    CleaningReportRepository,
    CleaningTaskRepository,
)
from app.domain.cleaning.value_objects import (
    CleaningStatus,
    CleaningType,
    ReportStatus,
    RoomType,
)
from app.infrastructure.models.cleaning import (
    CleanerRatingModel,
    CleanerRouteModel,
    CleaningChecklistItemModel,
    CleaningChecklistTemplateModel,
    CleaningReportChecklistModel,
    CleaningReportModel,
    CleaningReportPhotoModel,
    CleaningTaskModel,
)

# ---------- helpers ----------


def _normalize_cleaning_status(value: str) -> CleaningStatus:
    # Backward compatibility: legacy seeded records used "completed".
    if value == "completed":
        return CleaningStatus.DONE
    return CleaningStatus(value)


def _model_to_task(m: CleaningTaskModel) -> CleaningTask:
    return CleaningTask(
        id=m.id,
        company_id=m.company_id,
        property_id=m.property_id,
        booking_id=m.booking_id,
        cleaner_id=m.cleaner_id,
        type=CleaningType(m.type),
        status=_normalize_cleaning_status(m.status),
        scheduled_date=m.scheduled_date,
        scheduled_time=m.scheduled_time,
        notes=m.notes,
        started_at=m.started_at,
        completed_at=m.completed_at,
        verified_at=m.verified_at,
        created_at=m.created_at,
        updated_at=m.updated_at,
    )


def _model_to_template(m: CleaningChecklistTemplateModel) -> CleaningChecklistTemplate:
    return CleaningChecklistTemplate(
        id=m.id,
        company_id=m.company_id,
        name=m.name,
        created_at=m.created_at,
    )


def _model_to_checklist_item(m: CleaningChecklistItemModel) -> CleaningChecklistItem:
    return CleaningChecklistItem(
        id=m.id,
        template_id=m.template_id,
        title=m.title,
        sort_order=m.sort_order,
    )


def _model_to_report(m: CleaningReportModel) -> CleaningReport:
    return CleaningReport(
        id=m.id,
        task_id=m.task_id,
        cleaner_id=m.cleaner_id,
        status=ReportStatus(m.status),
        notes=m.notes,
        submitted_at=m.submitted_at,
        created_at=m.created_at,
    )


def _model_to_report_photo(m: CleaningReportPhotoModel) -> CleaningReportPhoto:
    return CleaningReportPhoto(
        id=m.id,
        report_id=m.report_id,
        url=m.url,
        room_type=RoomType(m.room_type),
        metadata=m.metadata_json,
        metadata_verified=m.metadata_verified,
    )


def _model_to_report_checklist(m: CleaningReportChecklistModel) -> CleaningReportChecklist:
    return CleaningReportChecklist(
        id=m.id,
        report_id=m.report_id,
        checklist_item_id=m.checklist_item_id,
        is_done=m.is_done,
        note=m.note,
    )


def _model_to_route(m: CleanerRouteModel) -> CleanerRoute:
    return CleanerRoute(
        id=m.id,
        company_id=m.company_id,
        cleaner_id=m.cleaner_id,
        route_date=m.route_date,
        ordered_task_ids=m.ordered_task_ids,
        route_polyline=m.route_polyline,
        created_at=m.created_at,
        updated_at=m.updated_at,
    )


def _model_to_rating(m: CleanerRatingModel) -> CleanerRating:
    return CleanerRating(
        id=m.id,
        company_id=m.company_id,
        cleaner_id=m.cleaner_id,
        task_id=m.task_id,
        rated_by=m.rated_by,
        score=m.score,
        review=m.review,
        kpi_metrics=m.kpi_metrics,
        created_at=m.created_at,
    )


# ---------- implementations ----------


class SqlCleaningTaskRepository(CleaningTaskRepository):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(self, task: CleaningTask) -> CleaningTask:
        model = CleaningTaskModel(
            id=task.id,
            company_id=task.company_id,
            property_id=task.property_id,
            booking_id=task.booking_id,
            cleaner_id=task.cleaner_id,
            type=task.type.value,
            status=task.status.value,
            scheduled_date=task.scheduled_date,
            scheduled_time=task.scheduled_time,
            notes=task.notes,
            started_at=task.started_at,
            completed_at=task.completed_at,
            verified_at=task.verified_at,
        )
        self._session.add(model)
        await self._session.flush()
        await self._session.refresh(model)
        return _model_to_task(model)

    async def get_by_id(self, task_id: uuid.UUID) -> CleaningTask | None:
        result = await self._session.get(CleaningTaskModel, task_id)
        return _model_to_task(result) if result else None

    def _apply_filters(self, stmt, *, status=None, property_id=None, cleaner_id=None, date_from=None, date_to=None):
        if status is not None:
            if status == CleaningStatus.DONE:
                stmt = stmt.where(CleaningTaskModel.status.in_(["done", "completed"]))
            else:
                stmt = stmt.where(CleaningTaskModel.status == status.value)
        if property_id is not None:
            stmt = stmt.where(CleaningTaskModel.property_id == property_id)
        if cleaner_id is not None:
            stmt = stmt.where(CleaningTaskModel.cleaner_id == cleaner_id)
        if date_from is not None:
            stmt = stmt.where(CleaningTaskModel.scheduled_date >= date_from)
        if date_to is not None:
            stmt = stmt.where(CleaningTaskModel.scheduled_date <= date_to)
        return stmt

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
    ) -> list[CleaningTask]:
        stmt = select(CleaningTaskModel).where(CleaningTaskModel.company_id == company_id)
        stmt = self._apply_filters(
            stmt, status=status, property_id=property_id,
            cleaner_id=cleaner_id, date_from=date_from, date_to=date_to,
        )
        stmt = stmt.order_by(CleaningTaskModel.created_at.desc()).offset(offset).limit(limit)
        result = await self._session.scalars(stmt)
        return [_model_to_task(m) for m in result.all()]

    async def count_by_company(
        self,
        company_id: uuid.UUID,
        *,
        status: CleaningStatus | None = None,
        property_id: uuid.UUID | None = None,
        cleaner_id: uuid.UUID | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
    ) -> int:
        stmt = select(func.count()).select_from(CleaningTaskModel).where(
            CleaningTaskModel.company_id == company_id
        )
        stmt = self._apply_filters(
            stmt, status=status, property_id=property_id,
            cleaner_id=cleaner_id, date_from=date_from, date_to=date_to,
        )
        result = await self._session.scalar(stmt)
        return result or 0

    async def list_by_property(
        self,
        property_id: uuid.UUID,
        *,
        offset: int = 0,
        limit: int = 50,
    ) -> list[CleaningTask]:
        stmt = (
            select(CleaningTaskModel)
            .where(CleaningTaskModel.property_id == property_id)
            .order_by(CleaningTaskModel.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        result = await self._session.scalars(stmt)
        return [_model_to_task(m) for m in result.all()]

    async def update(self, task: CleaningTask) -> CleaningTask:
        stmt = (
            update(CleaningTaskModel)
            .where(CleaningTaskModel.id == task.id)
            .values(
                cleaner_id=task.cleaner_id,
                status=task.status.value,
                scheduled_date=task.scheduled_date,
                scheduled_time=task.scheduled_time,
                notes=task.notes,
                started_at=task.started_at,
                completed_at=task.completed_at,
                verified_at=task.verified_at,
                updated_at=datetime.utcnow(),
            )
        )
        await self._session.execute(stmt)
        await self._session.flush()
        result = await self._session.get(CleaningTaskModel, task.id)
        return _model_to_task(result)  # type: ignore[arg-type]


class SqlCleaningChecklistTemplateRepository(CleaningChecklistTemplateRepository):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(self, template: CleaningChecklistTemplate) -> CleaningChecklistTemplate:
        model = CleaningChecklistTemplateModel(
            id=template.id,
            company_id=template.company_id,
            name=template.name,
        )
        self._session.add(model)
        await self._session.flush()
        await self._session.refresh(model)
        return _model_to_template(model)

    async def get_by_id(self, template_id: uuid.UUID) -> CleaningChecklistTemplate | None:
        result = await self._session.get(CleaningChecklistTemplateModel, template_id)
        return _model_to_template(result) if result else None

    async def list_by_company(
        self, company_id: uuid.UUID
    ) -> list[CleaningChecklistTemplate]:
        stmt = (
            select(CleaningChecklistTemplateModel)
            .where(CleaningChecklistTemplateModel.company_id == company_id)
            .order_by(CleaningChecklistTemplateModel.created_at.desc())
        )
        result = await self._session.scalars(stmt)
        return [_model_to_template(m) for m in result.all()]

    async def delete(self, template_id: uuid.UUID) -> None:
        stmt = delete(CleaningChecklistTemplateModel).where(
            CleaningChecklistTemplateModel.id == template_id
        )
        await self._session.execute(stmt)
        await self._session.flush()


class SqlCleaningChecklistItemRepository(CleaningChecklistItemRepository):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(self, item: CleaningChecklistItem) -> CleaningChecklistItem:
        model = CleaningChecklistItemModel(
            id=item.id,
            template_id=item.template_id,
            title=item.title,
            sort_order=item.sort_order,
        )
        self._session.add(model)
        await self._session.flush()
        await self._session.refresh(model)
        return _model_to_checklist_item(model)

    async def list_by_template(
        self, template_id: uuid.UUID
    ) -> list[CleaningChecklistItem]:
        stmt = (
            select(CleaningChecklistItemModel)
            .where(CleaningChecklistItemModel.template_id == template_id)
            .order_by(CleaningChecklistItemModel.sort_order)
        )
        result = await self._session.scalars(stmt)
        return [_model_to_checklist_item(m) for m in result.all()]

    async def reorder(self, template_id: uuid.UUID, item_ids: list[uuid.UUID]) -> None:
        for sort_order, item_id in enumerate(item_ids):
            stmt = (
                update(CleaningChecklistItemModel)
                .where(
                    CleaningChecklistItemModel.template_id == template_id,
                    CleaningChecklistItemModel.id == item_id,
                )
                .values(sort_order=sort_order)
            )
            await self._session.execute(stmt)
        await self._session.flush()

    async def delete(self, item_id: uuid.UUID) -> None:
        stmt = delete(CleaningChecklistItemModel).where(
            CleaningChecklistItemModel.id == item_id
        )
        await self._session.execute(stmt)
        await self._session.flush()

    async def delete_by_template(self, template_id: uuid.UUID) -> None:
        stmt = delete(CleaningChecklistItemModel).where(
            CleaningChecklistItemModel.template_id == template_id
        )
        await self._session.execute(stmt)
        await self._session.flush()


class SqlCleaningReportRepository(CleaningReportRepository):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(self, report: CleaningReport) -> CleaningReport:
        model = CleaningReportModel(
            id=report.id,
            task_id=report.task_id,
            cleaner_id=report.cleaner_id,
            status=report.status.value,
            notes=report.notes,
            submitted_at=report.submitted_at,
        )
        self._session.add(model)
        await self._session.flush()
        await self._session.refresh(model)
        return _model_to_report(model)

    async def get_by_id(self, report_id: uuid.UUID) -> CleaningReport | None:
        result = await self._session.get(CleaningReportModel, report_id)
        return _model_to_report(result) if result else None

    async def get_by_task(self, task_id: uuid.UUID) -> CleaningReport | None:
        stmt = select(CleaningReportModel).where(
            CleaningReportModel.task_id == task_id
        )
        result = await self._session.scalar(stmt)
        return _model_to_report(result) if result else None

    async def update(self, report: CleaningReport) -> CleaningReport:
        stmt = (
            update(CleaningReportModel)
            .where(CleaningReportModel.id == report.id)
            .values(
                status=report.status.value,
                notes=report.notes,
            )
        )
        await self._session.execute(stmt)
        await self._session.flush()
        result = await self._session.get(CleaningReportModel, report.id)
        return _model_to_report(result)  # type: ignore[arg-type]


class SqlCleaningReportPhotoRepository(CleaningReportPhotoRepository):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(self, photo: CleaningReportPhoto) -> CleaningReportPhoto:
        model = CleaningReportPhotoModel(
            id=photo.id,
            report_id=photo.report_id,
            url=photo.url,
            room_type=photo.room_type.value,
            metadata_json=photo.metadata,
            metadata_verified=photo.metadata_verified,
        )
        self._session.add(model)
        await self._session.flush()
        await self._session.refresh(model)
        return _model_to_report_photo(model)

    async def list_by_report(
        self, report_id: uuid.UUID
    ) -> list[CleaningReportPhoto]:
        stmt = (
            select(CleaningReportPhotoModel)
            .where(CleaningReportPhotoModel.report_id == report_id)
        )
        result = await self._session.scalars(stmt)
        return [_model_to_report_photo(m) for m in result.all()]


class SqlCleaningReportChecklistRepository(CleaningReportChecklistRepository):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(self, item: CleaningReportChecklist) -> CleaningReportChecklist:
        model = CleaningReportChecklistModel(
            id=item.id,
            report_id=item.report_id,
            checklist_item_id=item.checklist_item_id,
            is_done=item.is_done,
            note=item.note,
        )
        self._session.add(model)
        await self._session.flush()
        await self._session.refresh(model)
        return _model_to_report_checklist(model)

    async def list_by_report(
        self, report_id: uuid.UUID
    ) -> list[CleaningReportChecklist]:
        stmt = (
            select(CleaningReportChecklistModel)
            .where(CleaningReportChecklistModel.report_id == report_id)
        )
        result = await self._session.scalars(stmt)
        return [_model_to_report_checklist(m) for m in result.all()]


class SqlCleanerRouteRepository(CleanerRouteRepository):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(self, route: CleanerRoute) -> CleanerRoute:
        model = CleanerRouteModel(
            id=route.id,
            company_id=route.company_id,
            cleaner_id=route.cleaner_id,
            route_date=route.route_date,
            ordered_task_ids=route.ordered_task_ids,
            route_polyline=route.route_polyline,
        )
        self._session.add(model)
        await self._session.flush()
        await self._session.refresh(model)
        return _model_to_route(model)

    async def get_by_id(self, route_id: uuid.UUID) -> CleanerRoute | None:
        result = await self._session.get(CleanerRouteModel, route_id)
        return _model_to_route(result) if result else None

    async def get_by_cleaner_and_date(
        self, cleaner_id: uuid.UUID, route_date: date
    ) -> CleanerRoute | None:
        stmt = select(CleanerRouteModel).where(
            CleanerRouteModel.cleaner_id == cleaner_id,
            CleanerRouteModel.route_date == route_date,
        )
        result = await self._session.scalar(stmt)
        return _model_to_route(result) if result else None

    async def update(self, route: CleanerRoute) -> CleanerRoute:
        stmt = (
            update(CleanerRouteModel)
            .where(CleanerRouteModel.id == route.id)
            .values(
                ordered_task_ids=route.ordered_task_ids,
                route_polyline=route.route_polyline,
                updated_at=datetime.utcnow(),
            )
        )
        await self._session.execute(stmt)
        await self._session.flush()
        result = await self._session.get(CleanerRouteModel, route.id)
        return _model_to_route(result)  # type: ignore[arg-type]


class SqlCleanerRatingRepository(CleanerRatingRepository):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(self, rating: CleanerRating) -> CleanerRating:
        model = CleanerRatingModel(
            id=rating.id,
            company_id=rating.company_id,
            cleaner_id=rating.cleaner_id,
            task_id=rating.task_id,
            rated_by=rating.rated_by,
            score=rating.score,
            review=rating.review,
            kpi_metrics=rating.kpi_metrics,
        )
        self._session.add(model)
        await self._session.flush()
        await self._session.refresh(model)
        return _model_to_rating(model)

    async def list_by_cleaner(
        self,
        cleaner_id: uuid.UUID,
        *,
        offset: int = 0,
        limit: int = 50,
    ) -> list[CleanerRating]:
        stmt = (
            select(CleanerRatingModel)
            .where(CleanerRatingModel.cleaner_id == cleaner_id)
            .order_by(CleanerRatingModel.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        result = await self._session.scalars(stmt)
        return [_model_to_rating(m) for m in result.all()]

    async def avg_score_by_cleaner(self, cleaner_id: uuid.UUID) -> float:
        stmt = select(func.avg(CleanerRatingModel.score)).where(
            CleanerRatingModel.cleaner_id == cleaner_id
        )
        result = await self._session.scalar(stmt)
        return float(result) if result else 0.0

    async def count_by_cleaner(self, cleaner_id: uuid.UUID) -> int:
        stmt = select(func.count()).select_from(CleanerRatingModel).where(
            CleanerRatingModel.cleaner_id == cleaner_id
        )
        result = await self._session.scalar(stmt)
        return result or 0
