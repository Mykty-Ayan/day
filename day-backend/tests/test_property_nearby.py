"""Places near a flat (a shop, a park, the airport, and how far): the owner keeps the list, the guest reads it."""

from datetime import date

import pytest
from pydantic import ValidationError

from app.application.property.clone_property import ClonePropertyService
from app.domain.auth.permissions import Permission
from app.presentation.schemas.property import NearbyPlace, PropertyUpdate
from app.presentation.schemas.public import PublicStayResponse
from tests.test_property_facts import flat  # noqa: F401  (a fixture)
from tests.test_property_services import (
    FakeAmenityRepository,
    FakeDiscountRuleRepository,
    FakePricingConfigRepository,
    FakePropertyAuditLogRepository,
    FakePropertyPhotoRepository,
    FakePropertyRepository,
    FakeSeasonalPriceRepository,
    _make_property,
)
from tests.test_public_stay import Stay

PLACES = [
    {"name": "Magnum, продукты 24/7", "minutes": 3, "by": "walk"},
    {"name": "Аэропорт", "minutes": 35, "by": "car"},
]


@pytest.mark.parametrize(
    "place",
    [
        {"name": "  ", "minutes": 3},
        {"name": "Парк", "minutes": 0},
        {"name": "Парк", "minutes": 241},
        {"name": "Парк", "minutes": 5, "by": "bike"},
        {"name": "x" * 81, "minutes": 5},
    ],
)
def test_a_place_without_a_name_or_a_sensible_time_is_refused(place):
    with pytest.raises(ValidationError):
        NearbyPlace(**place)


def test_a_place_is_trimmed_and_walked_to_unless_said():
    assert NearbyPlace(name=" Парк ", minutes=10).model_dump() == {"name": "Парк", "minutes": 10, "by": "walk"}
    with pytest.raises(ValidationError):
        PropertyUpdate(nearby=[{"name": f"Место {n}", "minutes": 5} for n in range(13)])


async def test_the_flat_page_shows_what_is_near():
    s = Stay()
    prop = await s.flat()
    prop.nearby = PLACES
    await s.props.save(prop)
    found = await s.service().execute(prop.public_code, date(2030, 10, 1), date(2030, 10, 3))
    shown = PublicStayResponse.from_stay(found)
    assert [(p.name, p.minutes, p.by) for p in shown.nearby] == [
        ("Magnum, продукты 24/7", 3, "walk"),
        ("Аэропорт", 35, "car"),
    ]


async def test_a_copied_flat_keeps_what_is_near_as_its_own_list():
    props = FakePropertyRepository()
    source = _make_property(nearby=[dict(p) for p in PLACES])
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
    copy = await svc.execute(source.id, source.company_id)
    assert copy.nearby == PLACES
    copy.nearby[0]["minutes"] = 99
    assert source.nearby[0]["minutes"] == 3


@pytest.mark.integration
async def test_the_owner_keeps_the_list_and_clears_it(flat):  # noqa: F811  (the imported fixture)
    client, prop, use = flat
    path = f"/api/v1/properties/{prop}"
    use(Permission.PROPERTIES_READ, Permission.PROPERTIES_WRITE)
    assert (await client.get(path)).json()["nearby"] == []
    saved = await client.patch(path, json={"nearby": PLACES})
    assert saved.status_code == 200, saved.text
    assert (await client.get(path)).json()["nearby"] == PLACES
    # Another field changed alone leaves the list as it is.
    assert (await client.patch(path, json={"house_rules": "Не курить"})).status_code == 200
    assert (await client.get(path)).json()["nearby"] == PLACES
    assert (await client.patch(path, json={"nearby": [{"name": "", "minutes": 3}]})).status_code == 422
    # null is no list: refused, not taken for «clear» (an empty list clears).
    assert (await client.patch(path, json={"nearby": None})).status_code == 422
    assert (await client.get(path)).json()["nearby"] == PLACES
    assert (await client.patch(path, json={"nearby": []})).status_code == 200
    assert (await client.get(path)).json()["nearby"] == []
