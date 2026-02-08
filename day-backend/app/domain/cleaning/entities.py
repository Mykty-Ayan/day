from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import date, datetime, time

from app.domain.cleaning.value_objects import (
    CleaningStatus,
    CleaningType,
    ReportStatus,
    RoomType,
)


@dataclass
class CleaningTask:
    """Aggregate root for the Cleaning domain."""

    id: uuid.UUID = field(default_factory=uuid.uuid4)
    company_id: uuid.UUID = field(default_factory=uuid.uuid4)
    property_id: uuid.UUID = field(default_factory=uuid.uuid4)
    booking_id: uuid.UUID | None = None
    cleaner_id: uuid.UUID | None = None
    type: CleaningType = CleaningType.POST_CHECKOUT
    status: CleaningStatus = CleaningStatus.PENDING
    scheduled_date: date | None = None
    scheduled_time: time | None = None
    notes: str | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    verified_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    def change_status(self, new_status: CleaningStatus) -> None:
        if not self.status.can_transition_to(new_status):
            raise ValueError(
                f"Cannot transition from {self.status.value} to {new_status.value}"
            )
        self.status = new_status


@dataclass
class CleaningChecklistTemplate:
    id: uuid.UUID = field(default_factory=uuid.uuid4)
    company_id: uuid.UUID = field(default_factory=uuid.uuid4)
    name: str = ""
    created_at: datetime | None = None


@dataclass
class CleaningChecklistItem:
    id: uuid.UUID = field(default_factory=uuid.uuid4)
    template_id: uuid.UUID = field(default_factory=uuid.uuid4)
    title: str = ""
    sort_order: int = 0


@dataclass
class CleaningReport:
    id: uuid.UUID = field(default_factory=uuid.uuid4)
    task_id: uuid.UUID = field(default_factory=uuid.uuid4)
    cleaner_id: uuid.UUID = field(default_factory=uuid.uuid4)
    status: ReportStatus = ReportStatus.SUBMITTED
    notes: str | None = None
    submitted_at: datetime | None = None
    created_at: datetime | None = None


@dataclass
class CleaningReportPhoto:
    id: uuid.UUID = field(default_factory=uuid.uuid4)
    report_id: uuid.UUID = field(default_factory=uuid.uuid4)
    url: str = ""
    room_type: RoomType = RoomType.OTHER
    metadata: dict | None = None
    metadata_verified: bool = False


@dataclass
class CleaningReportChecklist:
    id: uuid.UUID = field(default_factory=uuid.uuid4)
    report_id: uuid.UUID = field(default_factory=uuid.uuid4)
    checklist_item_id: uuid.UUID = field(default_factory=uuid.uuid4)
    is_done: bool = False
    note: str | None = None


@dataclass
class CleanerRoute:
    id: uuid.UUID = field(default_factory=uuid.uuid4)
    company_id: uuid.UUID = field(default_factory=uuid.uuid4)
    cleaner_id: uuid.UUID = field(default_factory=uuid.uuid4)
    route_date: date | None = None
    ordered_task_ids: list | None = None
    route_polyline: dict | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


@dataclass
class CleanerRating:
    id: uuid.UUID = field(default_factory=uuid.uuid4)
    company_id: uuid.UUID = field(default_factory=uuid.uuid4)
    cleaner_id: uuid.UUID = field(default_factory=uuid.uuid4)
    task_id: uuid.UUID | None = None
    rated_by: uuid.UUID | None = None
    score: int = 5
    review: str | None = None
    kpi_metrics: dict | None = None
    created_at: datetime | None = None
