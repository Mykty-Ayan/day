"""Cleaning API endpoints."""

from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.cleaning.assign_cleaner import AssignCleanerService
from app.application.cleaning.change_task_status import ChangeCleaningTaskStatusService
from app.application.cleaning.create_task import (
    CreateCleaningTaskInput,
    CreateCleaningTaskService,
)
from app.application.cleaning.manage_checklists import (
    ChecklistItemInput as ChecklistItemInputApp,
)
from app.application.cleaning.manage_checklists import (
    CreateChecklistTemplateInput,
    ManageChecklistsService,
)
from app.application.cleaning.rate_cleaner import (
    RateCleanerInput,
    RateCleanerService,
)
from app.application.cleaning.submit_report import (
    ReportChecklistInput as ReportChecklistInputApp,
)
from app.application.cleaning.submit_report import (
    ReportPhotoInput as ReportPhotoInputApp,
)
from app.application.cleaning.submit_report import (
    SubmitReportInput,
    SubmitReportService,
)
from app.domain.auth.permissions import Permission
from app.domain.cleaning.value_objects import CleaningStatus
from app.infrastructure.database import get_session
from app.infrastructure.repositories.auth import SqlUserRepository
from app.infrastructure.repositories.cleaning import (
    SqlCleanerRatingRepository,
    SqlCleanerRouteRepository,
    SqlCleaningChecklistItemRepository,
    SqlCleaningChecklistTemplateRepository,
    SqlCleaningReportChecklistRepository,
    SqlCleaningReportPhotoRepository,
    SqlCleaningReportRepository,
    SqlCleaningTaskRepository,
)
from app.infrastructure.repositories.property import SqlPropertyRepository
from app.presentation.api.deps import Principal, get_company_id, get_principal, get_user_id, require
from app.presentation.schemas.cleaning import (
    ChecklistItemAdd,
    ChecklistItemReorder,
    ChecklistItemResponse,
    ChecklistItemUpdate,
    ChecklistTemplateCreate,
    ChecklistTemplateDetailResponse,
    ChecklistTemplateResponse,
    ChecklistTemplateUpdate,
    CleanerKPIResponse,
    CleanerRatingResponse,
    CleaningReportDetailResponse,
    CleaningReportResponse,
    CleaningTaskAssign,
    CleaningTaskCreate,
    CleaningTaskDetailResponse,
    CleaningTaskListResponse,
    CleaningTaskResponse,
    CleaningTaskStatusChange,
    RateCleanerCreate,
    ReportChecklistResponse,
    ReportPhotoResponse,
    SubmitReportCreate,
)

cleaning_router = APIRouter(prefix="/cleaning", tags=["cleaning"])
checklist_router = APIRouter(prefix="/checklists", tags=["checklists"])
rating_router = APIRouter(prefix="/cleaner-ratings", tags=["cleaner-ratings"])


# ---------- helpers ----------


def _repos(session: AsyncSession):
    return {
        "task": SqlCleaningTaskRepository(session),
        "template": SqlCleaningChecklistTemplateRepository(session),
        "item": SqlCleaningChecklistItemRepository(session),
        "report": SqlCleaningReportRepository(session),
        "photo": SqlCleaningReportPhotoRepository(session),
        "report_checklist": SqlCleaningReportChecklistRepository(session),
        "route": SqlCleanerRouteRepository(session),
        "rating": SqlCleanerRatingRepository(session),
        "property": SqlPropertyRepository(session),
    }


def _to_task_response(
    t,
    property_name: str | None = None,
    property_internal_name: str | None = None,
    cleaner_name: str | None = None,
) -> CleaningTaskResponse:
    return CleaningTaskResponse(
        id=t.id,
        company_id=t.company_id,
        property_id=t.property_id,
        booking_id=t.booking_id,
        cleaner_id=t.cleaner_id,
        cleaner_name=cleaner_name,
        type=t.type,
        status=t.status,
        scheduled_date=t.scheduled_date,
        scheduled_time=t.scheduled_time,
        notes=t.notes,
        started_at=t.started_at,
        completed_at=t.completed_at,
        verified_at=t.verified_at,
        property_name=property_name,
        property_internal_name=property_internal_name,
        created_at=t.created_at,
        updated_at=t.updated_at,
    )


