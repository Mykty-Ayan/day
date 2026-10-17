"""Reading a platform's iCal calendar by its link.

The link is typed by the owner, and the server fetches it, so:
- only a public address is fetched, and the request goes to the very address
  that was checked (the name is not resolved again): a link cannot reach Day's
  own services, also not by a name that answers differently the second time;
- no redirects, no compressed answers, 2 MB at most;
- one deadline for the whole read, and few reads at once: a platform that
  answers a byte at a time holds nothing for long.
"""

from __future__ import annotations

import asyncio
import ipaddress
import socket
from urllib.parse import urlsplit, urlunsplit

import httpx

from app.application.booking.calendar_feeds import FeedError

# A year of nights is a few hundred kilobytes; a calendar this big is not one.
MAX_BYTES = 2 * 1024 * 1024
TIMEOUT_SECONDS = 20
TOTAL_SECONDS = 30
_SLOTS = asyncio.Semaphore(8)


async def _resolve(host: str, port: int, **kwargs):
    return await asyncio.get_running_loop().getaddrinfo(host, port, type=socket.SOCK_STREAM, **kwargs)


def _client(**kwargs) -> httpx.AsyncClient:
    return httpx.AsyncClient(**kwargs)


async def fetch_calendar(url: str) -> str:
    try:
        async with asyncio.timeout(TOTAL_SECONDS):
            async with _SLOTS:
                return await _fetch(url)
    except TimeoutError:
        raise FeedError("The calendar did not answer in time")


async def _fetch(url: str) -> str:
    try:
        parts = urlsplit(url)
        host = parts.hostname
        port = parts.port or (443 if parts.scheme == "https" else 80)
    except ValueError:
        raise FeedError("The link is not a valid address")
    if parts.scheme not in ("http", "https") or not host:
        raise FeedError("Only http(s) links")
    try:
        addresses = [ipaddress.ip_address(info[4][0]) for info in await _resolve(host, port)]
    except (OSError, ValueError):
        raise FeedError("The calendar's address does not resolve")
    if not addresses or not all(address.is_global for address in addresses):
        raise FeedError("The calendar's address is not public")

    pinned = addresses[0]
    netloc = f"[{pinned}]:{port}" if pinned.version == 6 else f"{pinned}:{port}"
    named = f"[{host}]" if ":" in host else host
    headers = {
        "Host": named if parts.port is None else f"{named}:{port}",
        "User-Agent": "DayPMS-Calendar/1.0",
        "Accept-Encoding": "identity",
    }
    # TLS is checked against the name, as if the name had been dialled.
    extensions = {"sni_hostname": host} if parts.scheme == "https" else {}
    target = urlunsplit((parts.scheme, netloc, parts.path or "/", parts.query, ""))
    try:
        async with _client(timeout=TIMEOUT_SECONDS, follow_redirects=False) as client:
            async with client.stream("GET", target, headers=headers, extensions=extensions) as answer:
                if answer.status_code != 200:
                    raise FeedError(f"HTTP {answer.status_code}")
                if answer.headers.get("content-encoding", "identity").lower() not in ("identity", ""):
                    raise FeedError("The calendar comes compressed")
                body = bytearray()
                # Compressed answers are refused above, so no chunk is inflated here.
                async for chunk in answer.aiter_bytes():
                    body.extend(chunk)
                    if len(body) > MAX_BYTES:
                        raise FeedError("The calendar is too large")
    except (httpx.HTTPError, httpx.InvalidURL):
        raise FeedError("The calendar cannot be read")
    return body.decode("utf-8", errors="replace")
