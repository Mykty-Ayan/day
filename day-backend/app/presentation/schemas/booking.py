from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import (
    AliasChoices,
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    computed_field,
    field_serializer,
    model_validator,
)

from app.application.leads.check_guest import normalise_phone
from app.domain.booking.value_objects import (
    BookingAuditAction,
    BookingSource,
    BookingStatus,
    DepositStatus,
    PaymentMethod,
    PaymentStatus,
    PaymentType,
    RentalMode,
)
from app.domain.property.value_objects import PropertyStatus

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

    @computed_field
    @property
    def phone_e164(self) -> str | None:
        """Digits of +7XXXXXXXXXX without the plus; null for other numbers."""
        return normalise_phone(self.phone).lstrip("+") or None


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
    check_in: datetime
    check_out: datetime
    rental_mode: RentalMode = RentalMode.DAILY
    source: BookingSource = BookingSource.DIRECT
    adults_count: int = Field(default=1, ge=1)
    children_count: int = Field(default=0, ge=0)
    gantt_color: str = "#3B82F6"
    notes: str | None = None
    # The id of this booking in the system that asks for it, e.g. a CRM deal.
    external_id: str | None = Field(default=None, max_length=255)
    # Makes the booking a hold that Day cancels at this moment unless it is
    # confirmed first. Must carry its zone: a hold set at night for "09:00"
    # means the company's morning, not UTC's.
    expires_at: AwareDatetime | None = None
    # The operator confirmed a stay that breaks the apartment's stay rules
    # (nights, cleaning buffer, lead time); without it such a stay answers 422.
    override_rules: bool = False


class BookingUpdate(BaseModel):
    check_in: datetime | None = None
    check_out: datetime | None = None
    rental_mode: RentalMode | None = None
    source: BookingSource | None = None
    gantt_color: str | None = None
    gantt_icon: str | None = None
    adults_count: int | None = None
    children_count: int | None = None
    total_price: Decimal | None = None
    notes: str | None = None
    # Extends a hold, or releases it with null. Pending bookings only.
    expires_at: AwareDatetime | None = None
    # New dates that break the apartment's stay rules, confirmed by the operator.
    override_rules: bool = False


class BookingResponse(BaseModel):
    model_config = ConfigDict(
        from_attributes=True,
        json_encoders={Decimal: float},
    )

    id: uuid.UUID
    company_id: uuid.UUID
    property_id: uuid.UUID
    guest_id: uuid.UUID
    group_booking_id: uuid.UUID | None = None
    check_in: datetime
    check_out: datetime
    rental_mode: RentalMode = RentalMode.DAILY
    source: BookingSource
    status: BookingStatus
    gantt_color: str
    gantt_icon: str | None = None
    total_price: Decimal
    calculated_price: Decimal
    # What has actually been received, so a list can show who still owes without
    # asking for every booking's payments one at a time.
    paid_amount: Decimal = Decimal("0")
    adults_count: int
    children_count: int
    notes: str | None = None
    guest_name: str | None = None
    guest_phone: str | None = None
    property_name: str | None = None
    property_internal_name: str | None = None
    external_id: str | None = None
    # UTC, with its zone.
    expires_at: datetime | None = None
    # An OTA booking that landed on nights already taken: kept, not dropped,
    # and shown so someone moves or cancels one of the two.
    overbooking: bool = False
    created_at: datetime | None = None
    updated_at: datetime | None = None


class BookingFeedItem(BaseModel):
    """One change in GET /bookings/feed.

    Written for integrations rather than the Day front end: instants carry
    their zone and money is a decimal string, so nothing is left to guess.
    check_in/check_out stay local times of the company, as everywhere in Day.
    """

    id: uuid.UUID
    property_id: uuid.UUID
    property_name: str | None = None
    guest_id: uuid.UUID
    guest_name: str | None = None
    guest_phone: str | None = None
    # Digits of +7XXXXXXXXXX without the plus, null when the phone is not one
    # Day can normalise. A WhatsApp id is the same digits.
    guest_phone_e164: str | None = None
    check_in: datetime
    check_out: datetime
    rental_mode: RentalMode
    status: BookingStatus
    source: BookingSource
    total_price: Decimal
    paid_amount: Decimal
    adults_count: int
    children_count: int
    external_id: str | None = None
    expires_at: datetime | None = None
    # An OTA booking on nights already taken; see BookingResponse.
    overbooking: bool = False
    created_at: datetime
    updated_at: datetime

    @field_serializer("total_price", "paid_amount")
    def _money(self, value: Decimal) -> str:
        return format(value.quantize(Decimal("0.01")), "f")


class BookingFeedResponse(BaseModel):
    items: list[BookingFeedItem]
    next_cursor: str
    has_more: bool
    currency: str
    # IANA zone the items' check_in/check_out are local to.
    time_zone: str


class BookingStatusChange(BaseModel):
    # Accept both `target_status` (current) and `status` (legacy tests/clients)
    target_status: BookingStatus = Field(
        validation_alias=AliasChoices("target_status", "status")
    )


class BookingMove(BaseModel):
    target_property_id: uuid.UUID
    # The target flat's stay rules broken, confirmed by the operator.
    override_rules: bool = False


class BookingListResponse(BaseModel):
    items: list[BookingResponse]
    total: int
    page: int
    per_page: int
    pages: int


# ---------- Payment ----------


class PaymentCreate(BaseModel):
    # The column is Numeric(12, 2): a larger figure fails in the database as a 500.
    amount: Decimal = Field(..., gt=0, le=Decimal("9999999999.99"))
    type: PaymentType = PaymentType.PAYMENT
    method: PaymentMethod = PaymentMethod.CASH
    note: str | None = None
    # pending: promised (a transfer still to check); confirm it when it lands.
    status: Literal["pending", "completed"] = "completed"
    # The id of this payment in the system that records it (CRM, bank).
    external_id: str | None = Field(default=None, max_length=255)


