"""A flat's point taken from its 2GIS link."""

from __future__ import annotations

import httpx
import pytest

from app.domain.auth.permissions import Permission
from app.infrastructure import map_point
from app.infrastructure.map_point import MapLinkError, MapPoint, find_point, point_in_page, point_in_url
from tests.test_property_facts import flat  # noqa: F401  (a fixture)

# As on 2GIS's page of a place: the route button and the place's data.
PAGE = (
    '<a href="/almaty/directions/points/%7C76.968466%2C43.269047%3B70000001023202654">Проехать</a>'
    '<a href="/almaty/directions/points/%7C76.9%2C43.2%3B70000001000000000">Рядом</a>'
)
DATA_ONLY = '{"id":"9430150454193659","locale":"ru_KZ","name":"Дом","point":{"lon":76.9999,"lat":43.30324}}'


def _serve(pages: dict[str, httpx.Response], seen: list[str]):
    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(str(request.url))
        return pages.get(str(request.url), httpx.Response(404))

    def client(**kwargs):
        return httpx.AsyncClient(transport=httpx.MockTransport(handler), **kwargs)

    return client


def test_a_point_in_the_link_is_read_as_it_is():
    assert point_in_url("https://2gis.kz/almaty/geo/70000001027395467/76.945623,43.238286") == MapPoint(
        43.238286, 76.945623
    )
    assert point_in_url("https://2gis.kz/almaty/firm/70000001027395467/76.945623%2C43.238286?m=1") == MapPoint(
        43.238286, 76.945623
    )
    # The object's number is not a point.
    assert point_in_url("https://2gis.kz/almaty/geo/9430021605163017") is None


def test_the_point_on_the_page_is_the_objects_own():
    assert point_in_page(PAGE, "70000001023202654") == MapPoint(43.269047, 76.968466)
    assert point_in_page(DATA_ONLY, "9430150454193659") == MapPoint(43.30324, 76.9999)
    assert point_in_page(PAGE, "123456789") is None


async def test_a_link_without_the_point_is_opened_on_2gis(monkeypatch):
    seen: list[str] = []
    url = "https://2gis.kz/almaty/firm/70000001023202654"
    monkeypatch.setattr(map_point, "_client", _serve({url: httpx.Response(200, text=PAGE)}, seen))
    assert await find_point(url) == MapPoint(43.269047, 76.968466)
    assert seen == [url]


async def test_a_short_link_is_followed_to_its_place(monkeypatch):
    seen: list[str] = []
    short = "https://go.2gis.com/abcd"
    place = "https://2gis.kz/almaty/geo/9430150454193659"
    pages = {
        short: httpx.Response(302, headers={"location": place}),
        place: httpx.Response(200, text=DATA_ONLY),
    }
    monkeypatch.setattr(map_point, "_client", _serve(pages, seen))
    assert await find_point(short) == MapPoint(43.30324, 76.9999)
    assert seen == [short, place]


async def test_a_short_link_to_a_point_needs_no_page(monkeypatch):
    seen: list[str] = []
    short = "https://go.2gis.com/abcd"
    place = "https://2gis.kz/almaty/geo/70000001027395467/76.945623,43.238286"
    pages = {short: httpx.Response(302, headers={"location": place}), place: httpx.Response(200, text="")}
    monkeypatch.setattr(map_point, "_client", _serve(pages, seen))
    assert await find_point(short) == MapPoint(43.238286, 76.945623)


async def test_a_redirect_off_2gis_is_not_followed(monkeypatch):
    seen: list[str] = []
    short = "https://go.2gis.com/abcd"
    pages = {short: httpx.Response(302, headers={"location": "http://127.0.0.1:8000/api/v1/health"})}
    monkeypatch.setattr(map_point, "_client", _serve(pages, seen))
    with pytest.raises(MapLinkError, match="No point"):
        await find_point(short)
    assert seen == [short]


async def test_only_2gis_links_are_opened(monkeypatch):
    seen: list[str] = []
    monkeypatch.setattr(map_point, "_client", _serve({}, seen))
    for url in (
        "https://yandex.kz/maps/?pt=76.9,43.2",
        "https://evil.com/2gis.kz",
        "https://2gis.kz.evil.com/x",
        "file:///etc/passwd",
        "not a link",
    ):
        with pytest.raises(MapLinkError, match="2GIS"):
            await find_point(url)
    assert seen == []


async def test_a_page_without_the_point_is_reported(monkeypatch):
    seen: list[str] = []
    url = "https://2gis.kz/almaty/firm/70000001028054811"
    monkeypatch.setattr(map_point, "_client", _serve({url: httpx.Response(200, text='"point":null')}, seen))
    with pytest.raises(MapLinkError, match="No point"):
        await find_point(url)


async def test_the_map_centre_is_the_last_resort(monkeypatch):
    seen: list[str] = []
    url = "https://2gis.kz/almaty/firm/70000001028054811?m=76.95%2C43.24%2F17"
    monkeypatch.setattr(map_point, "_client", _serve({url: httpx.Response(200, text="")}, seen))
    assert await find_point(url) == MapPoint(43.24, 76.95)


@pytest.mark.integration
async def test_the_point_through_the_api(flat, monkeypatch):  # noqa: F811  (the imported fixture)
    from app.presentation.api.v1 import properties

    async def find(url):
        if "2gis" not in url:
            raise MapLinkError(map_point.NOT_2GIS)
        return MapPoint(43.238286, 76.945623)

    monkeypatch.setattr(properties, "find_point", find)
    client, _prop, use = flat
    body = {"url": "https://go.2gis.com/abcd"}

    use(Permission.PROPERTIES_READ)
    assert (await client.post("/api/v1/properties/map-point", json=body)).status_code == 403

    use(Permission.PROPERTIES_READ, Permission.PROPERTIES_WRITE)
    found = await client.post("/api/v1/properties/map-point", json=body)
    assert found.status_code == 200, found.text
    assert found.json() == {"latitude": 43.238286, "longitude": 76.945623}

    refused = await client.post("/api/v1/properties/map-point", json={"url": "https://yandex.kz/maps"})
    assert refused.status_code == 422 and refused.json()["detail"] == "Paste a 2GIS link"
