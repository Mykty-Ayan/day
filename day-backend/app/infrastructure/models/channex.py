import uuid
from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.infrastructure.database import Base


class ChannexConnectionModel(Base):
    __tablename__ = "channex_connections"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(unique=True, index=True)
    channex_group_id: Mapped[str] = mapped_column(String(64))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)


class ChannexListingModel(Base):
    __tablename__ = "channex_listings"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(index=True)
    property_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("properties.id", ondelete="CASCADE"), unique=True, index=True
    )
    channex_property_id: Mapped[str] = mapped_column(String(64), default="", index=True)
    channex_room_type_id: Mapped[str] = mapped_column(String(64), default="")
    channex_rate_plan_id: Mapped[str] = mapped_column(String(64), default="")
    sync_state: Mapped[str] = mapped_column(String(20), default="pending")
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)


class ChannexBookingEventModel(Base):
    __tablename__ = "channex_booking_events"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(index=True)
    property_id: Mapped[uuid.UUID] = mapped_column(index=True)
    booking_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("bookings.id", ondelete="SET NULL"), nullable=True, index=True
    )
    revision_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    channex_booking_id: Mapped[str] = mapped_column(String(64), default="")
    unique_id: Mapped[str] = mapped_column(String(128), default="", index=True)
    ota_name: Mapped[str] = mapped_column(String(64), default="")
    status: Mapped[str] = mapped_column(String(20), default="new")
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    acked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
