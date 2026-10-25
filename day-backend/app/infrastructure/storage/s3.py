from __future__ import annotations

import asyncio
import functools
import json
import os
import uuid
from urllib.parse import unquote, urlparse

import boto3
from botocore.client import Config
from botocore.exceptions import ClientError

from app.config import settings


class FileTooLargeError(Exception):
    def __init__(self, max_bytes: int, actual_bytes: int | None = None) -> None:
        self.max_bytes = max_bytes
        self.actual_bytes = actual_bytes
        super().__init__("File exceeds maximum download size")


def _s3_client(**config):
    return boto3.client(
        "s3",
        endpoint_url=settings.S3_ENDPOINT,
        aws_access_key_id=settings.S3_ACCESS_KEY,
        aws_secret_access_key=settings.S3_SECRET_KEY,
        region_name="us-east-1",
        config=Config(s3={"addressing_style": "path"}, **config),
    )


def _ensure_bucket(client) -> None:
    try:
        client.head_bucket(Bucket=settings.S3_BUCKET)
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code", "")
        if code in {"404", "NoSuchBucket", "NotFound"}:
            client.create_bucket(Bucket=settings.S3_BUCKET)
            return
        raise


PROPERTY_PHOTOS_PREFIX = "properties/"
# Check-in photos (the entrance, the lock): outside the public prefix, handed
# out only as signed links to those who may see door codes.
CHECKIN_PHOTOS_PREFIX = "checkin/"
# Minibar products: shown on the guest's panel, public as listing photos are.
PRODUCT_PHOTOS_PREFIX = "products/"
#: Long enough for the CRM to hand a link to WhatsApp, short enough that a
#: forwarded link or one kept after access was revoked dies within the hour.
CHECKIN_PHOTO_LINK_SECONDS = 3600


def apply_read_policy(client) -> None:
    """Set who may read the bucket without signing in.

    Listing photos (properties/…) and minibar products (products/…) are public by nature: guests, OTAs and the
    CRM open them by link. Everything else — booking files, guests'
    documents — is served only through the API, with no switch to open it.
    Applying the policy replaces one left by an earlier deploy, so a bucket
    made public before closes again.
    """
    policy = {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Sid": "PublicRead",
                "Effect": "Allow",
                "Principal": "*",
                "Action": ["s3:GetObject"],
                "Resource": [
                    f"arn:aws:s3:::{settings.S3_BUCKET}/{prefix}*"
                    for prefix in (PROPERTY_PHOTOS_PREFIX, PRODUCT_PHOTOS_PREFIX)
                ],
            }
        ],
    }
    client.put_bucket_policy(Bucket=settings.S3_BUCKET, Policy=json.dumps(policy))


async def sync_read_policy() -> None:
    """Apply the read policy at startup, so a bucket left public is closed without waiting for an upload."""
    # One short attempt: the caller retries with its own pause, and a request
    # stuck in a worker thread cannot be cancelled — boto's defaults (60 s,
    # several retries) would hold up the API's shutdown that long.
    client = _s3_client(connect_timeout=3, read_timeout=5, retries={"total_max_attempts": 1})
    await asyncio.to_thread(_ensure_bucket, client)
    await asyncio.to_thread(apply_read_policy, client)


def build_public_url(key: str) -> str:
    base = settings.S3_PUBLIC_ENDPOINT or settings.S3_ENDPOINT
    return f"{base.rstrip('/')}/{settings.S3_BUCKET}/{key}"


def _sanitize_filename(name: str | None) -> str:
    if not name:
        return "file"
    return os.path.basename(name)


def _extract_key(file_url: str) -> str:
    if not file_url:
        raise ValueError("Empty file URL")

    parsed = urlparse(file_url)
    path = unquote(parsed.path or "").lstrip("/")
    bucket_prefix = f"{settings.S3_BUCKET}/"
    if path.startswith(bucket_prefix):
        return path[len(bucket_prefix):]
    return path


