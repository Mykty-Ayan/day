"""An apartment's stay rules: the fewest and most nights, the hours kept free
around an hourly booking for cleaning, and the hours a stay must be booked ahead.
Empty means no rule; the bookings check them separately."""

import pytest
from pydantic import ValidationError

from app.application.property.clone_property import ClonePropertyService
from app.application.property.update_property import UpdatePropertyInput, UpdatePropertyService
from app.domain.auth.permissions import Permission
from app.presentation.schemas.property import PropertyCreate, PropertyUpdate
from tests.test_property_facts import flat  # noqa: F401  (a fixture)
from tests.test_property_services import (
    COMPANY_ID,
    FakeAmenityRepository,
    FakeDiscountRuleRepository,
    FakePricingConfigRepository,
    FakePropertyAuditLogRepository,
    FakePropertyPhotoRepository,
    FakePropertyRepository,
    FakeSeasonalPriceRepository,
    _make_property,
)

RULES = {"min_nights": 2, "max_nights": 28, "buffer_minutes": 120, "min_lead_hours": 3}


def test_stay_rules_are_accepted():
    body = PropertyCreate(name="Т", internal_name="t", type="apartment", **RULES)
    assert body.model_dump(include=set(RULES)) == RULES
    assert PropertyUpdate(**RULES).model_dump(include=set(RULES)) == RULES


@pytest.mark.parametrize(
    "field, bad",
    [
        ("min_nights", 0),
        ("min_nights", 366),
        ("max_nights", 0),
        ("buffer_minutes", 0),
        ("buffer_minutes", 1455),
        # Steps of 15 minutes.
        ("buffer_minutes", 20),
        ("min_lead_hours", 0),
        ("min_lead_hours", 24 * 30 + 1),
    ],
)
def test_a_stay_rule_stays_within_sense(field, bad):
    with pytest.raises(ValidationError):
        PropertyUpdate(**{field: bad})
    with pytest.raises(ValidationError):
        PropertyCreate(name="Т", internal_name="t", type="apartment", **{field: bad})


def test_the_most_nights_are_not_fewer_than_the_fewest():
    with pytest.raises(ValidationError):
        PropertyCreate(name="Т", internal_name="t", type="apartment", min_nights=5, max_nights=3)


async def test_stay_rules_are_saved_and_a_null_clears_one():
    props = FakePropertyRepository()
    prop = _make_property()
    await props.save(prop)
    svc = UpdatePropertyService(props, FakePropertyAuditLogRepository())
    saved = await svc.execute(UpdatePropertyInput(property_id=prop.id, company_id=COMPANY_ID, **RULES))
    assert {k: getattr(saved, k) for k in RULES} == RULES

    cleared = await svc.execute(UpdatePropertyInput(property_id=prop.id, company_id=COMPANY_ID, min_lead_hours=None))
    assert cleared.min_lead_hours is None
    assert cleared.min_nights == 2


async def test_an_update_cannot_put_the_most_nights_below_the_fewest():
    # The request sends one side; the other is the saved value.
    props = FakePropertyRepository()
    prop = _make_property(min_nights=3)
    await props.save(prop)
    svc = UpdatePropertyService(props, FakePropertyAuditLogRepository())
    with pytest.raises(ValueError, match="max_nights"):
        await svc.execute(UpdatePropertyInput(property_id=prop.id, company_id=COMPANY_ID, max_nights=2))


async def test_a_clone_keeps_the_stay_rules():
    props = FakePropertyRepository()
    source = _make_property(**RULES)
    await props.save(source)
    svc = ClonePropertyService(
        props,
        FakePropertyPhotoRepository(),
        FakeAmenityRepository(),
        FakePricingConfigRepository(),
        FakeSeasonalPriceRepository(),
        FakeDiscountRuleRepository(),
        FakePropertyAuditLogRepository(),
    )
    clone = await svc.execute(source.id, COMPANY_ID)
    assert {k: getattr(clone, k) for k in RULES} == RULES


@pytest.mark.integration
async def test_stay_rules_are_read_and_written_through_the_api(flat):  # noqa: F811  (the imported fixture)
    client, prop, use = flat
    path = f"/api/v1/properties/{prop}"

    use(Permission.PROPERTIES_READ, Permission.PROPERTIES_WRITE)
    assert (await client.patch(path, json={"min_nights": 0})).status_code == 422
    response = await client.patch(path, json=RULES)
    assert response.status_code == 200, response.text
    assert {k: response.json()[k] for k in RULES} == RULES
    assert (await client.patch(path, json={"max_nights": 1})).status_code == 400

    # The CRM reads them to offer only stays the flat takes.
    use(Permission.PROPERTIES_READ)
    assert {k: (await client.get(path)).json()[k] for k in RULES} == RULES

    use(Permission.PROPERTIES_READ, Permission.PROPERTIES_WRITE)
    assert (await client.patch(path, json={"buffer_minutes": None})).json()["buffer_minutes"] is None
