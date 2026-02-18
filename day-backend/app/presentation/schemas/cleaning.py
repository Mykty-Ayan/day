from __future__ import annotations

import uuid
from datetime import date, datetime, time

from pydantic import BaseModel, ConfigDict, Field

from app.domain.cleaning.value_objects import (
    CleaningStatus,
    CleaningType,
    ReportStatus,
    RoomType,
)

# ---------- Cleaning Task ----------


class CleaningTaskCreate(BaseModel):
    property_id: uuid.UUID
    type: CleaningType = CleaningType.POST_CHECKOUT
    booking_id: uuid.UUID | None = None
    cleaner_id: uuid.UUID | None = None
    scheduled_date: date | None = None
    scheduled_time: time | None = None
    notes: str | None = None


class CleaningTaskResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    company_id: uuid.UUID
    property_id: uuid.UUID
    booking_id: uuid.UUID | None = None
    cleaner_id: uuid.UUID | None = None
    type: CleaningType
    status: CleaningStatus
    scheduled_date: date | None = None
    scheduled_time: time | None = None
    notes: str | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    verified_at: datetime | None = None
    property_name: str | None = None
    property_internal_name: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class CleaningTaskStatusChange(BaseModel):
    target_status: CleaningStatus


class CleaningTaskAssign(BaseModel):
    cleaner_id: uuid.UUID


class CleaningTaskListResponse(BaseModel):
    items: list[CleaningTaskResponse]
    total: int
    page: int
    per_page: int
    pages: int


# ---------- Checklist Template ----------


class ChecklistItemInput(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    sort_order: int = 0


class ChecklistTemplateCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    items: list[ChecklistItemInput] = []


class ChecklistTemplateUpdate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)


class ChecklistItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    template_id: uuid.UUID
    title: str
    sort_order: int


class ChecklistTemplateResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    company_id: uuid.UUID
    name: str
    created_at: datetime | None = None


class ChecklistTemplateDetailResponse(BaseModel):
    template: ChecklistTemplateResponse
    items: list[ChecklistItemResponse]


class ChecklistItemAdd(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    sort_order: int | None = None


class ChecklistItemUpdate(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)


class ChecklistItemReorder(BaseModel):
    item_ids: list[uuid.UUID] = Field(..., min_length=1)


# ---------- Cleaning Report ----------


class ReportPhotoInput(BaseModel):
    url: str = Field(..., min_length=1, max_length=1024)
    room_type: RoomType = RoomType.OTHER
    metadata: dict | None = None


class ReportChecklistInput(BaseModel):
    checklist_item_id: uuid.UUID
    is_done: bool = False
    note: str | None = None


class SubmitReportCreate(BaseModel):
    cleaner_id: uuid.UUID
    notes: str | None = None
    photos: list[ReportPhotoInput] = []
    checklist: list[ReportChecklistInput] = []


class ReportPhotoResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    report_id: uuid.UUID
    url: str
    room_type: RoomType
    metadata: dict | None = None
    metadata_verified: bool


class ReportChecklistResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    report_id: uuid.UUID
    checklist_item_id: uuid.UUID
    is_done: bool
    note: str | None = None


class CleaningReportResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    task_id: uuid.UUID
    cleaner_id: uuid.UUID
    status: ReportStatus
    notes: str | None = None
    submitted_at: datetime | None = None
    created_at: datetime | None = None


class CleaningReportDetailResponse(BaseModel):
    report: CleaningReportResponse
    photos: list[ReportPhotoResponse]
    checklist: list[ReportChecklistResponse]


# ---------- Task Detail ----------


class CleaningTaskDetailResponse(BaseModel):
    task: CleaningTaskResponse
    report: CleaningReportDetailResponse | None = None


# ---------- Cleaner Rating ----------


class RateCleanerCreate(BaseModel):
    cleaner_id: uuid.UUID
    score: int = Field(..., ge=1, le=5)
    task_id: uuid.UUID | None = None
    review: str | None = None


class CleanerRatingResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    company_id: uuid.UUID
    cleaner_id: uuid.UUID
    task_id: uuid.UUID | None = None
    rated_by: uuid.UUID | None = None
    score: int
    review: str | None = None
    kpi_metrics: dict | None = None
    created_at: datetime | None = None


class CleanerKPIResponse(BaseModel):
    cleaner_id: str
    avg_score: float
    total_ratings: int
    recent_ratings: list[dict]
