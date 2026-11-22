"""Tests for AI migration external photo download helpers."""

import httpx
import pytest

from app.presentation.api.v1.ai_migration import (
    _fetch_external_photo,
    _filename_from_url,
    _normalize_external_photo_url,
)


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


class TestFetchExternalPhoto:
    """Every redirect hop is checked against the allowed hosts, not the first URL alone."""

    @staticmethod
    def _client(routes: dict[str, httpx.Response]) -> httpx.AsyncClient:
        def handle(request: httpx.Request) -> httpx.Response:
            return routes[str(request.url)]

        return httpx.AsyncClient(transport=httpx.MockTransport(handle))

    async def test_refuses_a_redirect_to_a_host_not_allowed(self):
        start = "https://krisha-photos.kcdn.online/webp/a/1-full.jpg"
        inner = "http://169.254.169.254/latest/meta-data/"
        client = self._client({
            start: httpx.Response(302, headers={"location": inner}),
            inner: httpx.Response(200, headers={"content-type": "image/jpeg"}, content=b"secret"),
        })
        async with client:
            with pytest.raises(ValueError, match="not allowed"):
                await _fetch_external_photo(client, start)

    async def test_follows_a_redirect_within_the_allowed_hosts(self):
        start = "https://krisha-photos.kcdn.online/webp/a/1-full.jpg"
        moved = "https://photos-b.krisha.kz/abc/photo.jpg"
        client = self._client({
            start: httpx.Response(301, headers={"location": moved}),
            moved: httpx.Response(200, headers={"content-type": "image/jpeg"}, content=b"jpeg"),
        })
        async with client:
            response = await _fetch_external_photo(client, start)
        assert (response.status_code, response.content) == (200, b"jpeg")

    async def test_stops_after_three_redirects(self):
        hops = [f"https://krisha-photos.kcdn.online/{n}.jpg" for n in range(5)]
        client = self._client({a: httpx.Response(302, headers={"location": b}) for a, b in zip(hops, hops[1:])})
        async with client:
            with pytest.raises(ValueError, match="redirects"):
                await _fetch_external_photo(client, hops[0])