class PaymentResponse(BaseModel):
    model_config = ConfigDict(
        from_attributes=True,
        json_encoders={Decimal: float},
    )

    id: uuid.UUID
    booking_id: uuid.UUID
    amount: Decimal
    type: PaymentType
    method: PaymentMethod
    status: PaymentStatus
    note: str | None = None
    paid_at: datetime | None = None
    external_id: str | None = None
    created_at: datetime | None = None


class BookingKeyVoidResponse(BaseModel):
    """What came of a create sent with an Idempotency-Key: its booking, or the key is now closed."""

    voided: bool
    booking: BookingResponse | None = None


class PaymentKeyVoidResponse(BaseModel):
    """What came of a payment sent with an Idempotency-Key: its payment, or the key is now closed."""

    voided: bool
    payment: PaymentResponse | None = None


# ---------- Deposit ----------


class DepositCreate(BaseModel):
    amount: Decimal = Field(..., gt=0)
    # Take it only if the booking has no deposit that is not returned yet (409
    # otherwise): a retried press then cannot take the guest's deposit twice.
    unless_open: bool = False


class DepositAction(BaseModel):
    action: str = Field(..., pattern="^(pay|return|hold|partial_hold)$")
    held_amount: Decimal | None = None
    reason: str | None = None


class DepositResponse(BaseModel):
    model_config = ConfigDict(
        from_attributes=True,
        json_encoders={Decimal: float},
    )

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
    check_in: datetime
    check_out: datetime
    rental_mode: RentalMode = RentalMode.DAILY
    adults_count: int = Field(default=1, ge=1)
    children_count: int = Field(default=0, ge=0)


class AvailablePhotoResponse(BaseModel):
    url: str
    caption: str | None = None
    is_cover: bool
    sort_order: int


class AvailablePropertyResponse(BaseModel):
    model_config = ConfigDict(json_encoders={Decimal: float})

    property_id: uuid.UUID
    name: str
    internal_name: str
    rental_mode: RentalMode
    rooms: int | None = None
    beds: int | None = None
    max_guests: int | None = None
    bathrooms: int | None = None
    total_price: Decimal | None = None
    # Set when the unit is free but has no pricing configured, so the caller can
    # tell "costs nothing" apart from "cannot be quoted".
    price_error: str | None = None
    # The stay as this flat books it: its own check-in and check-out hours.
    check_in: datetime | None = None
    check_out: datetime | None = None
    # Cover first, then in the host's order: one answer is enough to offer a flat.
    photos: list[AvailablePhotoResponse] = []


class AvailabilityResponse(BaseModel):
    check_in: datetime
    check_out: datetime
    rental_mode: RentalMode
    items: list[AvailablePropertyResponse]


class PriceCalculateResponse(BaseModel):
    model_config = ConfigDict(json_encoders={Decimal: float})

    nights: int
    hours: int
    unit_label: str
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
    check_in: datetime
    check_out: datetime
    rental_mode: RentalMode = RentalMode.DAILY
    status: str
    source: str
    gantt_color: str
    gantt_icon: str | None = None
    adults_count: int
    children_count: int
    total_price: float
    overbooking: bool = False


class GanttBlockResponse(BaseModel):
    id: uuid.UUID
    start_date: date
    end_date: date
    reason: str | None = None
    # A platform's booking over a Day booking: the same night sold twice.
    clash: bool = False


class GanttDayPriceResponse(BaseModel):
    date: date
    price: float


class GanttPropertyResponse(BaseModel):
    id: uuid.UUID
    name: str
    internal_name: str
    type: str
    status: PropertyStatus
    bookings: list[GanttBookingResponse]
    # Nights closed without a booking.
    blocks: list[GanttBlockResponse] = []
    rental_mode: RentalMode = RentalMode.DAILY
    # Nights priced on the calendar, replacing the flat's usual price.
    day_prices: list[GanttDayPriceResponse] = []


class GanttDataResponse(BaseModel):
    properties: list[GanttPropertyResponse]


# ---------- Today ----------


class TodayBookingItem(BookingResponse):
    """A whole booking: the Mini App opens these rows as booking cards (money, guest, flat)."""

    property_status: PropertyStatus | None = None


class TodayCheckResponse(BaseModel):
    check_ins: list[TodayBookingItem]
    check_outs: list[TodayBookingItem]
    in_house: list[TodayBookingItem]


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


class PropertyBlockCreate(BaseModel):
    """Nights to close: start_date is the first night, end_date the day after the
    last one (like a check-out)."""

    start_date: date
    end_date: date
    reason: str | None = Field(default=None, max_length=255)

    @model_validator(mode="after")
    def _at_least_one_night(self):
        if self.end_date <= self.start_date:
            raise ValueError("end_date must be after start_date")
        return self


class PropertyBlockResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    property_id: uuid.UUID
    start_date: date
    end_date: date
    reason: str | None = None
    created_at: datetime | None = None
    # Taken from a platform calendar: that calendar keeps it.
    feed_id: uuid.UUID | None = None


class CalendarFeedCreate(BaseModel):
    """A platform's iCal link of the flat (Airbnb: Calendar > Availability > Export)."""

    name: str = Field(min_length=1, max_length=100)
    url: str = Field(max_length=2000, pattern=r"^https?://\S+$")


class CalendarFeedResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    url: str
    last_synced_at: datetime | None = None
    last_error: str | None = None
    # Day's link to paste into this same platform: without the nights read from it.
    export_url: str | None = None
