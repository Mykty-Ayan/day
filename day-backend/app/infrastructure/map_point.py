"""A flat's point on the map, taken from its 2GIS link.

The owner pastes a 2GIS link; Day fills in latitude and longitude, and the guest's
Yandex, 2GIS and Google buttons are built from that point.

- A link with the point in it (…/geo/<id>/76.94,43.23) is read as it is.
- A short link (go.2gis.com/…) or a link to a building or a firm carries only the
  object's number: the server opens it and finds the object's point on 2GIS's page.
  The page is not an API: if 2GIS changes it, the point is not found and the owner
  types it by hand. A key for 2GIS's catalog API would be the steady way.
- Only 2GIS's own hosts are opened, also after a redirect: the link is typed by the
  owner, and the server must not reach anything else with it.
"""

from __future__ import annotations

import asyncio
import re
from dataclasses import dataclass
from urllib.parse import parse_qs, unquote, urljoin, urlsplit

import httpx

_HOSTS = ("2gis.kz", "2gis.ru", "2gis.com", "2gis.kg", "2gis.uz", "2gis.ae")
MAX_BYTES = 4 * 1024 * 1024  # a place's page weighs under a megabyte
MAX_REDIRECTS = 4
TOTAL_SECONDS = 15
_SLOTS = asyncio.Semaphore(4)

_NUMBER = r"-?\d{1,3}(?:\.\d+)?"
# A point in the path: /geo/<id>/76.94,43.23 — longitude first, as 2GIS writes it.
_POINT_IN_PATH = re.compile(rf"/({_NUMBER}),({_NUMBER})(?:/|$)")
_OBJECT_ID = re.compile(r"/(?:firm|geo)/(\d{6,})")


class MapLinkError(ValueError):
    pass


NOT_2GIS = "Paste a 2GIS link"
NOT_FOUND = "No point found in the link"


@dataclass(frozen=True)
class MapPoint:
    latitude: float
    longitude: float


def is_2gis(url: str) -> bool:
    try:
        parts = urlsplit(url.strip())
    except ValueError:
        return False
    host = (parts.hostname or "").lower()
    return parts.scheme in ("http", "https") and any(host == h or host.endswith("." + h) for h in _HOSTS)


def _point(lon: str, lat: str) -> MapPoint | None:
    longitude, latitude = float(lon), float(lat)
    if -90 <= latitude <= 90 and -180 <= longitude <= 180:
        return MapPoint(latitude=latitude, longitude=longitude)
    return None


def point_in_url(url: str) -> MapPoint | None:
    """The object's point when the link carries it in its path."""
    found = _POINT_IN_PATH.search(unquote(urlsplit(url).path))
    return _point(*found.groups()) if found else None


def centre_in_url(url: str) -> MapPoint | None:
    """Where the map was looking (?m=76.94,43.23/17): the last resort, as it may be
    off the object if the map was moved before sharing."""
    for value in parse_qs(urlsplit(url).query).get("m", []):
        found = re.fullmatch(rf"({_NUMBER}),({_NUMBER})(?:/[\d.]+)?", value)
        if found:
            return _point(*found.groups())
    return None


def object_id(url: str) -> str | None:
    found = _OBJECT_ID.search(urlsplit(url).path)
    return found.group(1) if found else None


def point_in_page(page: str, object_id: str) -> MapPoint | None:
    """The object's own point on its 2GIS page: the route button to it carries
    "|<lon>,<lat>;<id>", the place's data carries "id":"<id>" … "point":{…}."""
    oid = re.escape(object_id)
    found = re.search(rf"\|({_NUMBER}),({_NUMBER});{oid}\b", unquote(page))
    if found is None:
        found = re.search(rf'"id":"{oid}"[^{{}}]*?"point":\{{"lon":({_NUMBER}),"lat":({_NUMBER})\}}', page)
    return _point(*found.groups()) if found else None


def _client(**kwargs) -> httpx.AsyncClient:
    return httpx.AsyncClient(**kwargs)


async def _open(url: str) -> tuple[str, str]:
    """The address the link leads to, and the page there. Each hop stays on 2GIS."""
    async with _client(timeout=TOTAL_SECONDS, follow_redirects=False) as client:
        for _ in range(MAX_REDIRECTS + 1):
            if not is_2gis(url):
                raise MapLinkError(NOT_FOUND)
            async with client.stream("GET", url, headers={"User-Agent": "Mozilla/5.0 (DayPMS)"}) as answer:
                if answer.is_redirect and answer.headers.get("location"):
                    url = urljoin(url, answer.headers["location"])
                    continue
                if answer.status_code != 200:
                    raise MapLinkError(NOT_FOUND)
                body = bytearray()
                async for chunk in answer.aiter_bytes():
                    body += chunk
                    if len(body) > MAX_BYTES:
                        raise MapLinkError(NOT_FOUND)
                return url, body.decode(answer.encoding or "utf-8", errors="replace")
    raise MapLinkError(NOT_FOUND)


async def find_point(url: str) -> MapPoint:
    url = url.strip()
    if not is_2gis(url):
        raise MapLinkError(NOT_2GIS)
    point = point_in_url(url)
    if point:
        return point
    try:
        async with asyncio.timeout(TOTAL_SECONDS), _SLOTS:
            final, page = await _open(url)
    except (TimeoutError, httpx.HTTPError):
        raise MapLinkError(NOT_FOUND)
    point = point_in_url(final)
    oid = object_id(final) or object_id(url)
    if point is None and oid:
        point = point_in_page(page, oid)
    point = point or centre_in_url(final) or centre_in_url(url)
    if point is None:
        raise MapLinkError(NOT_FOUND)
    return point
