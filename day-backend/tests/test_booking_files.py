"""Booking files: guests' documents stay behind the API, and only documents get in."""

import uuid

import pytest
from botocore.exceptions import ClientError

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
    def __init__(self, error: str | None = None):
        self.calls = []
        self._error = error

    def put_bucket_policy(self, **kwargs):
        self.calls.append("put")

    def delete_bucket_policy(self, **kwargs):
        self.calls.append("delete")
        if self._error:
            raise ClientError({"Error": {"Code": self._error}}, "DeleteBucketPolicy")


def test_a_private_bucket_drops_a_public_policy_left_from_before(monkeypatch):
    monkeypatch.setattr(settings, "S3_PUBLIC_READ", False)
    bucket = _Bucket()
    s3.apply_read_policy(bucket)
    assert bucket.calls == ["delete"]


def test_a_bucket_without_a_policy_is_already_private(monkeypatch):
    monkeypatch.setattr(settings, "S3_PUBLIC_READ", False)
    s3.apply_read_policy(_Bucket(error="NoSuchBucketPolicy"))


def test_public_read_is_still_available_when_asked_for(monkeypatch):
    monkeypatch.setattr(settings, "S3_PUBLIC_READ", True)
    bucket = _Bucket()
    s3.apply_read_policy(bucket)
    assert bucket.calls == ["put"]


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
