"""An expense of the company: what was paid, how much, on which day, for which flat."""

from __future__ import annotations

import enum
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal


class ExpenseCategory(str, enum.Enum):
    """The usual costs of letting flats by the night and by the hour."""

    RENT = "rent"  # to the flat's owner; always for one flat
    UTILITIES = "utilities"
    INTERNET = "internet"
    CLEANING = "cleaning"
    LAUNDRY = "laundry"
    SUPPLIES = "supplies"
    REPAIRS = "repairs"
    FURNITURE = "furniture"  # an investment, apart from running costs
    ADVERTISING = "advertising"
    PLATFORM_COMMISSION = "platform_commission"
    PAYMENT_FEES = "payment_fees"
    STAFF = "staff"
    AGENT_COMMISSION = "agent_commission"
    SOFTWARE = "software"
    OTHER = "other"


@dataclass
class Expense:
    company_id: uuid.UUID
    category: ExpenseCategory
    amount: Decimal
    spent_on: date
    id: uuid.UUID = field(default_factory=uuid.uuid4)
    # None: the whole company's (internet for the office, software).
    property_id: uuid.UUID | None = None
    payee: str | None = None
    note: str | None = None
    # The agent paid, for an agent's commission; the booking the money was for, if one.
    agent_id: uuid.UUID | None = None
    booking_id: uuid.UUID | None = None
    created_by: uuid.UUID | None = None
    created_at: datetime | None = None
    # A wrong expense is voided, never deleted: the books keep what was said.
    voided_at: datetime | None = None
    voided_by: uuid.UUID | None = None
