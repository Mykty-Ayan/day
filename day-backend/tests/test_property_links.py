"""Links and building facts of an apartment that the CRM hands to guests: map, WhatsApp product, video."""

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

LINKS = {
    "complex_name": "ЖК Expo Boulevard",
    "floors_total": 12,
    "map_url": "https://2gis.kz/astana/geo/70000001234567",
    "whatsapp_product_url": "https://wa.me/p/1234567890123456/77010000000",
    "video_url": "https://www.instagram.com/reel/abc123/",
}


@pytest.mark.parametrize("field", ["map_url", "whatsapp_product_url", "video_url"])
@pytest.mark.parametrize("bad", ["javascript:alert(1)", "2gis.kz/astana", "https://", "https://a b"])
def test_a_link_must_be_a_web_address(field, bad):
    # The web shows these as links and the CRM sends them to guests.
    with pytest.raises(ValidationError):
        PropertyUpdate(**{field: bad})
    with pytest.raises(ValidationError):
        PropertyCreate(name="Т", internal_name="t", type="apartment", **{field: bad})


def test_the_building_has_at_least_one_floor():
    with pytest.raises(ValidationError):
        PropertyUpdate(floors_total=0)


def test_links_and_building_facts_are_accepted():
    body = PropertyCreate(name="Т", internal_name="t", type="apartment", **LINKS)
    assert body.model_dump(include=set(LINKS)) == LINKS
    # A pasted link often ends with a space.
    assert PropertyUpdate(map_url=" https://go.2gis.com/abc ").map_url == "https://go.2gis.com/abc"


async def test_links_are_saved_and_a_null_clears_one():
    props = FakePropertyRepository()
    prop = _make_property()
    await props.save(prop)
    svc = UpdatePropertyService(props, FakePropertyAuditLogRepository())
    saved = await svc.execute(UpdatePropertyInput(property_id=prop.id, company_id=COMPANY_ID, **LINKS))
    assert {k: getattr(saved, k) for k in LINKS} == LINKS

    cleared = await svc.execute(UpdatePropertyInput(property_id=prop.id, company_id=COMPANY_ID, map_url=None))
    assert cleared.map_url is None
    assert cleared.video_url == LINKS["video_url"]


async def test_a_clone_keeps_the_links():
    props = FakePropertyRepository()
    source = _make_property(**LINKS)
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
    assert {k: getattr(clone, k) for k in LINKS} == LINKS


@pytest.mark.integration
async def test_a_read_only_key_reads_the_links(flat):  # noqa: F811  (the imported fixture)
    client, prop, use = flat
    path = f"/api/v1/properties/{prop}"

    use(Permission.PROPERTIES_READ, Permission.PROPERTIES_WRITE)
    assert (await client.patch(path, json={"map_url": "javascript:alert(1)"})).status_code == 422
    response = await client.patch(path, json=LINKS)
    assert response.status_code == 200, response.text
    assert {k: response.json()[k] for k in LINKS} == LINKS

    # The key of the CRM: it reads, it does not write.
    use(Permission.PROPERTIES_READ)
    assert {k: (await client.get(path)).json()[k] for k in LINKS} == LINKS
    listed = (await client.get("/api/v1/properties")).json()["items"]
    assert [{k: p[k] for k in LINKS} for p in listed] == [LINKS]

    use(Permission.PROPERTIES_READ, Permission.PROPERTIES_WRITE)
    assert (await client.patch(path, json={"map_url": None})).json()["map_url"] is None


@pytest.mark.parametrize(
    ("url", "product_id"),
    [
        ("https://wa.me/p/1234567890123456/77010000000", "1234567890123456"),
        ("https://wa.me/p/7654321098765", "7654321098765"),
        ("http://www.wa.me/p/1234567890/77010000000?ref=x", "1234567890"),
        ("https://wa.me/77010000000", None),  # a chat, not a product
        ("https://wa.me/p/123/77010000000", None),  # too short for a catalogue id
        ("https://evil.example/wa.me/p/1234567890123456", None),
        (None, None),
    ],
)
def test_the_product_id_is_read_from_the_catalogue_link(url, product_id):
    from app.domain.property.entities import whatsapp_product_id

    assert whatsapp_product_id(url) == product_id


@pytest.mark.integration
async def test_the_card_and_the_readiness_report_carry_the_product_id(flat):  # noqa: F811  (the imported fixture)
    client, prop, use = flat
    use(Permission.PROPERTIES_READ, Permission.PROPERTIES_WRITE)
    before = (await client.get("/api/v1/properties/readiness")).json()["items"][0]
    assert "whatsapp_product" in before["empty"]

    await client.patch(f"/api/v1/properties/{prop}", json={"whatsapp_product_url": LINKS["whatsapp_product_url"]})

    card = (await client.get(f"/api/v1/properties/{prop}")).json()
    assert card["whatsapp_product_id"] == "1234567890123456"
    listed = (await client.get("/api/v1/properties")).json()["items"]
    assert [p["whatsapp_product_id"] for p in listed] == ["1234567890123456"]
    after = (await client.get("/api/v1/properties/readiness")).json()["items"][0]
    assert after["fields"]["whatsapp_product"] is True
