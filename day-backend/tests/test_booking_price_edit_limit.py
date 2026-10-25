"""A booking's price set by hand must be a sum the flat could be paid.

The edit used to take any figure: a negative total made the guest "overpaid"
and turned the debt into money owed back. The Mini App now edits the price
from the phone, so the check sits in the schema every caller goes through.
"""

from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.presentation.schemas.booking import BookingUpdate


def test_a_price_set_by_hand_is_accepted():
    assert BookingUpdate(total_price=Decimal("45000")).total_price == Decimal("45000")


def test_a_free_stay_is_allowed():
    assert BookingUpdate(total_price=Decimal("0")).total_price == Decimal("0")


def test_a_negative_price_is_refused():
    with pytest.raises(ValidationError):
        BookingUpdate(total_price=Decimal("-1"))


def test_a_price_past_the_column_is_refused_before_the_database():
    # Numeric(12, 2), like payments: a larger figure would come back as a 500.
    with pytest.raises(ValidationError):
        BookingUpdate(total_price=Decimal("10000000000"))
