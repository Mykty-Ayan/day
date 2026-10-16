"""Links to an apartment's listings (Krisha, Booking, Airbnb, OLX). A guest sends
one to the CRM, and its assistant finds the flat by it (CRM request 16)."""

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

LINKS = ["https://krisha.kz/a/show/1016268703", "https://www.booking.com/hotel/kz/studio-62.html"]


def test_listing_links_are_accepted_and_trimmed():
    body = PropertyCreate(name="Т", internal_name="t", type="apartment", listing_urls=LINKS)
    assert body.listing_urls == LINKS
    # A pasted link often ends with a space.
    assert PropertyUpdate(listing_urls=[" https://krisha.kz/a/show/1 "]).listing_urls == ["https://krisha.kz/a/show/1"]


@pytest.mark.parametrize(
    "bad",
    [
        ["krisha.kz/a/show/1"],
        ["javascript:alert(1)"],
        ["https://krisha.kz/a b"],
        ["https://krisha.kz/" + "a" * 500],
        [f"https://krisha.kz/a/show/{n}" for n in range(21)],
        None,
    ],
)
def test_a_listing_link_is_a_web_address_and_there_are_at_most_twenty(bad):
    with pytest.raises(ValidationError):
        PropertyUpdate(listing_urls=bad)
    with pytest.raises(ValidationError):
        PropertyCreate(name="Т", internal_name="t", type="apartment", listing_urls=bad)


def test_a_flat_without_links_has_an_empty_list():
    assert PropertyCreate(name="Т", internal_name="t", type="apartment").listing_urls == []


async def test_links_are_saved_and_an_empty_list_clears_them():
    props = FakePropertyRepository()
    prop = _make_property()
    await props.save(prop)
    svc = UpdatePropertyService(props, FakePropertyAuditLogRepository())
    saved = await svc.execute(UpdatePropertyInput(property_id=prop.id, company_id=COMPANY_ID, listing_urls=LINKS))
    assert saved.listing_urls == LINKS
    cleared = await svc.execute(UpdatePropertyInput(property_id=prop.id, company_id=COMPANY_ID, listing_urls=[]))
    assert cleared.listing_urls == []


async def test_a_clone_starts_without_the_listing_links():
    # A listing is one flat on Krisha: a copy of the flat is not that listing.
    props = FakePropertyRepository()
    source = _make_property(listing_urls=LINKS)
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
    assert clone.listing_urls == []
    assert source.listing_urls == LINKS


@pytest.mark.integration
async def test_the_crm_key_reads_the_listing_links(flat):  # noqa: F811  (the imported fixture)
    client, prop, use = flat
    path = f"/api/v1/properties/{prop}"

    # A flat saved before the field existed answers an empty list.
    use(Permission.PROPERTIES_READ)
    assert (await client.get(path)).json()["listing_urls"] == []

    use(Permission.PROPERTIES_READ, Permission.PROPERTIES_WRITE)
    assert (await client.patch(path, json={"listing_urls": ["krisha.kz/a/1"]})).status_code == 422
    response = await client.patch(path, json={"listing_urls": LINKS})
    assert response.status_code == 200, response.text
    assert response.json()["listing_urls"] == LINKS

    # The key of the CRM reads them; it is not a secret.
    use(Permission.PROPERTIES_READ)
    assert (await client.get(path)).json()["listing_urls"] == LINKS
    listed = (await client.get("/api/v1/properties")).json()["items"]
    assert [p["listing_urls"] for p in listed] == [LINKS]
