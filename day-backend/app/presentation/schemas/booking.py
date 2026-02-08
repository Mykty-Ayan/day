from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.domain.booking.value_objects import (
    BookingAuditAction,
    BookingSource,
    BookingStatus,
    DepositStatus,
    PaymentMethod,
    PaymentStatus,
    PaymentType,
)

# ---------- Guest ----------


class GuestCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    phone: str | None = None
    email: str | None = None
    notes: str | None = None


class GuestResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    company_id: uuid.UUID
    name: str
    phone: str | None = None
    email: str | None = None
    notes: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class GuestListResponse(BaseModel):
    items: list[GuestResponse]
    total: int
    offset: int
    limit: int


# ---------- Booking ----------


class BookingCreate(BaseModel):
    property_id: uuid.UUID
    guest_name: str = Field(..., min_length=1, max_length=255)
    guest_phone: str | None = None
    guest_email: str | None = None
    check_in: date
    check_out: date
    source: BookingSource = BookingSource.DIRECT
    adults_count: int = Field(default=1, ge=1)
    children_count: int = Field(default=0, ge=0)
    gantt_color: str = "#3B82F6"
    notes: str | None = None


class BookingUpdate(BaseModel):
    check_in: date | None = None
    check_out: date | None = None
    source: BookingSource | None = None
    gantt_color: str | None = None
    gantt_icon: str | None = None
    adults_count: int | None = None
    children_count: int | None = None
    total_price: Decimal | None = None
    notes: str | None = None


class BookingResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    company_id: uuid.UUID
    property_id: uuid.UUID
    guest_id: uuid.UUID
    group_booking_id: uuid.UUID | None = None
    check_in: date
    check_out: date
    source: BookingSource
    status: BookingStatus
    gantt_color: str
    gantt_icon: str | None = None
    total_price: Decimal
    calculated_price: Decimal
    adults_count: int
    children_count: int
    notes: str | None = None
    guest_name: str | None = None
    property_name: str | None = None
    property_internal_name: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class BookingStatusChange(BaseModel):
    target_status: BookingStatus


class BookingMove(BaseModel):
    target_property_id: uuid.UUID


class BookingListResponse(BaseModel):
    items: list[BookingResponse]
    total: int
    page: int
    per_page: int
    pages: int


# ---------- Payment ----------


class PaymentCreate(BaseModel):
    amount: Decimal = Field(..., gt=0)
    type: PaymentType = PaymentType.PAYMENT
    method: PaymentMethod = PaymentMethod.CASH
    note: str | None = None


class PaymentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    booking_id: uuid.UUID
    amount: Decimal
    type: PaymentType
    method: PaymentMethod
    status: PaymentStatus
    note: str | None = None
    paid_at: datetime | None = None
    created_at: datetime | None = None


# ---------- Deposit ----------


class DepositCreate(BaseModel):
    amount: Decimal = Field(..., gt=0)


class DepositAction(BaseModel):
    action: str = Field(..., pattern="^(pay|return|hold|partial_hold)$")
    held_amount: Decimal | None = None
    reason: str | None = None


class DepositResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    booking_id: uuid.UUID
    amount: Decimal
    status: DepositStatus
    held_amount: Decimal
    reason: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


# ---------- File ----------


class BookingFileCreate(BaseModel):
    file_url: str = Field(..., min_length=1, max_length=1024)
    file_name: str = Field(..., min_length=1, max_length=255)
    file_type: str = Field(..., min_length=1, max_length=100)


class BookingFileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    booking_id: uuid.UUID
    file_url: str
    file_name: str
    file_type: str
    created_at: datetime | None = None


# ---------- Comment ----------


class BookingCommentCreate(BaseModel):
    content: str = Field(..., min_length=1)


class BookingCommentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    booking_id: uuid.UUID
    author_id: uuid.UUID | None = None
    content: str
    created_at: datetime | None = None


# ---------- Price Calculator ----------


class PriceCalculateRequest(BaseModel):
    property_id: uuid.UUID
    check_in: date
    check_out: date
    adults_count: int = Field(default=1, ge=1)
    children_count: int = Field(default=0, ge=0)


class PriceCalculateResponse(BaseModel):
    nights: int
    base_total: Decimal
    weekend_surcharge: Decimal
    seasonal_adjustment: Decimal
    extra_guest_surcharge: Decimal
    discount_amount: Decimal
    total: Decimal


# ---------- Gantt ----------


class GanttBookingResponse(BaseModel):
    id: uuid.UUID
    guest_name: str
    check_in: date
    check_out: date
    status: str
    source: str
    gantt_color: str
    gantt_icon: str | None = None
    adults_count: int
    children_count: int
    total_price: float


class GanttPropertyResponse(BaseModel):
    id: uuid.UUID
    name: str
    internal_name: str
    type: str
    bookings: list[GanttBookingResponse]


class GanttDataResponse(BaseModel):
    properties: list[GanttPropertyResponse]


# ---------- Today ----------


class TodayBookingItem(BaseModel):
    id: uuid.UUID
    guest_name: str
    property_name: str
    property_internal_name: str
    check_in: date
    check_out: date
    status: BookingStatus
    adults_count: int
    children_count: int


class TodayCheckResponse(BaseModel):
    check_ins: list[TodayBookingItem]
    check_outs: list[TodayBookingItem]


# ---------- Audit ----------


class BookingAuditLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    booking_id: uuid.UUID
    changed_by: uuid.UUID | None = None
    field_name: str
    old_value: str | None = None
    new_value: str | None = None
    action: BookingAuditAction
    created_at: datetime | None = None


# ---------- Full detail ----------


class BookingDetailResponse(BaseModel):
    booking: BookingResponse
    guest: GuestResponse | None = None
    payments: list[PaymentResponse]
    deposits: list[DepositResponse]
    files: list[BookingFileResponse]
    comments: list[BookingCommentResponse]
    contract: None = None  # BookingContractResponse placeholder
    audit_logs: list[BookingAuditLogResponse]
