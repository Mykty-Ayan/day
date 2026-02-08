import uuid
from datetime import date, datetime, time

from sqlalchemy import (
    Boolean,
    Date,
    ForeignKey,
    Integer,
    String,
    Text,
    Time,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.infrastructure.database import Base


class CleaningTaskModel(Base):
    __tablename__ = "cleaning_tasks"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(index=True)
    property_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("properties.id", ondelete="CASCADE"), index=True
    )
    booking_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("bookings.id", ondelete="SET NULL"), nullable=True, index=True
    )
    cleaner_id: Mapped[uuid.UUID | None] = mapped_column(nullable=True, index=True)
    type: Mapped[str] = mapped_column(String(50), default="post_checkout")
    status: Mapped[str] = mapped_column(String(50), default="pending")
    scheduled_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    scheduled_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(nullable=True)
    verified_at: Mapped[datetime | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        default=datetime.utcnow, onupdate=datetime.utcnow
    )

    reports: Mapped[list["CleaningReportModel"]] = relationship(
        back_populates="task", cascade="all, delete-orphan"
    )


class CleaningChecklistTemplateModel(Base):
    __tablename__ = "cleaning_checklist_templates"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(index=True)
    name: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)

    items: Mapped[list["CleaningChecklistItemModel"]] = relationship(
        back_populates="template", cascade="all, delete-orphan"
    )


class CleaningChecklistItemModel(Base):
    __tablename__ = "cleaning_checklist_items"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    template_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("cleaning_checklist_templates.id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str] = mapped_column(String(500))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    template: Mapped["CleaningChecklistTemplateModel"] = relationship(
        back_populates="items"
    )


class CleaningReportModel(Base):
    __tablename__ = "cleaning_reports"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    task_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("cleaning_tasks.id", ondelete="CASCADE"), index=True
    )
    cleaner_id: Mapped[uuid.UUID] = mapped_column(index=True)
    status: Mapped[str] = mapped_column(String(50), default="submitted")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    submitted_at: Mapped[datetime | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)

    task: Mapped["CleaningTaskModel"] = relationship(back_populates="reports")
    photos: Mapped[list["CleaningReportPhotoModel"]] = relationship(
        back_populates="report", cascade="all, delete-orphan"
    )
    checklist: Mapped[list["CleaningReportChecklistModel"]] = relationship(
        back_populates="report", cascade="all, delete-orphan"
    )


class CleaningReportPhotoModel(Base):
    __tablename__ = "cleaning_report_photos"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    report_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("cleaning_reports.id", ondelete="CASCADE"), index=True
    )
    url: Mapped[str] = mapped_column(String(1024))
    room_type: Mapped[str] = mapped_column(String(50), default="other")
    metadata_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    metadata_verified: Mapped[bool] = mapped_column(Boolean, default=False)

    report: Mapped["CleaningReportModel"] = relationship(back_populates="photos")


class CleaningReportChecklistModel(Base):
    __tablename__ = "cleaning_report_checklist"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    report_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("cleaning_reports.id", ondelete="CASCADE"), index=True
    )
    checklist_item_id: Mapped[uuid.UUID] = mapped_column()
    is_done: Mapped[bool] = mapped_column(Boolean, default=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    report: Mapped["CleaningReportModel"] = relationship(back_populates="checklist")


class CleanerRouteModel(Base):
    __tablename__ = "cleaner_routes"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(index=True)
    cleaner_id: Mapped[uuid.UUID] = mapped_column(index=True)
    route_date: Mapped[date] = mapped_column(Date)
    ordered_task_ids: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    route_polyline: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        default=datetime.utcnow, onupdate=datetime.utcnow
    )


class CleanerRatingModel(Base):
    __tablename__ = "cleaner_ratings"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(index=True)
    cleaner_id: Mapped[uuid.UUID] = mapped_column(index=True)
    task_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("cleaning_tasks.id", ondelete="SET NULL"), nullable=True
    )
    rated_by: Mapped[uuid.UUID | None] = mapped_column(nullable=True)
    score: Mapped[int] = mapped_column(Integer, default=5)
    review: Mapped[str | None] = mapped_column(Text, nullable=True)
    kpi_metrics: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
