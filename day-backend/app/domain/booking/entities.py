from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal

from app.domain.booking.value_objects import (
    BookingAuditAction,
    BookingSource,
    BookingStatus,
    ContractStatus,
    DepositStatus,
    GroupStatus,
    PaymentMethod,
    PaymentStatus,
    PaymentType,
    RentalMode,
)


@dataclass
class Guest:
    """Aggregate root for the Guest domain."""

    id: uuid.UUID = field(default_factory=uuid.uuid4)
    company_id: uuid.UUID = field(default_factory=uuid.uuid4)
    name: str = ""
    phone: str | None = None
    email: str | None = None
    notes: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


@dataclass
class GroupBooking:
    id: uuid.UUID = field(default_factory=uuid.uuid4)
    company_id: uuid.UUID = field(default_factory=uuid.uuid4)
    adults_count: int = 1
    children_count: int = 0
    status: GroupStatus = GroupStatus.PENDING
    notes: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


@dataclass
class Booking:
    """Aggregate root for the Booking domain."""

    id: uuid.UUID = field(default_factory=uuid.uuid4)
    company_id: uuid.UUID = field(default_factory=uuid.uuid4)
    property_id: uuid.UUID = field(default_factory=uuid.uuid4)
    guest_id: uuid.UUID = field(default_factory=uuid.uuid4)
    group_booking_id: uuid.UUID | None = None
    check_in: datetime | None = None
    check_out: datetime | None = None
    rental_mode: RentalMode = RentalMode.DAILY
    source: BookingSource = BookingSource.DIRECT
    status: BookingStatus = BookingStatus.PENDING
    gantt_color: str = "#3B82F6"
    gantt_icon: str | None = None
    total_price: Decimal = Decimal("0")
    calculated_price: Decimal = Decimal("0")
    adults_count: int = 1
    children_count: int = 0
    notes: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    def change_status(self, new_status: BookingStatus) -> None:
        if not self.status.can_transition_to(new_status):
            raise ValueError(
                f"Cannot transition from {self.status.value} to {new_status.value}"
            )
        self.status = new_status


@dataclass
class BookingPayment:
    id: uuid.UUID = field(default_factory=uuid.uuid4)
    booking_id: uuid.UUID = field(default_factory=uuid.uuid4)
    amount: Decimal = Decimal("0")
    type: PaymentType = PaymentType.PAYMENT
    method: PaymentMethod = PaymentMethod.CASH
    status: PaymentStatus = PaymentStatus.PENDING
    note: str | None = None
    paid_at: datetime | None = None
    created_at: datetime | None = None


@dataclass
class BookingDeposit:
    id: uuid.UUID = field(default_factory=uuid.uuid4)
    booking_id: uuid.UUID = field(default_factory=uuid.uuid4)
    amount: Decimal = Decimal("0")
    status: DepositStatus = DepositStatus.PENDING
    held_amount: Decimal = Decimal("0")
    reason: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


@dataclass
class BookingFile:
    id: uuid.UUID = field(default_factory=uuid.uuid4)
    booking_id: uuid.UUID = field(default_factory=uuid.uuid4)
    file_url: str = ""
    file_name: str = ""
    file_type: str = ""
    created_at: datetime | None = None


@dataclass
class BookingComment:
    id: uuid.UUID = field(default_factory=uuid.uuid4)
    booking_id: uuid.UUID = field(default_factory=uuid.uuid4)
    author_id: uuid.UUID | None = None
    content: str = ""
    created_at: datetime | None = None


@dataclass
class BookingContract:
    id: uuid.UUID = field(default_factory=uuid.uuid4)
    booking_id: uuid.UUID = field(default_factory=uuid.uuid4)
    template_url: str | None = None
    generated_url: str | None = None
    status: ContractStatus = ContractStatus.DRAFT
    signed_at: datetime | None = None
    created_at: datetime | None = None


@dataclass
class BookingAuditLog:
    id: uuid.UUID = field(default_factory=uuid.uuid4)
    booking_id: uuid.UUID = field(default_factory=uuid.uuid4)
    changed_by: uuid.UUID | None = None
    field_name: str = ""
    old_value: str | None = None
    new_value: str | None = None
    action: BookingAuditAction = BookingAuditAction.CREATE
    created_at: datetime | None = None
