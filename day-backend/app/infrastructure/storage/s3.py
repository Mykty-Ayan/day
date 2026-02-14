from __future__ import annotations

import asyncio
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


def _s3_client():
    return boto3.client(
        "s3",
        endpoint_url=settings.S3_ENDPOINT,
        aws_access_key_id=settings.S3_ACCESS_KEY,
        aws_secret_access_key=settings.S3_SECRET_KEY,
        region_name="us-east-1",
        config=Config(s3={"addressing_style": "path"}),
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


def _ensure_public_read(client) -> None:
    if not settings.S3_PUBLIC_READ:
        return

    policy = {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Sid": "PublicRead",
                "Effect": "Allow",
                "Principal": "*",
                "Action": ["s3:GetObject"],
                "Resource": [f"arn:aws:s3:::{settings.S3_BUCKET}/*"],
            }
        ],
    }
    client.put_bucket_policy(Bucket=settings.S3_BUCKET, Policy=json.dumps(policy))


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
    await asyncio.to_thread(_ensure_public_read, client)

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
