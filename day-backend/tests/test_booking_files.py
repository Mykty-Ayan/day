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


class _Bucket:
    def __init__(self):
        self.policies = []

    def put_bucket_policy(self, **kwargs):
        self.policies.append(kwargs)


def _readable(bucket) -> list[str]:
    import json

    return json.loads(bucket.policies[-1]["Policy"])["Statement"][0]["Resource"]


def test_the_bucket_shows_only_listing_photos():
    # The policy replaces one left by an earlier deploy that opened everything.
    bucket = _Bucket()
    s3.apply_read_policy(bucket)
    assert _readable(bucket) == [f"arn:aws:s3:::{settings.S3_BUCKET}/properties/*"]


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
