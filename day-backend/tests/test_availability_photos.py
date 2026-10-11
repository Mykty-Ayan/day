"""Free flats come with their photos, and a photo can say what it shows.

The CRM's AI offers free flats with pictures. Without photos in the
availability answer it asked Day once more per flat, and a bare picture of a
door says nothing until it has a caption ("entrance from the yard").
"""

import uuid

import pytest

from app.application.property.manage_photos import ManagePhotosService
from app.domain.auth.permissions import Permission
from app.domain.property.entities import Property
from tests.test_property_facts import FakeProperties, flat  # noqa: F401  (a fixture)
from tests.test_property_services import FakePropertyPhotoRepository

COMPANY_ID = uuid.uuid4()


async def _service():
    prop = Property(company_id=COMPANY_ID, name="Т13")
    other = Property(company_id=COMPANY_ID, name="Т14")
    photos = FakePropertyPhotoRepository()
    return ManagePhotosService(FakeProperties(prop, other), photos), prop, other


async def test_a_photo_keeps_its_caption():
    svc, prop, _ = await _service()
    photo = await svc.add_photo(prop.id, COMPANY_ID, "https://x/1.jpg", caption="Вход со двора")
    assert photo.caption == "Вход со двора"


async def test_a_caption_can_be_changed_and_removed():
    svc, prop, _ = await _service()
    photo = await svc.add_photo(prop.id, COMPANY_ID, "https://x/1.jpg")
    assert (await svc.set_caption(photo.id, prop.id, COMPANY_ID, "Кухня")).caption == "Кухня"
    assert (await svc.set_caption(photo.id, prop.id, COMPANY_ID, None)).caption is None


async def test_a_caption_is_set_only_through_the_photos_flat():
    svc, prop, other = await _service()
    photo = await svc.add_photo(prop.id, COMPANY_ID, "https://x/1.jpg")
    with pytest.raises(ValueError, match="Photo not found"):
        await svc.set_caption(photo.id, other.id, COMPANY_ID, "Чужая")
    with pytest.raises(ValueError, match="Property not found"):
        await svc.set_caption(photo.id, prop.id, uuid.uuid4(), "Чужая")


@pytest.mark.integration
async def test_availability_brings_photos_cover_first_with_captions(flat):  # noqa: F811
    client, prop, use = flat
    use(Permission.PROPERTIES_READ, Permission.PROPERTIES_WRITE, Permission.BOOKINGS_READ)
    photos = f"/api/v1/properties/{prop}/photos"

    await client.post(photos, json={"url": "https://x/kitchen.jpg", "sort_order": 0, "caption": "Кухня"})
    door = await client.post(photos, json={"url": "https://x/door.jpg", "sort_order": 1})
    await client.post(photos, json={"url": "https://x/main.jpg", "sort_order": 2, "is_cover": True})
    assert door.status_code == 201, door.text

    patched = await client.patch(f"{photos}/{door.json()['id']}", json={"caption": "Вход со двора"})
    assert patched.status_code == 200, patched.text
    assert patched.json()["caption"] == "Вход со двора"

    answer = await client.get(
        "/api/v1/bookings/availability",
        params={"check_in": "2026-11-01T14:00:00", "check_out": "2026-11-03T12:00:00", "adults_count": 2},
    )
    assert answer.status_code == 200, answer.text
    [item] = [i for i in answer.json()["items"] if i["property_id"] == str(prop)]
    assert [(p["url"], p["caption"], p["is_cover"]) for p in item["photos"]] == [
        ("https://x/main.jpg", None, True),
        ("https://x/kitchen.jpg", "Кухня", False),
        ("https://x/door.jpg", "Вход со двора", False),
    ]


@pytest.mark.integration
async def test_a_caption_has_a_limit(flat):  # noqa: F811
    client, prop, use = flat
    use(Permission.PROPERTIES_READ, Permission.PROPERTIES_WRITE)
    response = await client.post(
        f"/api/v1/properties/{prop}/photos", json={"url": "https://x/1.jpg", "caption": "x" * 501}
    )
    assert response.status_code == 422