async def upload_booking_file(
    *,
    booking_id: uuid.UUID,
    file_obj,
    filename: str | None,
    content_type: str | None,
) -> str:
    client = _s3_client()
    await asyncio.to_thread(_ensure_bucket, client)
    await asyncio.to_thread(apply_read_policy, client)

    safe_name = _sanitize_filename(filename)
    key = f"bookings/{booking_id}/{uuid.uuid4()}-{safe_name}"

    extra: dict[str, str] = {}
    if content_type:
        extra["ContentType"] = content_type

    try:
        file_obj.seek(0)
    except Exception:
        pass

    await asyncio.to_thread(
        client.upload_fileobj,
        file_obj,
        settings.S3_BUCKET,
        key,
        ExtraArgs=extra,
    )

    return build_public_url(key)


_PHOTO_EXTENSIONS = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}


async def upload_property_photo(*, property_id: uuid.UUID, file_obj, content_type: str, private: bool = False) -> str:
    """Store a listing photo under the public prefix, or a check-in photo under the private one."""
    client = _s3_client()
    await asyncio.to_thread(_ensure_bucket, client)
    await asyncio.to_thread(apply_read_policy, client)
    prefix = CHECKIN_PHOTOS_PREFIX if private else PROPERTY_PHOTOS_PREFIX
    key = f"{prefix}{property_id}/{uuid.uuid4()}{_PHOTO_EXTENSIONS.get(content_type, '')}"
    try:
        file_obj.seek(0)
    except Exception:
        pass
    await asyncio.to_thread(
        client.upload_fileobj, file_obj, settings.S3_BUCKET, key, ExtraArgs={"ContentType": content_type}
    )
    return build_public_url(key)


async def upload_product_photo(*, company_id: uuid.UUID, file_obj, content_type: str) -> str:
    """Store a minibar product's picture under its public prefix."""
    client = _s3_client()
    await asyncio.to_thread(_ensure_bucket, client)
    await asyncio.to_thread(apply_read_policy, client)
    key = f"{PRODUCT_PHOTOS_PREFIX}{company_id}/{uuid.uuid4()}{_PHOTO_EXTENSIONS.get(content_type, '')}"
    await asyncio.to_thread(
        client.upload_fileobj, file_obj, settings.S3_BUCKET, key, ExtraArgs={"ContentType": content_type}
    )
    return build_public_url(key)


@functools.cache
def _signing_client():
    # Signed for the address guests open: the signature covers the host.
    return boto3.client(
        "s3",
        endpoint_url=settings.S3_PUBLIC_ENDPOINT or settings.S3_ENDPOINT,
        aws_access_key_id=settings.S3_ACCESS_KEY,
        aws_secret_access_key=settings.S3_SECRET_KEY,
        region_name="us-east-1",
        config=Config(s3={"addressing_style": "path"}, signature_version="s3v4"),
    )


def signed_photo_url(url: str) -> str:
    """A stored check-in photo as a link that expires; any other URL as it is.

    Signing is local (no request to storage). A link the owner pasted from
    elsewhere is not ours to protect and passes through.
    """
    if not url.startswith(build_public_url(CHECKIN_PHOTOS_PREFIX)):
        return url
    return _signing_client().generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.S3_BUCKET, "Key": _extract_key(url)},
        ExpiresIn=CHECKIN_PHOTO_LINK_SECONDS,
    )


async def download_booking_file(*, file_url: str) -> tuple[bytes, str | None]:
    client = _s3_client()
    key = _extract_key(file_url)
    max_bytes = settings.S3_MAX_DOWNLOAD_BYTES

    def _get():
        obj = client.get_object(Bucket=settings.S3_BUCKET, Key=key)
        content_length = obj.get("ContentLength")
        if content_length is not None and content_length > max_bytes:
            raise FileTooLargeError(max_bytes=max_bytes, actual_bytes=content_length)
        body = obj["Body"].read(max_bytes + 1)
        if len(body) > max_bytes:
            raise FileTooLargeError(max_bytes=max_bytes, actual_bytes=len(body))
        return body, obj.get("ContentType")

    return await asyncio.to_thread(_get)
