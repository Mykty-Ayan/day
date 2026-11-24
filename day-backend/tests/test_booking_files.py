"""Booking files: guests' documents stay behind the API, and only documents get in."""

import uuid

import pytest

from app.config import settings
from app.domain.auth.value_objects import UserRole
from app.infrastructure.storage import s3
from app.presentation.api.v1 import bookings
from tests.test_api_permissions import COMPANY_ID, _Obj, _Repo, _request, _user_principal, fake_repos  # noqa: F401


class _FileRepo(_Repo):
    def __init__(self):
        super().__init__(None)
        self.created = []

    async def create(self, file):
        self.created.append(file)
        return file


@pytest.fixture
def uploads(monkeypatch, fake_repos):  # noqa: F811  (the imported fixture)
    sent = []

    async def fake_upload(**kwargs):
        sent.append(kwargs)
        return "http://minio:9000/day-uploads/bookings/x/file"

    monkeypatch.setattr(bookings, "upload_booking_file", fake_upload)
    files = _FileRepo()
    fake_repos(booking=_Repo(_Obj(company_id=COMPANY_ID)), file=files)
    return sent, files


async def _upload(name: str, content: bytes, content_type: str) -> int:
    path = f"/api/v1/bookings/{uuid.uuid4()}/files"
    return await _request(
        "POST", path, _user_principal(UserRole.MANAGER), files={"file": (name, content, content_type)}
    )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("name", "content_type"),
    [("passport.jpg", "image/jpeg"), ("contract.pdf", "application/pdf"), ("receipt.png", "image/png")],
)
async def test_a_document_or_photo_is_stored(uploads, name, content_type):
    sent, files = uploads
    assert await _upload(name, b"%PDF-1.4 fine", content_type) == 201
    assert len(sent) == 1 and len(files.created) == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("content_type", ["text/html", "image/svg+xml", "application/x-msdownload"])
async def test_a_file_that_a_browser_could_run_is_refused(uploads, content_type):
    sent, files = uploads
    assert await _upload("page", b"<script>alert(1)</script>", content_type) == 415
    assert sent == [] and files.created == []


@pytest.mark.asyncio
async def test_an_oversized_file_is_refused(uploads, monkeypatch):
    sent, files = uploads
    monkeypatch.setattr(settings, "S3_MAX_UPLOAD_BYTES", 10)
    assert await _upload("scan.jpg", b"x" * 11, "image/jpeg") == 413
    assert sent == [] and files.created == []


class _StoredFile(_Repo):
    def __init__(self, booking_id):
        self.file = _Obj(id=uuid.uuid4(), booking_id=booking_id, file_url="http://minio:9000/day-uploads/bookings/x/file")
        self.deleted = []

    async def get_by_id(self, file_id):
        return self.file if file_id == self.file.id else None

    async def delete(self, file_id):
        self.deleted.append(file_id)


@pytest.fixture
def stored(monkeypatch, fake_repos):  # noqa: F811  (the imported fixture)
    booking_id = uuid.uuid4()
    files = _StoredFile(booking_id)
    removed = []

    async def fake_delete(*, file_url):
        removed.append(file_url)

    monkeypatch.setattr(bookings, "delete_booking_file", fake_delete)
    fake_repos(booking=_Repo(_Obj(company_id=COMPANY_ID)), file=files)
    return booking_id, files, removed


async def _delete(booking_id, file_id) -> int:
    path = f"/api/v1/bookings/{booking_id}/files/{file_id}"
    return await _request("DELETE", path, _user_principal(UserRole.MANAGER))


@pytest.mark.asyncio
async def test_a_removed_file_leaves_the_storage_too(stored):
    booking_id, files, removed = stored
    assert await _delete(booking_id, files.file.id) == 204
    assert removed == [files.file.file_url]
    assert files.deleted == [files.file.id]


