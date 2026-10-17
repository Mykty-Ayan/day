"""Reading a platform's iCal calendar by its link.

The link is typed by the owner, and the server fetches it: only a public address
is fetched, or the link would reach Day's own services (SSRF). The address is
checked before the request; DNS that changes between the check and the request
is the known gap (pinning the address to the connection would close it).
"""

from __future__ import annotations

import asyncio
import ipaddress
import socket
from urllib.parse import urlsplit

import httpx

from app.application.booking.calendar_feeds import FeedError

# A year of nights is a few hundred kilobytes; a calendar this big is not one.
MAX_BYTES = 2 * 1024 * 1024
TIMEOUT_SECONDS = 20


async def _resolve(host: str, port: int, **kwargs):
    return await asyncio.get_running_loop().getaddrinfo(host, port, type=socket.SOCK_STREAM, **kwargs)


async def fetch_calendar(url: str) -> str:
    parts = urlsplit(url)
    if parts.scheme not in ("http", "https") or not parts.hostname:
        raise FeedError("Only http(s) links")
    port = parts.port or (443 if parts.scheme == "https" else 80)
    try:
        addresses = await _resolve(parts.hostname, port)
    except OSError:
        raise FeedError("The calendar's address does not resolve")
    for *_, sockaddr in addresses:
        if not ipaddress.ip_address(sockaddr[0]).is_global:
            raise FeedError("The calendar's address is not public")
    try:
        # No redirects: one could lead to a private address past the check above.
        async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS, follow_redirects=False) as client:
            async with client.stream("GET", url, headers={"User-Agent": "DayPMS-Calendar/1.0"}) as answer:
                if answer.status_code != 200:
                    raise FeedError(f"HTTP {answer.status_code}")
                body = bytearray()
                async for chunk in answer.aiter_bytes():
                    body.extend(chunk)
                    if len(body) > MAX_BYTES:
                        raise FeedError("The calendar is too large")
    except httpx.HTTPError as error:
        raise FeedError(f"The calendar cannot be read: {type(error).__name__}")
    return body.decode("utf-8", errors="replace")
