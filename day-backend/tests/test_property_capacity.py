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
