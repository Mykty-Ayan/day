"""Check-in instruction photos (the entrance, the lock, the parking) reach only those who hand codes to guests."""

from types import SimpleNamespace

import pytest

from app.application.property.clone_property import ClonePropertyService
from app.application.property.manage_photos import ManagePhotosService
from app.domain.auth.permissions import Permission
from app.domain.property.entities import PropertyPhoto
from app.domain.property.value_objects import FactAudience
from app.presentation.api.v1.properties import _visible_photos
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

LOCK = "https://cdn.example.com/properties/lock.jpg"


async def _service():
    props, photos = FakePropertyRepository(), FakePropertyPhotoRepository()
    prop, other = _make_property(), _make_property(internal_name="other")
    await props.save(prop)
    await props.save(other)
    return ManagePhotosService(props, photos), photos, prop, other


def test_instruction_photos_are_dropped_for_those_without_secrets():
    listing = SimpleNamespace(audience=FactAudience.PUBLIC)
    lock = SimpleNamespace(audience=FactAudience.GUEST)
    assert _visible_photos([listing, lock], sees_secrets=False) == [listing]
    assert _visible_photos([listing, lock], sees_secrets=True) == [listing, lock]


async def test_an_instruction_photo_is_never_the_cover():
    svc, _, prop, _ = await _service()
    with pytest.raises(ValueError, match="cover"):
        await svc.add_photo(prop.id, COMPANY_ID, LOCK, is_cover=True, audience=FactAudience.GUEST)
    photo = await svc.add_photo(prop.id, COMPANY_ID, LOCK, caption="Замок: код у хозяина", audience=FactAudience.GUEST)
    assert (photo.audience, photo.caption, photo.is_cover) == (FactAudience.GUEST, "Замок: код у хозяина", False)


async def test_a_photo_is_deleted_only_through_its_own_apartment():
    svc, photos, prop, other = await _service()
    photo = await svc.add_photo(other.id, COMPANY_ID, LOCK)
    with pytest.raises(ValueError, match="Photo not found"):
        await svc.delete_photo(photo.id, prop.id, COMPANY_ID)
    assert await photos.list_by_property(other.id) == [photo]


async def test_a_clone_keeps_who_may_see_a_photo_and_its_caption():
    props, photos = FakePropertyRepository(), FakePropertyPhotoRepository()
    source = _make_property()
    await props.save(source)
    await photos.save(PropertyPhoto(property_id=source.id, url=LOCK, caption="Замок", audience=FactAudience.GUEST))
    svc = ClonePropertyService(
        props,
        photos,
        FakeAmenityRepository(),
        FakePricingConfigRepository(),
        FakeSeasonalPriceRepository(),
        FakeDiscountRuleRepository(),
        FakePropertyAuditLogRepository(),
    )
    clone = await svc.execute(source.id, COMPANY_ID)
    [copied] = await photos.list_by_property(clone.id)
    assert (copied.url, copied.caption, copied.audience) == (LOCK, "Замок", FactAudience.GUEST)


@pytest.mark.integration
async def test_instruction_photos_reach_only_the_keys_with_secrets(flat):  # noqa: F811  (the imported fixture)
    client, prop, use = flat
    path = f"/api/v1/properties/{prop}"
    lock = {"url": LOCK, "caption": "Замок: код в сообщении", "audience": "guest"}

    use(Permission.PROPERTIES_READ, Permission.PROPERTIES_WRITE)
    assert (await client.post(f"{path}/photos", json=lock)).status_code == 403

    use(Permission.PROPERTIES_READ, Permission.PROPERTIES_WRITE, Permission.PROPERTY_SECRETS_READ)
    assert (await client.post(f"{path}/photos", json={**lock, "is_cover": True})).status_code == 400
    created = await client.post(f"{path}/photos", json=lock)
    assert created.status_code == 201, created.text
    assert created.json()["audience"] == "guest"
    photo_id = created.json()["id"]
    listing = await client.post(f"{path}/photos", json={"url": "https://cdn.example.com/properties/room.jpg"})
    assert listing.json()["audience"] == "public"

    def audiences(response):
        return sorted(p["audience"] for p in response.json()["photos"])

    assert audiences(await client.get(path)) == ["guest", "public"]

    # A key without secrets: the card, the list and the caption edit do not show the lock.
    use(Permission.PROPERTIES_READ, Permission.PROPERTIES_WRITE)
    assert audiences(await client.get(path)) == ["public"]
    listed = (await client.get("/api/v1/properties")).json()["items"]
    assert [sorted(p["audience"] for p in item["photos"]) for item in listed] == [["public"]]
    assert (await client.patch(f"{path}/photos/{photo_id}", json={"caption": "x"})).status_code == 404

    # The availability offers flats to people who have not booked: never the lock.
    use(Permission.BOOKINGS_READ, Permission.PROPERTY_SECRETS_READ)
    free = await client.get(
        "/api/v1/bookings/availability",
        params={"check_in": "2027-03-01T14:00:00", "check_out": "2027-03-03T12:00:00"},
    )
    assert free.status_code == 200, free.text
    assert [[p["url"] for p in item["photos"]] for item in free.json()["items"]] == [
        ["https://cdn.example.com/properties/room.jpg"]
    ]

