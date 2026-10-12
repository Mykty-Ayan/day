"""A payment amount must fit the column it is stored in.

Numeric(12, 2) holds up to 9 999 999 999.99. A larger figure used to reach the
database and come back as a 500, which the Mini App rightly treats as "maybe
recorded" — and then refuses every money action on that booking for good.
A 422 says plainly that nothing was saved.
"""

from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.presentation.schemas.booking import PaymentCreate


def test_the_largest_amount_the_column_holds_is_accepted():
    assert PaymentCreate(amount=Decimal("9999999999.99")).amount == Decimal("9999999999.99")


def test_a_larger_amount_is_refused_before_the_database():
    with pytest.raises(ValidationError):
        PaymentCreate(amount=Decimal("10000000000"))