@pytest.mark.asyncio
async def test_a_file_the_storage_keeps_stays_listed(stored, monkeypatch):
    # A guest's document must not stay in the bucket with nothing pointing at it.
    booking_id, files, _ = stored

    async def broken(*, file_url):
        raise RuntimeError("storage is down")

    monkeypatch.setattr(bookings, "delete_booking_file", broken)
    assert await _delete(booking_id, files.file.id) == 500
    assert files.deleted == []


@pytest.mark.asyncio
async def test_a_file_of_another_booking_is_not_removed(stored):
    _, files, removed = stored
    assert await _delete(uuid.uuid4(), files.file.id) == 404
    assert removed == [] and files.deleted == []


class _Removing:
    def __init__(self):
        self.calls = []

    def delete_object(self, **kwargs):
        self.calls.append(kwargs)


@pytest.mark.asyncio
async def test_the_file_is_deleted_by_its_key(monkeypatch):
    client = _Removing()
    monkeypatch.setattr(s3, "_s3_client", lambda: client)
    url = f"http://minio:9000/{settings.S3_BUCKET}/bookings/x/passport.pdf"
    await s3.delete_booking_file(file_url=url)
    assert client.calls == [{"Bucket": settings.S3_BUCKET, "Key": "bookings/x/passport.pdf"}]


@pytest.mark.parametrize("name", ["passport#1.pdf", "passport?copy.pdf", "passport%20scan.pdf", "паспорт.pdf"])
def test_the_key_is_read_back_as_it_was_written(name):
    # The URL is the key glued on, not encoded: '#', '?' and '%' are part of the name.
    key = f"bookings/x/{uuid.uuid4()}-{name}"
    assert s3._extract_key(s3.build_public_url(key)) == key


class _Bucket:
    def __init__(self):
        self.policies = []

    def put_bucket_policy(self, **kwargs):
        self.policies.append(kwargs)


def _readable(bucket) -> list[str]:
    import json

    return json.loads(bucket.policies[-1]["Policy"])["Statement"][0]["Resource"]


def test_the_bucket_shows_only_listing_and_minibar_photos():
    # The policy replaces one left by an earlier deploy that opened everything.
    bucket = _Bucket()
    s3.apply_read_policy(bucket)
    assert _readable(bucket) == [
        f"arn:aws:s3:::{settings.S3_BUCKET}/properties/*",
        f"arn:aws:s3:::{settings.S3_BUCKET}/products/*",
    ]


@pytest.mark.asyncio
async def test_the_startup_sync_keeps_trying_until_storage_answers(monkeypatch):
    import asyncio

    from app import main

    calls = []

    async def flaky():
        calls.append(1)
        if len(calls) < 3:
            raise ConnectionError("minio not up yet")

    monkeypatch.setattr(s3, "sync_read_policy", flaky)
    monkeypatch.setattr(main, "_STORAGE_RETRY_FIRST_DELAY", 0.001)
    await asyncio.wait_for(main._sync_storage_read_policy(asyncio.Event()), timeout=2)
    assert len(calls) == 3


@pytest.mark.asyncio
async def test_the_startup_sync_stops_with_the_api(monkeypatch):
    import asyncio

    from app import main

    async def down():
        raise ConnectionError("minio down")

    monkeypatch.setattr(s3, "sync_read_policy", down)
    stop = asyncio.Event()
    stop.set()
    await asyncio.wait_for(main._sync_storage_read_policy(stop), timeout=2)


@pytest.mark.asyncio
async def test_the_startup_sync_uses_one_short_attempt(monkeypatch):
    # A hung MinIO must not keep the API from stopping: a request in a worker
    # thread cannot be cancelled, so it has to give up on its own, quickly.
    seen = {}

    def fake_client(**config):
        seen.update(config)
        return _Bucket()

    monkeypatch.setattr(s3, "_s3_client", fake_client)
    monkeypatch.setattr(s3, "_ensure_bucket", lambda client: None)
    await s3.sync_read_policy()
    assert seen["connect_timeout"] <= 5 and seen["read_timeout"] <= 10
    assert seen["retries"] == {"total_max_attempts": 1}
