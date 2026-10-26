from __future__ import annotations

import secrets
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime
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

# Lower case letters and digits a reader cannot mix up, as in a flat's page link.
_CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"


def new_guest_code() -> str:
    """The key to a guest's own page (/g/<code>): it shows the door code once the
    stay is paid, so it is long enough that guessing one is out of reach."""
    return "".join(secrets.choice(_CODE_ALPHABET) for _ in range(16))


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
    # An OTA stay Day had to accept on top of another one: the OTA has already
    # confirmed it to the guest. Such a booking is exempt from the database's
    # no-overlap constraint, and the host has to resolve the clash.
    overbooking: bool = False
    # The id of this booking in the system that asked for it (a CRM deal).
    external_id: str | None = None
    # The agent who brought the guest, for a cut the owner records as an expense.
    agent_id: uuid.UUID | None = None
    # The Idempotency-Key of the create request and a hash of its body, so a
    # retry gets this booking back and a reused key with another body is caught.
    idempotency_key: str | None = None
    idempotency_hash: str | None = None
    # A pending booking with this set is a hold: a background sweep cancels it
    # once this moment (naive UTC) passes unless someone confirms it first.
    expires_at: datetime | None = None
    # The guest's page link; the database gives one to every booking.
    guest_code: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    def change_status(self, new_status: BookingStatus) -> None:
        if not self.status.can_transition_to(new_status):
            raise ValueError(
                f"Cannot transition from {self.status.value} to {new_status.value}"
            )
        self.status = new_status
        # A confirmed stay holds its nights for good. A cancelled hold keeps
        # its expiry, which says why it went.
        if new_status == BookingStatus.CONFIRMED:
            self.expires_at = None


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
    # The id of this payment in the system that recorded it (CRM, bank).
    external_id: str | None = None
    # As on Booking: the create request's Idempotency-Key and body hash.
    idempotency_key: str | None = None
    idempotency_hash: str | None = None
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


@dataclass
class PropertyBlock:
    """Nights a flat is closed without a booking: repairs, the owner's own
    guests, a stay sold elsewhere. start_date is the first closed night and
    end_date the day after the last one, like a check-out; the block runs from
    the flat's check-out hour on start_date to the same hour on end_date, so the
    guest leaving that morning and the one arriving on end_date are untouched.
    starts_at and ends_at keep that span as it was when the block was made: a
    later change of the check-out hour does not move it onto a booked stay."""

    id: uuid.UUID = field(default_factory=uuid.uuid4)
    company_id: uuid.UUID = field(default_factory=uuid.uuid4)
    property_id: uuid.UUID = field(default_factory=uuid.uuid4)
    start_date: date = field(default_factory=date.today)
    end_date: date = field(default_factory=date.today)
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    reason: str | None = None
    created_by: uuid.UUID | None = None
    created_at: datetime | None = None
    # Taken from a platform's calendar (a CalendarFeed) and its event there: the
    # calendar keeps it, and it cannot be removed by hand.
    feed_id: uuid.UUID | None = None
    external_uid: str | None = None
    # The platform (a BookingSource value) and whether the event is a booking there
    # (False: nights the platform only marks unavailable, maybe another's echo).
    source: str | None = None
    reserved: bool | None = None


@dataclass
class CalendarFeed:
    """A platform's iCal calendar of the flat (Airbnb, Booking.com, ...), read on a
    timer: its events close the flat's nights. The link holds the platform's secret."""

    id: uuid.UUID = field(default_factory=uuid.uuid4)
    company_id: uuid.UUID = field(default_factory=uuid.uuid4)
    property_id: uuid.UUID = field(default_factory=uuid.uuid4)
    name: str = ""
    url: str = ""
    # The platform, told by the link's address (a BookingSource value), if known.
    source: str | None = None
    last_synced_at: datetime | None = None
    last_error: str | None = None
    created_at: datetime | None = None


@dataclass
class GuestOffer:
    """A personal link for a guest (/o/<code>): one flat or several for the guest's
    dates. The guest's name and phone stay here; the link holds only the code."""

    id: uuid.UUID = field(default_factory=uuid.uuid4)
    company_id: uuid.UUID = field(default_factory=uuid.uuid4)
    code: str = ""
    guest_name: str = ""
    guest_phone: str = ""
    check_in: date = field(default_factory=date.today)
    check_out: date = field(default_factory=date.today)
    guests: int = 1
    property_ids: list[uuid.UUID] = field(default_factory=list)
    created_by: uuid.UUID | None = None
    created_at: datetime | None = None
    # The booking the guest made by this link; a cancelled one frees the link again.
    booking_id: uuid.UUID | None = None
    # The asking system's id, e.g. the CRM's conversation: the booking made by the link carries it.
    external_id: str | None = None
    # By the hour: the stay's local start and end; check_in is its day (check_out the next,
    # only to keep one shape of dates), and the link lasts until that day, as by the night.
    rental_mode: RentalMode = RentalMode.DAILY
    starts_at: datetime | None = None
    ends_at: datetime | None = None
