"""Check-in instruction photos (the entrance, the lock, the parking) reach only those who hand codes to guests."""

import uuid
from types import SimpleNamespace
from urllib.parse import parse_qs, urlparse

import pytest

from app.application.property.clone_property import ClonePropertyService
from app.application.property.manage_photos import ManagePhotosService
from app.domain.auth.permissions import Permission
from app.domain.auth.value_objects import UserRole
from app.domain.property.entities import PropertyPhoto
from app.domain.property.value_objects import FactAudience
from app.infrastructure.storage import s3
from app.presentation.api.v1 import properties
from app.presentation.api.v1.properties import _visible_photos
from tests.test_api_permissions import _request, _user_principal
from tests.test_property_facts import flat  # noqa: F401  (a fixture)
from tests.test_property_photo_upload import JPEG, _upload, stored  # noqa: F401  (a fixture)
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


@pytest.fixture
def storage_keys(monkeypatch):
    monkeypatch.setattr(s3.settings, "S3_ACCESS_KEY", "day-test")
    monkeypatch.setattr(s3.settings, "S3_SECRET_KEY", "day-test-secret")
    s3._signing_client.cache_clear()
    yield
    s3._signing_client.cache_clear()


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
async def test_instruction_photos_reach_only_the_keys_with_secrets(flat, storage_keys, monkeypatch):  # noqa: F811  (the imported fixture)
    client, prop, use = flat
    path = f"/api/v1/properties/{prop}"
    stored_lock = s3.build_public_url(f"checkin/{prop}/lock.jpg")

    async def fake_upload(**kwargs):
        return stored_lock

    monkeypatch.setattr(properties, "upload_property_photo", fake_upload)

    async def upload(**form):
        return await client.post(
            f"{path}/photos/upload",
            files={"file": ("lock.jpg", JPEG, "image/jpeg")},
            data={"caption": "Замок: код в сообщении", "audience": "guest", **form},
        )

    use(Permission.PROPERTIES_READ, Permission.PROPERTIES_WRITE)
    assert (await upload()).status_code == 403

    use(Permission.PROPERTIES_READ, Permission.PROPERTIES_WRITE, Permission.PROPERTY_SECRETS_READ)
    assert (await upload(is_cover="true")).status_code == 400
    created = await upload()
    assert created.status_code == 201, created.text
    assert created.json()["audience"] == "guest"
    photo_id = created.json()["id"]
    listing = await client.post(f"{path}/photos", json={"url": "https://cdn.example.com/properties/room.jpg"})
    assert listing.json()["audience"] == "public"

    def audiences(response):
        return sorted(p["audience"] for p in response.json()["photos"])

    assert audiences(await client.get(path)) == ["guest", "public"]

    # The stored file is private: those who may see it get a link that expires.
    [guest] = [p for p in (await client.get(path)).json()["photos"] if p["audience"] == "guest"]
    assert guest["url"].startswith(stored_lock + "?") and "X-Amz-Signature" in guest["url"]
    assert created.json()["url"].startswith(stored_lock + "?")

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



def test_a_stored_check_in_photo_is_handed_out_as_a_link_that_expires(storage_keys):
    stored_url = s3.build_public_url("checkin/flat/lock.jpg")
    signed = s3.signed_photo_url(stored_url)
    query = parse_qs(urlparse(signed).query)
    assert signed.startswith(stored_url + "?")
    assert "X-Amz-Signature" in query
    assert query["X-Amz-Expires"] == [str(s3.CHECKIN_PHOTO_LINK_SECONDS)]


def test_only_our_check_in_photos_are_signed(storage_keys):
    # A listing photo is public anyway; a link the owner pasted is not ours to sign.
    listing = s3.build_public_url("properties/flat/room.jpg")
    assert s3.signed_photo_url(listing) == listing
    assert s3.signed_photo_url("https://cdn.example.com/checkin/lock.jpg") == "https://cdn.example.com/checkin/lock.jpg"


def test_the_bucket_never_opens_check_in_photos():
    assert not s3.CHECKIN_PHOTOS_PREFIX.startswith(s3.PROPERTY_PHOTOS_PREFIX)


@pytest.mark.asyncio
async def test_an_uploaded_check_in_photo_goes_to_the_private_prefix(stored):  # noqa: F811  (the imported fixture)
    sent, photos = stored()
    assert await _upload(audience="guest", caption="Замок") == 201
    assert sent[0]["private"] is True
    assert (photos.saved[0].audience, photos.saved[0].caption) == (FactAudience.GUEST, "Замок")
    assert await _upload() == 201
    assert sent[1]["private"] is False


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "url",
    [
        # Another company's stored check-in photo: signing it would hand that file out for an hour.
        "checkin/00000000-0000-0000-0000-00000000000a/lock.jpg",
        # A file in the public prefix: hidden from the API, still open to anyone with the link.
        "properties/00000000-0000-0000-0000-00000000000b/lock.jpg",
    ],
)
async def test_a_check_in_photo_is_never_linked_by_url(stored, url):  # noqa: F811  (the imported fixture)
    """A link cannot be made private after the fact: a check-in photo is uploaded as a file."""
    _, photos = stored()
    status = await _request(
        "POST",
        f"/api/v1/properties/{uuid.uuid4()}/photos",
        _user_principal(UserRole.OWNER),
        json={"url": s3.build_public_url(url), "audience": "guest"},
    )
    assert status == 400
    assert photos.saved == []
