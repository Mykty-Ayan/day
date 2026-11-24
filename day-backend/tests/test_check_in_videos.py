"""Check-in videos (the lock, the way in, how to use a thing) and their places on the guest's booking page."""

import pytest

from app.application.property.manage_photos import ManagePhotosService
from app.config import settings
from app.domain.auth.permissions import Permission
from app.domain.property.value_objects import FactAudience, GuestMediaSection, MediaKind
from app.infrastructure.storage import s3
from app.presentation.api.v1 import properties
from tests.test_property_facts import flat  # noqa: F401  (a fixture)
from tests.test_property_photo_upload import JPEG, _upload, stored  # noqa: F401  (a fixture)
from tests.test_property_services import FakePropertyPhotoRepository, FakePropertyRepository, _make_property

MP4 = b"\x00\x00\x00\x18ftypisom" + b"\x00" * 32
MOV = b"\x00\x00\x00\x14ftypqt  " + b"\x00" * 32
WEBM = b"\x1a\x45\xdf\xa3" + b"\x00" * 32


@pytest.mark.asyncio
@pytest.mark.parametrize(("content", "stored_as"), [(MP4, "video/mp4"), (MOV, "video/quicktime"), (WEBM, "video/webm")])
async def test_a_check_in_video_from_a_phone_is_kept_private_in_its_place(stored, content, stored_as):  # noqa: F811
    sent, photos = stored()
    assert (
        await _upload(content_type="application/octet-stream", content=content, audience="guest", section="door") == 201
    )
    assert (sent[0]["content_type"], sent[0]["private"]) == (stored_as, True)
    saved = photos.saved[0]
    assert (saved.kind, saved.section, saved.audience) == (MediaKind.VIDEO, GuestMediaSection.DOOR, FactAudience.GUEST)


@pytest.mark.asyncio
async def test_a_check_in_photo_stays_a_photo_and_goes_on_the_way_in_by_default(stored):  # noqa: F811
    _, photos = stored()
    assert await _upload(audience="guest") == 201
    assert (photos.saved[0].kind, photos.saved[0].section) == (MediaKind.PHOTO, GuestMediaSection.PATH)


@pytest.mark.asyncio
async def test_the_listing_takes_no_video_and_no_place_on_the_guest_page(stored):  # noqa: F811
    # The listing goes to OTAs and guests who have not booked: pictures only.
    sent, photos = stored()
    assert await _upload(content_type="video/mp4", content=MP4) == 415
    assert await _upload(section="howto") == 400
    assert sent == [] and photos.saved == []


@pytest.mark.asyncio
async def test_a_video_has_its_own_size_limit(stored, monkeypatch):  # noqa: F811
    sent, _ = stored()
    monkeypatch.setattr(settings, "S3_MAX_UPLOAD_BYTES", 10)
    # A minute from a phone is larger than a photo may be.
    assert await _upload(content=MP4, audience="guest") == 201
    monkeypatch.setattr(settings, "S3_MAX_VIDEO_BYTES", 10)
    assert await _upload(content=MP4, audience="guest") == 413
    assert len(sent) == 1


@pytest.mark.asyncio
async def test_a_heic_photo_is_not_taken_for_a_video(stored):  # noqa: F811
    # HEIC opens with the same box as MP4; browsers show neither as a picture.
    sent, _ = stored()
    assert await _upload(content=b"\x00\x00\x00\x18ftypheic" + b"\x00" * 32, audience="guest") == 415
    assert sent == []


async def test_the_service_keeps_videos_and_places_for_check_in_only():
    props, photos = FakePropertyRepository(), FakePropertyPhotoRepository()
    prop = _make_property()
    await props.save(prop)
    svc = ManagePhotosService(props, photos)
    for kind, section in ((MediaKind.VIDEO, GuestMediaSection.PATH), (MediaKind.PHOTO, GuestMediaSection.DOOR)):
        with pytest.raises(ValueError, match="check-in"):
            await svc.add_photo(prop.id, prop.company_id, "https://x/a.mp4", kind=kind, section=section)
    howto = await svc.add_photo(
        prop.id,
        prop.company_id,
        "https://x/ac.mp4",
        caption="Кондиционер\nпульт в тумбочке",
        audience=FactAudience.GUEST,
        kind=MediaKind.VIDEO,
        section=GuestMediaSection.HOWTO,
    )
    assert [(p.kind, p.section) for p in await photos.list_by_property(prop.id)] == [
        (howto.kind, GuestMediaSection.HOWTO)
    ]


@pytest.mark.integration
async def test_a_stored_video_keeps_its_kind_and_place(flat, monkeypatch):  # noqa: F811  (the imported fixture)
    client, prop, use = flat
    stored_video = s3.build_public_url(f"checkin/{prop}/lock.mp4")

    async def fake_upload(**kwargs):
        return stored_video

    monkeypatch.setattr(properties, "upload_property_photo", fake_upload)
    use(Permission.PROPERTIES_READ, Permission.PROPERTIES_WRITE, Permission.PROPERTY_SECRETS_READ)
    created = await client.post(
        f"/api/v1/properties/{prop}/photos/upload",
        files={"file": ("lock.mp4", MP4, "video/mp4")},
        data={"audience": "guest", "section": "door", "caption": "Замок"},
    )
    assert created.status_code == 201, created.text
    photo = await client.post(
        f"/api/v1/properties/{prop}/photos/upload",
        files={"file": ("yard.jpg", JPEG, "image/jpeg")},
        data={"audience": "guest"},
    )
    assert photo.status_code == 201, photo.text
    listed = (await client.get(f"/api/v1/properties/{prop}")).json()["photos"]
    assert sorted((p["kind"], p["section"]) for p in listed) == [("photo", "path"), ("video", "door")]
