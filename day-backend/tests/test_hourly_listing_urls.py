"""Links to a flat's hourly listings, apart from the nightly ones. Krisha has a
listing of the flat for each kind of rent; the guest's link tells the CRM not
only the flat but whether the stay is by the night or by the hour, and so
which price and which deposit to name."""

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

NIGHTLY = ["https://krisha.kz/a/show/1016268703"]
HOURLY = ["https://krisha.kz/a/show/1016268799"]


def test_hourly_listing_links_follow_the_same_rules_as_the_nightly_ones():
    body = PropertyCreate(name="Т", internal_name="t", type="apartment", listing_urls=NIGHTLY,
                          hourly_listing_urls=[f" {HOURLY[0]} "])
    assert (body.listing_urls, body.hourly_listing_urls) == (NIGHTLY, HOURLY)
    assert PropertyCreate(name="Т", internal_name="t", type="apartment").hourly_listing_urls == []
    for bad in (["krisha.kz/a/show/1"], [f"https://krisha.kz/a/show/{n}" for n in range(21)], None):
        with pytest.raises(ValidationError):
            PropertyUpdate(hourly_listing_urls=bad)


def test_one_link_is_not_both_a_nightly_and_an_hourly_listing():
    # The CRM could not tell which stay the guest means.
    with pytest.raises(ValidationError, match="both"):
        PropertyCreate(name="Т", internal_name="t", type="apartment", listing_urls=HOURLY, hourly_listing_urls=HOURLY)
    with pytest.raises(ValidationError, match="both"):
        PropertyUpdate(listing_urls=HOURLY, hourly_listing_urls=[f"{HOURLY[0]} "])


async def test_a_patch_of_one_list_is_checked_against_the_other_as_saved():
    # The web sends both lists; an API client may send one.
    props = FakePropertyRepository()
    prop = _make_property(listing_urls=NIGHTLY)
    await props.save(prop)
    svc = UpdatePropertyService(props, FakePropertyAuditLogRepository())
    with pytest.raises(ValueError, match="both"):
        await svc.execute(UpdatePropertyInput(property_id=prop.id, company_id=COMPANY_ID, hourly_listing_urls=NIGHTLY))
    assert prop.hourly_listing_urls == []


async def test_hourly_links_are_saved_apart_and_a_clone_starts_without_them():
    props = FakePropertyRepository()
    prop = _make_property()
    await props.save(prop)
    svc = UpdatePropertyService(props, FakePropertyAuditLogRepository())
    saved = await svc.execute(UpdatePropertyInput(property_id=prop.id, company_id=COMPANY_ID,
                                                  listing_urls=NIGHTLY, hourly_listing_urls=HOURLY))
    assert (saved.listing_urls, saved.hourly_listing_urls) == (NIGHTLY, HOURLY)

    # A listing is one flat on Krisha: a copy of the flat is not that listing.
    clone = await ClonePropertyService(
        props, FakePropertyPhotoRepository(), FakeAmenityRepository(), FakePricingConfigRepository(),
        FakeSeasonalPriceRepository(), FakeDiscountRuleRepository(), FakePropertyAuditLogRepository(),
    ).execute(prop.id, COMPANY_ID)
    assert clone.hourly_listing_urls == []


@pytest.mark.integration
async def test_the_crm_key_reads_the_hourly_listing_links(flat):  # noqa: F811  (the imported fixture)
    client, prop, use = flat
    path = f"/api/v1/properties/{prop}"

    # A flat saved before the field existed answers an empty list.
    use(Permission.PROPERTIES_READ)
    assert (await client.get(path)).json()["hourly_listing_urls"] == []

    use(Permission.PROPERTIES_READ, Permission.PROPERTIES_WRITE)
    assert (await client.patch(path, json={"listing_urls": HOURLY, "hourly_listing_urls": HOURLY})).status_code == 422
    response = await client.patch(path, json={"listing_urls": NIGHTLY, "hourly_listing_urls": HOURLY})
    assert response.status_code == 200, response.text
    # One list alone is checked against the other as saved.
    assert (await client.patch(path, json={"hourly_listing_urls": NIGHTLY})).status_code == 400

    # The key of the CRM reads both, in the card and in the list.
    use(Permission.PROPERTIES_READ)
    card = (await client.get(path)).json()
    assert (card["listing_urls"], card["hourly_listing_urls"]) == (NIGHTLY, HOURLY)
    listed = (await client.get("/api/v1/properties")).json()["items"]
    assert [p["hourly_listing_urls"] for p in listed] == [HOURLY]