async def _cleaner_names(session: AsyncSession, cleaner_ids: list[uuid.UUID]) -> dict[uuid.UUID, str]:
    """Resolve cleaner ids to display names in one query."""
    ids = [cid for cid in cleaner_ids if cid is not None]
    if not ids:
        return {}
    users = await SqlUserRepository(session).get_many(ids)
    return {uid: (user.full_name or user.email) for uid, user in users.items()}


async def cleaner_scope(principal: Principal = Depends(get_principal)) -> uuid.UUID | None:
    """The cleaner the caller is confined to, or None when they see everything.

    A cleaner holds `cleaning:read` + `cleaning:own` but not `cleaning:write`, so
    every task query they make is narrowed to their own assignments.
    """
    if principal.has(Permission.CLEANING_WRITE):
        return None
    if principal.has(Permission.CLEANING_OWN):
        return principal.user_id
    return None


def _forbid_other_cleaner(scope: uuid.UUID | None, cleaner_id: uuid.UUID | None) -> None:
    """404 rather than 403: a confined caller should not learn the task exists."""
    if scope is not None and cleaner_id != scope:
        raise HTTPException(status_code=404, detail="Cleaning task not found")


async def _assert_company_cleaner(session: AsyncSession, cleaner_id: uuid.UUID, company_id: uuid.UUID) -> None:
    """Guard the cleaner-id path params, which would otherwise cross tenants."""
    user = await SqlUserRepository(session).get_by_id(cleaner_id)
    if user is None or user.company_id != company_id:
        raise HTTPException(status_code=404, detail="Cleaner not found")


# ---------- Cleaning Task CRUD ----------


@cleaning_router.post(
    "",
    response_model=CleaningTaskResponse,
    status_code=201,
    dependencies=[Depends(require(Permission.CLEANING_WRITE))],
)
async def create_cleaning_task(
    body: CleaningTaskCreate,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    repos = _repos(session)
    svc = CreateCleaningTaskService(repos["task"], repos["property"])
    try:
        result = await svc.execute(
            CreateCleaningTaskInput(
                company_id=company_id,
                property_id=body.property_id,
                type=body.type,
                booking_id=body.booking_id,
                cleaner_id=body.cleaner_id,
                scheduled_date=body.scheduled_date,
                scheduled_time=body.scheduled_time,
                notes=body.notes,
            )
        )
        await session.commit()
        return _to_task_response(result)
    except ValueError as e:
        await session.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@cleaning_router.get(
    "",
    response_model=CleaningTaskListResponse,
    dependencies=[Depends(require(Permission.CLEANING_READ))],
)
async def list_cleaning_tasks(
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=50, ge=1, le=100),
    status: CleaningStatus | None = None,
    property_id: uuid.UUID | None = None,
    cleaner_id: uuid.UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
    scope: uuid.UUID | None = Depends(cleaner_scope),
):
    repos = _repos(session)
    # The filter is not a suggestion for a confined caller — it is the boundary.
    if scope is not None:
        cleaner_id = scope
    offset = (page - 1) * per_page
    tasks = await repos["task"].list_by_company(
        company_id,
        offset=offset,
        limit=per_page,
        status=status,
        property_id=property_id,
        cleaner_id=cleaner_id,
        date_from=date_from,
        date_to=date_to,
    )
    total = await repos["task"].count_by_company(
        company_id,
        status=status,
        property_id=property_id,
        cleaner_id=cleaner_id,
        date_from=date_from,
        date_to=date_to,
    )

    names = await _cleaner_names(session, [t.cleaner_id for t in tasks])
    items = []
    for t in tasks:
        prop = await repos["property"].get_by_id(t.property_id)
        items.append(
            _to_task_response(
                t,
                property_name=prop.name if prop else None,
                property_internal_name=prop.internal_name if prop else None,
                cleaner_name=names.get(t.cleaner_id),
            )
        )

    pages = (total + per_page - 1) // per_page if total > 0 else 1
    return CleaningTaskListResponse(
        items=items,
        total=total,
        page=page,
        per_page=per_page,
        pages=pages,
    )


