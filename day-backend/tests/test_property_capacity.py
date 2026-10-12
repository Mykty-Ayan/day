"""An apartment says how many guests it takes and how many bathrooms it has."""

import pytest
from pydantic import ValidationError

from app.application.property.update_property import UpdatePropertyInput
from app.presentation.schemas.property import PropertyCreate, PropertyUpdate
from tests.test_property_services import COMPANY_ID, TestUpdatePropertyService


@pytest.mark.asyncio
async def test_capacity_is_saved_and_audited():
    _, audit_repo, svc, prop = await TestUpdatePropertyService()._setup()
    result = await svc.execute(
        UpdatePropertyInput(property_id=prop.id, company_id=COMPANY_ID, max_guests=4, bathrooms=1)
    )
    assert (result.max_guests, result.bathrooms) == (4, 1)
    assert {log.field_name for log in await audit_repo.list_by_property(prop.id)} == {"max_guests", "bathrooms"}


@pytest.mark.parametrize("field", ["max_guests", "bathrooms"])
@pytest.mark.parametrize("value", [0, -1, 51])
def test_capacity_is_a_sane_number(field, value):
    with pytest.raises(ValidationError):
        PropertyUpdate(**{field: value})
    with pytest.raises(ValidationError):
        PropertyCreate(name="Т", internal_name="t", **{field: value})


@pytest.mark.asyncio
@pytest.mark.parametrize(("max_guests", "offered"), [(2, False), (3, True), (None, True)])
async def test_a_flat_too_small_for_the_party_is_not_offered(max_guests, offered):
    # Unknown capacity stays on offer: an empty field is not "too small".
    from datetime import date

    from app.application.booking.check_availability import CheckAvailabilityService
    from tests.test_booking_services import (
        FakeBookingRepository,
        FakePropertyRepository,
        _build_price_calculator,
        _make_property,
    )

    flat = _make_property()
    flat.max_guests = max_guests
    properties = FakePropertyRepository()
    properties._properties[flat.id] = flat
    svc = CheckAvailabilityService(properties, FakeBookingRepository(), _build_price_calculator())

    found = await svc.execute(
        COMPANY_ID, date(2026, 11, 1), date(2026, 11, 3), adults_count=2, children_count=1, with_prices=False
    )
    assert [item.property.id for item in found] == ([flat.id] if offered else [])


@pytest.mark.parametrize(("raw", "kept"), [(4, 4), ("2", 2), (0, None), (51, None), ("many", None), (None, None)])
def test_an_imported_capacity_is_kept_only_when_sane(raw, kept):
    from app.application.ai_migration.confirm_import import _capacity

    assert _capacity(raw) == kept
