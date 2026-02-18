"""Tests for AI migration external photo download helpers."""

import pytest

from app.presentation.api.v1.ai_migration import _filename_from_url, _normalize_external_photo_url


class TestNormalizeExternalPhotoUrl:
    def test_accepts_krisha_cdn_url(self):
        url = "https://krisha-photos.kcdn.online/webp/a/1-full.jpg"
        assert _normalize_external_photo_url(url) == url

    def test_accepts_krisha_legacy_photo_host(self):
        url = "https://photos-b.krisha.kz/abc/photo.jpg"
        assert _normalize_external_photo_url(url) == url

    def test_rejects_non_http_scheme(self):
        with pytest.raises(ValueError, match="http/https"):
            _normalize_external_photo_url("file:///tmp/photo.jpg")

    def test_rejects_unknown_host(self):
        with pytest.raises(ValueError, match="not allowed"):
            _normalize_external_photo_url("https://example.com/photo.jpg")


class TestFilenameFromUrl:
    def test_extracts_filename(self):
        assert _filename_from_url("https://krisha-photos.kcdn.online/webp/a/1-full.jpg") == "1-full.jpg"

    def test_fallback_filename(self):
        assert _filename_from_url("https://krisha-photos.kcdn.online/") == "photo.jpg"
