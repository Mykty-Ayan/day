"""Browser hardening headers on API responses."""

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app

EXPECTED = {
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "no-referrer",
    "strict-transport-security": "max-age=31536000; includeSubDomains",
}


async def _get(path: str):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.get(path)


@pytest.mark.asyncio
@pytest.mark.parametrize("path", ["/api/v1/health", "/api/v1/no-such-route", "/api/v1/properties"])
async def test_every_response_carries_security_headers(path):
    # 200, 404 and 401 alike: an error page is as frameable as a success.
    response = await _get(path)
    for name, value in EXPECTED.items():
        assert response.headers.get(name) == value, name
