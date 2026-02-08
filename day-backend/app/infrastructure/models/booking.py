import uuid
from datetime import date, datetime

from sqlalchemy import (
    Date,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.infrastructure.database import Base


class GuestModel(Base):
    __tablename__ = "guests"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(index=True)
    name: Mapped[str] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        default=datetime.utcnow, onupdate=datetime.utcnow
    )

    bookings: Mapped[list["BookingModel"]] = relationship(
        back_populates="guest", cascade="all, delete-orphan"
    )


class GroupBookingModel(Base):
    __tablename__ = "group_bookings"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(index=True)
    adults_count: Mapped[int] = mapped_column(Integer, default=1)
    children_count: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(50), default="pending")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        default=datetime.utcnow, onupdate=datetime.utcnow
    )

    bookings: Mapped[list["BookingModel"]] = relationship(
        back_populates="group_booking"
    )


class BookingModel(Base):
    __tablename__ = "bookings"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(index=True)
    property_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("properties.id", ondelete="CASCADE"), index=True
    )
    guest_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("guests.id", ondelete="CASCADE"), index=True
    )
    group_booking_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("group_bookings.id", ondelete="SET NULL"), nullable=True, index=True
    )
    check_in: Mapped[date] = mapped_column(Date)
    check_out: Mapped[date] = mapped_column(Date)
    source: Mapped[str] = mapped_column(String(50), default="direct")
    status: Mapped[str] = mapped_column(String(50), default="pending")
    gantt_color: Mapped[str] = mapped_column(String(20), default="#3B82F6")
    gantt_icon: Mapped[str | None] = mapped_column(String(50), nullable=True)
    total_price: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    calculated_price: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    adults_count: Mapped[int] = mapped_column(Integer, default=1)
    children_count: Mapped[int] = mapped_column(Integer, default=0)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Relationships
    property: Mapped["PropertyModel"] = relationship(back_populates="bookings")  # type: ignore[name-defined]  # noqa: F821
    guest: Mapped["GuestModel"] = relationship(back_populates="bookings")
    group_booking: Mapped["GroupBookingModel | None"] = relationship(
        back_populates="bookings"
    )
    payments: Mapped[list["BookingPaymentModel"]] = relationship(
        back_populates="booking", cascade="all, delete-orphan"
    )
    deposits: Mapped[list["BookingDepositModel"]] = relationship(
        back_populates="booking", cascade="all, delete-orphan"
    )
    files: Mapped[list["BookingFileModel"]] = relationship(
        back_populates="booking", cascade="all, delete-orphan"
    )
    comments: Mapped[list["BookingCommentModel"]] = relationship(
        back_populates="booking", cascade="all, delete-orphan"
    )
    contracts: Mapped[list["BookingContractModel"]] = relationship(
        back_populates="booking", cascade="all, delete-orphan"
    )
    audit_logs: Mapped[list["BookingAuditLogModel"]] = relationship(
        back_populates="booking", cascade="all, delete-orphan"
    )


class BookingPaymentModel(Base):
    __tablename__ = "booking_payments"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    booking_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("bookings.id", ondelete="CASCADE"), index=True
    )
    amount: Mapped[float] = mapped_column(Numeric(12, 2))
    type: Mapped[str] = mapped_column(String(50), default="payment")
    method: Mapped[str] = mapped_column(String(50), default="cash")
    status: Mapped[str] = mapped_column(String(50), default="pending")
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    paid_at: Mapped[datetime | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)

    booking: Mapped["BookingModel"] = relationship(back_populates="payments")


class BookingDepositModel(Base):
    __tablename__ = "booking_deposits"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    booking_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("bookings.id", ondelete="CASCADE"), index=True
    )
    amount: Mapped[float] = mapped_column(Numeric(12, 2))
    status: Mapped[str] = mapped_column(String(50), default="pending")
    held_amount: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        default=datetime.utcnow, onupdate=datetime.utcnow
    )

    booking: Mapped["BookingModel"] = relationship(back_populates="deposits")


class BookingFileModel(Base):
    __tablename__ = "booking_files"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    booking_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("bookings.id", ondelete="CASCADE"), index=True
    )
    file_url: Mapped[str] = mapped_column(String(1024))
    file_name: Mapped[str] = mapped_column(String(255))
    file_type: Mapped[str] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)

    booking: Mapped["BookingModel"] = relationship(back_populates="files")


class BookingCommentModel(Base):
    __tablename__ = "booking_comments"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    booking_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("bookings.id", ondelete="CASCADE"), index=True
    )
    author_id: Mapped[uuid.UUID | None] = mapped_column(nullable=True)
    content: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)

    booking: Mapped["BookingModel"] = relationship(back_populates="comments")


class BookingContractModel(Base):
    __tablename__ = "booking_contracts"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    booking_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("bookings.id", ondelete="CASCADE"), index=True
    )
    template_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    generated_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="draft")
    signed_at: Mapped[datetime | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)

    booking: Mapped["BookingModel"] = relationship(back_populates="contracts")


class BookingAuditLogModel(Base):
    __tablename__ = "booking_audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    booking_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("bookings.id", ondelete="CASCADE"), index=True
    )
    changed_by: Mapped[uuid.UUID | None] = mapped_column(nullable=True)
    field_name: Mapped[str] = mapped_column(String(255))
    old_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    new_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    action: Mapped[str] = mapped_column(String(50))
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)

    booking: Mapped["BookingModel"] = relationship(back_populates="audit_logs")