@cleaning_router.get(
    "/{task_id}",
    response_model=CleaningTaskDetailResponse,
    dependencies=[Depends(require(Permission.CLEANING_READ))],
)
async def get_cleaning_task(
    task_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
    scope: uuid.UUID | None = Depends(cleaner_scope),
):
    repos = _repos(session)
    task = await repos["task"].get_by_id(task_id)
    if task is None or task.company_id != company_id:
        raise HTTPException(status_code=404, detail="Cleaning task not found")
    _forbid_other_cleaner(scope, task.cleaner_id)

    prop = await repos["property"].get_by_id(task.property_id)
    names = await _cleaner_names(session, [task.cleaner_id])
    task_resp = _to_task_response(
        task,
        property_name=prop.name if prop else None,
        property_internal_name=prop.internal_name if prop else None,
        cleaner_name=names.get(task.cleaner_id),
    )

    # Get report if exists
    report = await repos["report"].get_by_task(task_id)
    report_detail = None
    if report:
        photos = await repos["photo"].list_by_report(report.id)
        checklist = await repos["report_checklist"].list_by_report(report.id)
        report_detail = CleaningReportDetailResponse(
            report=CleaningReportResponse.model_validate(report, from_attributes=True),
            photos=[ReportPhotoResponse.model_validate(p, from_attributes=True) for p in photos],
            checklist=[ReportChecklistResponse.model_validate(c, from_attributes=True) for c in checklist],
        )

    return CleaningTaskDetailResponse(task=task_resp, report=report_detail)


