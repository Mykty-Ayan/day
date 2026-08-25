from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime

from app.domain.channex.value_objects import ChannexBookingStatus, ListingSyncState


@dataclass
class ChannexConnection:
    """A company's link to Channex: one group per tenant."""

    id: uuid.UUID = field(default_factory=uuid.uuid4)
    company_id: uuid.UUID = field(default_factory=uuid.uuid4)
    channex_group_id: str = ""
    is_active: bool = True
    created_at: datetime | None = None


@dataclass
class ChannexListing:
    """A property mirrored into Channex as property + room type + rate plan.

    Apartments map 1:1: the whole unit is a single room type with
    count_of_rooms=1 sold per_room, so availability per date is 0 or 1.
    """

    id: uuid.UUID = field(default_factory=uuid.uuid4)
    company_id: uuid.UUID = field(default_factory=uuid.uuid4)
    property_id: uuid.UUID = field(default_factory=uuid.uuid4)
    channex_property_id: str = ""
    channex_room_type_id: str = ""
    channex_rate_plan_id: str = ""
    sync_state: ListingSyncState = ListingSyncState.PENDING
    last_error: str | None = None
    last_synced_at: datetime | None = None
    created_at: datetime | None = None


@dataclass
class ChannexBookingEvent:
    """An inbound booking revision from Channex.

    ``revision_id`` is the idempotency key: Channex may redeliver a webhook or
    the feed may be re-read, but each revision is applied to the Booking
    aggregate exactly once. ``unique_id`` groups revisions of one OTA booking.
    """

    id: uuid.UUID = field(default_factory=uuid.uuid4)
    company_id: uuid.UUID = field(default_factory=uuid.uuid4)
    property_id: uuid.UUID = field(default_factory=uuid.uuid4)
    booking_id: uuid.UUID | None = None
    revision_id: str = ""
    channex_booking_id: str = ""
    unique_id: str = ""
    ota_name: str = ""
    status: ChannexBookingStatus = ChannexBookingStatus.NEW
    payload: dict = field(default_factory=dict)
    acked_at: datetime | None = None
    created_at: datetime | None = None
