"""A listing photo is uploaded as a file from the web, not only linked by URL."""

import uuid

import pytest

from app.config import settings
from app.domain.auth.value_objects import UserRole
from app.presentation.api.v1 import properties
from tests.test_api_permissions import COMPANY_ID, _Obj, _request, _Session, _user_principal


class _Photos:
    def __init__(self):
        self.saved = []

    async def save(self, photo):
        self.saved.append(photo)
        return photo


class _Property:
    def __init__(self, company_id):
        self._row = _Obj(company_id=company_id)

    async def get_by_id(self, _id):
        return self._row


@pytest.fixture
def stored(monkeypatch):
    from app.presentation.api import deps

    sent, photos = [], _Photos()

    async def fake_upload(**kwargs):
        sent.append(kwargs)
        return f"https://files.example.com/day-uploads/properties/{kwargs['property_id']}/x.jpg"

    def install(company_id=COMPANY_ID):
        monkeypatch.setattr(properties, "upload_property_photo", fake_upload)
        monkeypatch.setattr(properties, "_repos", lambda session: {"property": _Property(company_id), "photo": photos})
        from app.main import app

        app.dependency_overrides[deps.get_session] = lambda: _Session()
        return sent, photos

    yield install
    from app.main import app

    app.dependency_overrides.pop(deps.get_session, None)


async def _upload(content_type="image/jpeg", content=b"\xff\xd8 photo", **form) -> int:
    return await _request(
        "POST",
        f"/api/v1/properties/{uuid.uuid4()}/photos/upload",
        _user_principal(UserRole.MANAGER),
        files={"file": ("room.jpg", content, content_type)},
        data={k: str(v).lower() if isinstance(v, bool) else str(v) for k, v in form.items()},
    )


@pytest.mark.asyncio
async def test_a_photo_file_becomes_a_listing_photo(stored):
    sent, photos = stored()
    assert await _upload(sort_order=2, is_cover=True) == 201
    assert sent[0]["content_type"] == "image/jpeg"
    assert photos.saved[0].sort_order == 2 and photos.saved[0].is_cover is True
    assert "/properties/" in photos.saved[0].url


@pytest.mark.asyncio
@pytest.mark.parametrize("content_type", ["application/pdf", "image/svg+xml", "text/html"])
async def test_only_photos_are_taken(stored, content_type):
    sent, photos = stored()
    assert await _upload(content_type=content_type) == 415
    assert sent == [] and photos.saved == []


@pytest.mark.asyncio
async def test_an_oversized_photo_is_refused(stored, monkeypatch):
    sent, _ = stored()
    monkeypatch.setattr(settings, "S3_MAX_UPLOAD_BYTES", 10)
    assert await _upload(content=b"x" * 11) == 413
    assert sent == []


@pytest.mark.asyncio
async def test_nothing_is_stored_for_another_companys_apartment(stored):
    sent, photos = stored(company_id=uuid.uuid4())
    assert await _upload() == 404
    assert sent == [] and photos.saved == []