@cleaning_router.post(
    "/{task_id}/status",
    response_model=CleaningTaskResponse,
    dependencies=[Depends(require(Permission.CLEANING_READ))],
)
async def change_task_status(
    task_id: uuid.UUID,
    body: CleaningTaskStatusChange,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
    scope: uuid.UUID | None = Depends(cleaner_scope),
):
    repos = _repos(session)
    if scope is not None:
        task = await repos["task"].get_by_id(task_id)
        if task is None or task.company_id != company_id:
            raise HTTPException(status_code=404, detail="Cleaning task not found")
        _forbid_other_cleaner(scope, task.cleaner_id)
    svc = ChangeCleaningTaskStatusService(repos["task"])
    try:
        result = await svc.execute(task_id, company_id, body.target_status)
        await session.commit()
        return _to_task_response(result)
    except ValueError as e:
        await session.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@cleaning_router.post(
    "/{task_id}/assign",
    response_model=CleaningTaskResponse,
    dependencies=[Depends(require(Permission.CLEANING_WRITE))],
)
async def assign_cleaner(
    task_id: uuid.UUID,
    body: CleaningTaskAssign,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    repos = _repos(session)
    svc = AssignCleanerService(repos["task"])
    try:
        result = await svc.execute(task_id, company_id, body.cleaner_id)
        await session.commit()
        return _to_task_response(result)
    except ValueError as e:
        await session.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@cleaning_router.get(
    "/property/{property_id}",
    response_model=list[CleaningTaskResponse],
    dependencies=[Depends(require(Permission.CLEANING_WRITE))],
)
async def list_property_cleaning_history(
    property_id: uuid.UUID,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=100),
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    repos = _repos(session)
    prop = await repos["property"].get_by_id(property_id)
    if prop is None or prop.company_id != company_id:
        raise HTTPException(status_code=404, detail="Property not found")

    tasks = await repos["task"].list_by_property(property_id, offset=offset, limit=limit)
    return [_to_task_response(t, property_name=prop.name, property_internal_name=prop.internal_name) for t in tasks]


# ---------- Reports ----------


@cleaning_router.post(
    "/{task_id}/report",
    response_model=CleaningReportResponse,
    status_code=201,
    dependencies=[Depends(require(Permission.CLEANING_READ))],
)
async def submit_report(
    task_id: uuid.UUID,
    body: SubmitReportCreate,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
    scope: uuid.UUID | None = Depends(cleaner_scope),
):
    repos = _repos(session)
    if scope is not None:
        task = await repos["task"].get_by_id(task_id)
        if task is None or task.company_id != company_id:
            raise HTTPException(status_code=404, detail="Cleaning task not found")
        _forbid_other_cleaner(scope, task.cleaner_id)
        if body.cleaner_id != scope:
            raise HTTPException(status_code=403, detail="A report can only be filed under your own account")
    svc = SubmitReportService(
        repos["task"], repos["report"], repos["photo"], repos["report_checklist"]
    )
    try:
        result = await svc.execute(
            SubmitReportInput(
                task_id=task_id,
                company_id=company_id,
                cleaner_id=body.cleaner_id,
                notes=body.notes,
                photos=[
                    ReportPhotoInputApp(
                        url=p.url,
                        room_type=p.room_type,
                        metadata=p.metadata,
                    )
                    for p in body.photos
                ],
                checklist=[
                    ReportChecklistInputApp(
                        checklist_item_id=c.checklist_item_id,
                        is_done=c.is_done,
                        note=c.note,
                    )
                    for c in body.checklist
                ],
            )
        )
        await session.commit()
        return CleaningReportResponse.model_validate(result, from_attributes=True)
    except ValueError as e:
        await session.rollback()
        raise HTTPException(status_code=400, detail=str(e))


# ---------- Checklist Templates ----------


@checklist_router.post(
    "", response_model=ChecklistTemplateResponse, status_code=201,
    dependencies=[Depends(require(Permission.CLEANING_WRITE))],
)
async def create_checklist_template(
    body: ChecklistTemplateCreate,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    repos = _repos(session)
    svc = ManageChecklistsService(repos["template"], repos["item"])
    template = await svc.create_template(
        CreateChecklistTemplateInput(
            company_id=company_id,
            name=body.name,
            items=[
                ChecklistItemInputApp(title=i.title, sort_order=i.sort_order)
                for i in body.items
            ],
        )
    )
    await session.commit()
    return ChecklistTemplateResponse.model_validate(template, from_attributes=True)


@checklist_router.get(
    "",
    response_model=list[ChecklistTemplateResponse],
    dependencies=[Depends(require(Permission.CLEANING_READ))],
)
async def list_checklist_templates(
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    repos = _repos(session)
    svc = ManageChecklistsService(repos["template"], repos["item"])
    templates = await svc.list_templates(company_id)
    return [ChecklistTemplateResponse.model_validate(t, from_attributes=True) for t in templates]


@checklist_router.get(
    "/{template_id}",
    response_model=ChecklistTemplateDetailResponse,
    dependencies=[Depends(require(Permission.CLEANING_READ))],
)
async def get_checklist_template(
    template_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    repos = _repos(session)
    svc = ManageChecklistsService(repos["template"], repos["item"])
    try:
        template, items = await svc.get_template_with_items(template_id, company_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Checklist template not found")
    return ChecklistTemplateDetailResponse(
        template=ChecklistTemplateResponse.model_validate(template, from_attributes=True),
        items=[ChecklistItemResponse.model_validate(i, from_attributes=True) for i in items],
    )


@checklist_router.delete(
    "/{template_id}", status_code=204,
    dependencies=[Depends(require(Permission.CLEANING_WRITE))],
)
async def delete_checklist_template(
    template_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    repos = _repos(session)
    svc = ManageChecklistsService(repos["template"], repos["item"])
    try:
        await svc.delete_template(template_id, company_id)
        await session.commit()
    except ValueError as e:
        await session.rollback()
        raise HTTPException(status_code=404, detail=str(e))


@checklist_router.patch(
    "/{template_id}", response_model=ChecklistTemplateResponse,
    dependencies=[Depends(require(Permission.CLEANING_WRITE))],
)
async def update_checklist_template(
    template_id: uuid.UUID,
    body: ChecklistTemplateUpdate,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    repos = _repos(session)
    svc = ManageChecklistsService(repos["template"], repos["item"])
    try:
        result = await svc.update_template(template_id, company_id, body.name)
        await session.commit()
        return ChecklistTemplateResponse.model_validate(result, from_attributes=True)
    except ValueError as e:
        await session.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@checklist_router.post(
    "/{template_id}/items", response_model=ChecklistItemResponse, status_code=201,
    dependencies=[Depends(require(Permission.CLEANING_WRITE))],
)
async def add_checklist_item(
    template_id: uuid.UUID,
    body: ChecklistItemAdd,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    repos = _repos(session)
    svc = ManageChecklistsService(repos["template"], repos["item"])
    try:
        result = await svc.add_item(template_id, company_id, body.title, body.sort_order)
        await session.commit()
        return ChecklistItemResponse.model_validate(result, from_attributes=True)
    except ValueError as e:
        await session.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@checklist_router.patch(
    "/{template_id}/items/{item_id}", response_model=ChecklistItemResponse,
    dependencies=[Depends(require(Permission.CLEANING_WRITE))],
)
async def update_checklist_item(
    template_id: uuid.UUID,
    item_id: uuid.UUID,
    body: ChecklistItemUpdate,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    repos = _repos(session)
    svc = ManageChecklistsService(repos["template"], repos["item"])
    try:
        result = await svc.update_item(template_id, item_id, company_id, body.title)
        await session.commit()
        return ChecklistItemResponse.model_validate(result, from_attributes=True)
    except ValueError as e:
        await session.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@checklist_router.post(
    "/{template_id}/reorder-items",
    response_model=list[ChecklistItemResponse],    dependencies=[Depends(require(Permission.CLEANING_WRITE))],
)
@checklist_router.post(
    "/{template_id}/items/reorder",
    response_model=list[ChecklistItemResponse],    dependencies=[Depends(require(Permission.CLEANING_WRITE))],
)
async def reorder_checklist_items(
    template_id: uuid.UUID,
    body: ChecklistItemReorder,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    repos = _repos(session)
    svc = ManageChecklistsService(repos["template"], repos["item"])
    try:
        items = await svc.reorder_items(template_id, company_id, body.item_ids)
        await session.commit()
        return [ChecklistItemResponse.model_validate(i, from_attributes=True) for i in items]
    except ValueError as e:
        await session.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@checklist_router.delete(
    "/{template_id}/items/{item_id}", status_code=204,
    dependencies=[Depends(require(Permission.CLEANING_WRITE))],
)
async def delete_checklist_item(
    template_id: uuid.UUID,
    item_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    repos = _repos(session)
    svc = ManageChecklistsService(repos["template"], repos["item"])
    await svc.delete_item(item_id)
    await session.commit()


# ---------- Ratings ----------


@rating_router.post(
    "",
    response_model=CleanerRatingResponse,
    status_code=201,
    dependencies=[Depends(require(Permission.CLEANING_WRITE))],
)
async def rate_cleaner(
    body: RateCleanerCreate,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
    user_id: uuid.UUID | None = Depends(get_user_id),
):
    repos = _repos(session)
    svc = RateCleanerService(repos["rating"], repos["task"])
    try:
        result = await svc.execute(
            RateCleanerInput(
                company_id=company_id,
                cleaner_id=body.cleaner_id,
                score=body.score,
                task_id=body.task_id,
                rated_by=user_id,
                review=body.review,
            )
        )
        await session.commit()
        return CleanerRatingResponse.model_validate(result, from_attributes=True)
    except ValueError as e:
        await session.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@rating_router.get(
    "/{cleaner_id}",
    response_model=list[CleanerRatingResponse],
    dependencies=[Depends(require(Permission.CLEANING_READ))],
)
async def list_cleaner_ratings(
    cleaner_id: uuid.UUID,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=100),
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
    scope: uuid.UUID | None = Depends(cleaner_scope),
):
    if scope is not None and cleaner_id != scope:
        raise HTTPException(status_code=404, detail="Cleaner not found")
    await _assert_company_cleaner(session, cleaner_id, company_id)
    repos = _repos(session)
    ratings = await repos["rating"].list_by_cleaner(cleaner_id, offset=offset, limit=limit)
    return [CleanerRatingResponse.model_validate(r, from_attributes=True) for r in ratings]


@rating_router.get(
    "/{cleaner_id}/kpi",
    response_model=CleanerKPIResponse,
    dependencies=[Depends(require(Permission.CLEANING_READ))],
)
async def get_cleaner_kpi(
    cleaner_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
    scope: uuid.UUID | None = Depends(cleaner_scope),
):
    if scope is not None and cleaner_id != scope:
        raise HTTPException(status_code=404, detail="Cleaner not found")
    await _assert_company_cleaner(session, cleaner_id, company_id)
    repos = _repos(session)
    svc = RateCleanerService(repos["rating"], repos["task"])
    kpi = await svc.get_kpi(cleaner_id)
    return CleanerKPIResponse(**kpi)
