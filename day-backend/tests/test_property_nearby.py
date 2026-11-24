"""Places near a flat (a shop, a park, the airport, and how far): the owner keeps the list, the guest reads it."""

import uuid
from datetime import date

import pytest
from pydantic import ValidationError

from app.application.property.clone_property import ClonePropertyService
from app.application.property.update_property import UpdatePropertyService
from app.domain.auth.permissions import Permission
from app.domain.property.value_objects import PropertyStatus
from app.presentation.schemas.property import NearbyPlace, PropertyUpdate
from app.presentation.schemas.public import PublicStayResponse
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


async def _three_flats(**third):
    props, audit = FakePropertyRepository(), FakePropertyAuditLogRepository()
    source = _make_property(internal_name="a", nearby=[dict(p) for p in PLACES])
    other = _make_property(internal_name="b", nearby=[{"name": "Старое", "minutes": 7, "by": "walk"}])
    blank = _make_property(internal_name="c", **third)
    for prop in (source, other, blank):
        await props.save(prop)
    return UpdatePropertyService(props, audit), props, audit, source, other, blank


async def test_the_list_goes_to_the_chosen_flats_in_place_of_theirs():
    svc, props, audit, source, other, blank = await _three_flats()
    changed = await svc.copy_nearby(source.id, [other.id, blank.id, other.id, source.id], COMPANY_ID, None)
    # Each flat once, the flat itself not counted.
    assert changed == 2
    assert (await props.get_by_id(other.id)).nearby == PLACES
    assert (await props.get_by_id(blank.id)).nearby == PLACES
    # Each flat its own list: an edit of one leaves the others.
    (await props.get_by_id(other.id)).nearby[0]["minutes"] = 99
    assert (await props.get_by_id(blank.id)).nearby[0]["minutes"] == 3
    assert source.nearby[0]["minutes"] == 3
    # The change is in each flat's history.
    assert [log.field_name for log in await audit.list_by_property(other.id)] == ["nearby"]


async def test_a_flat_of_another_company_is_refused():
    svc, props, _, source, other, _ = await _three_flats()
    foreign = _make_property(company_id=uuid.uuid4(), internal_name="f")
    await props.save(foreign)
    with pytest.raises(ValueError, match="not found"):
        await svc.copy_nearby(source.id, [foreign.id], COMPANY_ID, None)
    assert foreign.nearby == []
    # Nor is the list of another company's flat copied in.
    with pytest.raises(ValueError, match="not found"):
        await svc.copy_nearby(foreign.id, [other.id], foreign.company_id, None)
    with pytest.raises(ValueError, match="not found"):
        await svc.copy_nearby(source.id, [other.id], uuid.uuid4(), None)


async def test_an_archived_flat_takes_no_list():
    svc, _, _, source, _, blank = await _three_flats(status=PropertyStatus.ARCHIVED)
    with pytest.raises(ValueError, match="archived"):
        await svc.copy_nearby(source.id, [blank.id], COMPANY_ID, None)


@pytest.mark.integration
async def test_the_copy_is_all_or_none(flat):  # noqa: F811  (the imported fixture)
    client, prop, use = flat
    use(Permission.PROPERTIES_READ, Permission.PROPERTIES_WRITE)
    created = await client.post(
        "/api/v1/properties", json={"name": "Т14", "internal_name": "t14", "type": "apartment"}
    )
    assert created.status_code == 201, created.text
    second = created.json()["id"]
    assert (await client.patch(f"/api/v1/properties/{prop}", json={"nearby": PLACES})).status_code == 200
    copy = f"/api/v1/properties/{prop}/nearby/copy"
    # One flat that is not the company's: none takes the list.
    refused = await client.post(copy, json={"property_ids": [second, str(uuid.uuid4())]})
    assert refused.status_code == 404
    assert (await client.get(f"/api/v1/properties/{second}")).json()["nearby"] == []
    assert (await client.post(copy, json={"property_ids": []})).status_code == 422
    done = await client.post(copy, json={"property_ids": [second]})
    assert done.json() == {"updated": 1}
    assert (await client.get(f"/api/v1/properties/{second}")).json()["nearby"] == PLACES
    # Reading is not writing.
    use(Permission.PROPERTIES_READ)
    assert (await client.post(copy, json={"property_ids": [second]})).status_code == 403
