"""Unit tests for infrastructure parsers."""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from app.domain.value_objects import SourceType
from app.infrastructure.parsers.airbnb_parser import AirbnbParser
from app.infrastructure.parsers.booking_parser import BookingParser
from app.infrastructure.parsers.generic_parser import GenericParser
from app.infrastructure.parsers.krisha_parser import KrishaParser


class TestParserSourceTypes:
    def test_booking_parser_source_type(self):
        parser = BookingParser()
        assert parser.get_source_type() == SourceType.BOOKING

    def test_airbnb_parser_source_type(self):
        parser = AirbnbParser()
        assert parser.get_source_type() == SourceType.AIRBNB

    def test_krisha_parser_source_type(self):
        parser = KrishaParser()
        assert parser.get_source_type() == SourceType.KRISHA

    def test_generic_parser_source_type(self):
        parser = GenericParser()
        assert parser.get_source_type() == SourceType.OTHER


class TestBaseParserCleanHtml:
    def test_clean_html_removes_scripts(self):
        from app.infrastructure.parsers.base import BaseParser

        class TestParser(BaseParser):
            async def fetch_content(self, url: str) -> str:
                return ""

            def get_source_type(self) -> SourceType:
                return SourceType.OTHER

        parser = TestParser()
        html = "<html><body><script>alert('x')</script><p>Hello World</p></body></html>"
        result = parser._clean_html(html)
        assert "alert" not in result
        assert "Hello World" in result

    def test_clean_html_removes_styles(self):
        from app.infrastructure.parsers.base import BaseParser

        class TestParser(BaseParser):
            async def fetch_content(self, url: str) -> str:
                return ""

            def get_source_type(self) -> SourceType:
                return SourceType.OTHER

        parser = TestParser()
        html = "<html><body><style>.red{color:red}</style><p>Content</p></body></html>"
        result = parser._clean_html(html)
        assert "red" not in result
        assert "Content" in result

    def test_clean_html_removes_nav_footer(self):
        from app.infrastructure.parsers.base import BaseParser

        class TestParser(BaseParser):
            async def fetch_content(self, url: str) -> str:
                return ""

            def get_source_type(self) -> SourceType:
                return SourceType.OTHER

        parser = TestParser()
        html = "<html><body><nav>Menu items</nav><p>Main content</p><footer>Copyright 2024</footer></body></html>"
        result = parser._clean_html(html)
        assert "Menu items" not in result
        assert "Main content" in result
        assert "Copyright" not in result

    def test_clean_html_collapses_whitespace(self):
        from app.infrastructure.parsers.base import BaseParser

        class TestParser(BaseParser):
            async def fetch_content(self, url: str) -> str:
                return ""

            def get_source_type(self) -> SourceType:
                return SourceType.OTHER

        parser = TestParser()
        html = "<html><body><p>Line 1</p>\n\n\n\n<p>Line 2</p></body></html>"
        result = parser._clean_html(html)
        # Should not have more than one consecutive blank line
        assert "\n\n\n" not in result
        assert "Line 1" in result
        assert "Line 2" in result

    def test_extract_images(self):
        from app.infrastructure.parsers.base import BaseParser

        class TestParser(BaseParser):
            async def fetch_content(self, url: str) -> str:
                return ""

            def get_source_type(self) -> SourceType:
                return SourceType.OTHER

        parser = TestParser()
        html = (
            "<html><body>"
            '<img src="https://example.com/photo1.jpg" />'
            '<img data-src="https://example.com/photo2.jpg" />'
            '<img src="/relative/photo3.jpg" />'
            "</body></html>"
        )
        images = parser._extract_images(html)
        assert len(images) == 2
        assert "https://example.com/photo1.jpg" in images
        assert "https://example.com/photo2.jpg" in images

    def test_clean_html_truncates_long_content(self):
        from unittest.mock import patch

        from app.infrastructure.parsers.base import BaseParser

        class TestParser(BaseParser):
            async def fetch_content(self, url: str) -> str:
                return ""

            def get_source_type(self) -> SourceType:
                return SourceType.OTHER

        parser = TestParser()
        # Create HTML with very long content
        long_text = "A" * 200
        html = f"<html><body><p>{long_text}</p></body></html>"

        with patch("app.infrastructure.parsers.base.settings") as mock_settings:
            mock_settings.MAX_CONTENT_LENGTH = 50
            result = parser._clean_html(html)
            assert len(result) <= 50


# ---------- HTTP-level parser tests (mocked httpx) ----------


def _mock_httpx_response(html: str):
    """Helper: create a mock httpx response with sync .text and .raise_for_status()."""
    mock_response = MagicMock()
    mock_response.text = html
    mock_response.raise_for_status = MagicMock()
    return mock_response


def _patch_httpx_client(mock_response):
    """Helper: context manager that patches httpx.AsyncClient to return mock_response."""
    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=mock_response)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    return patch("app.infrastructure.parsers.base.httpx.AsyncClient", return_value=mock_client), mock_client


class TestBookingParserHTTP:
    @pytest.mark.asyncio
    async def test_returns_cleaned_content(self):
        html = (
            "<html><body>"
            "<script>var x = 1;</script>"
            "<h1>Beach Villa</h1>"
            "<p>2 bedrooms, sea view</p>"
            '<img src="https://example.com/photo.jpg" />'
            "</body></html>"
        )
        mock_response = _mock_httpx_response(html)
        patcher, mock_client = _patch_httpx_client(mock_response)

        with patcher:
            parser = BookingParser()
            result = await parser.fetch_content("https://www.booking.com/hotel/test")

        assert "Beach Villa" in result
        assert "2 bedrooms" in result
        assert "var x" not in result
        assert "https://example.com/photo.jpg" in result

    @pytest.mark.asyncio
    async def test_handles_booking_challenge_page(self):
        html = """
        <!DOCTYPE html>
        <html>
          <head>
            <script src="https://www.booking.com/__challenge_x/challenge.js"></script>
          </head>
          <body>
            <div id="challenge-container"></div>
          </body>
        </html>
        """
        mock_response = _mock_httpx_response(html)
        patcher, _ = _patch_httpx_client(mock_response)

        with patcher:
            parser = BookingParser()
            with pytest.raises(ValueError, match="anti-bot challenge"):
                await parser.fetch_content("https://www.booking.com/hotel/test")

    @pytest.mark.asyncio
    async def test_handles_timeout(self):
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(side_effect=httpx.TimeoutException("Connection timed out"))
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("app.infrastructure.parsers.base.httpx.AsyncClient", return_value=mock_client):
            parser = BookingParser()
            with pytest.raises(httpx.TimeoutException):
                await parser.fetch_content("https://www.booking.com/hotel/test")

    @pytest.mark.asyncio
    async def test_handles_404(self):
        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock(
            side_effect=httpx.HTTPStatusError(
                "404 Not Found",
                request=httpx.Request("GET", "https://www.booking.com/hotel/test"),
                response=httpx.Response(404),
            )
        )
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("app.infrastructure.parsers.base.httpx.AsyncClient", return_value=mock_client):
            parser = BookingParser()
            with pytest.raises(httpx.HTTPStatusError):
                await parser.fetch_content("https://www.booking.com/hotel/test")

    def test_source_type_is_booking(self):
        parser = BookingParser()
        assert parser.get_source_type() == SourceType.BOOKING


class TestAirbnbParserHTTP:
    @pytest.mark.asyncio
    async def test_returns_cleaned_content(self):
        html = (
            "<html><body>"
            "<nav>Airbnb Navigation</nav>"
            "<h1>Cozy Loft</h1>"
            "<p>City center studio</p>"
            '<img src="https://a0.muscache.com/photo.jpg" />'
            "</body></html>"
        )
        mock_response = _mock_httpx_response(html)
        patcher, mock_client = _patch_httpx_client(mock_response)

        with patcher:
            parser = AirbnbParser()
            result = await parser.fetch_content("https://www.airbnb.com/rooms/12345")

        assert "Cozy Loft" in result
        assert "City center studio" in result
        assert "Airbnb Navigation" not in result

    @pytest.mark.asyncio
    async def test_includes_airbnb_enrichment_block(self):
        deferred_state = {
            "sections": [
                {"sectionId": "LOCATION_DEFAULT", "section": {"lat": 43.2, "lng": 76.9, "title": "Almaty"}},
                {
                    "sectionId": "AMENITIES_DEFAULT",
                    "section": {
                        "seeAllAmenitiesGroups": [
                            {"title": "Essentials", "amenities": [{"title": "WiFi"}, {"title": "Kitchen"}]}
                        ]
                    },
                },
                {
                    "sectionId": "POLICIES_DEFAULT",
                    "section": {"houseRulesSections": [{"items": [{"title": "No smoking"}]}]},
                },
            ],
            "avgRatingA11yLabel": "Rated 4.95 out of 5",
        }
        html = (
            "<html><body>"
            '<script id="data-deferred-state-0" type="application/json">'
            + json.dumps(deferred_state)
            + "</script>"
            "</body></html>"
        )
        mock_response = _mock_httpx_response(html)
        patcher, _ = _patch_httpx_client(mock_response)

        with patcher:
            parser = AirbnbParser()
            result = await parser.fetch_content("https://www.airbnb.com/rooms/12345")

        assert "[AIRBNB_ENRICHMENT]" in result
        assert '"airbnb_listing_id": "12345"' in result
        assert '"latitude": 43.2' in result
        assert '"longitude": 76.9' in result
        assert '"airbnb_rating_label": "Rated 4.95 out of 5"' in result
        assert '"amenities": ["WiFi", "Kitchen"]' in result

    def test_source_type_is_airbnb(self):
        parser = AirbnbParser()
        assert parser.get_source_type() == SourceType.AIRBNB


class TestKrishaParserHTTP:
    def test_extracts_complex_name(self):
        html = (
            '<div class="offer__info-item" data-name="map.complex">'
            '<div class="offer__advert-short-info">'
            '<a href="/complex/show/almaty/meridian/">Meridian Apartments</a>'
            "</div>"
            "</div>"
        )
        complex_name = KrishaParser._extract_complex_name(html)
        assert complex_name == "Meridian Apartments"

    def test_extracts_complex_name_from_description_fallback(self):
        html = '<script>window.data={"advert":{"description":"жил. комплекс City Plus, 10 этажей"}};</script>'
        complex_name = KrishaParser._extract_complex_name(html)
        assert complex_name == "City Plus"

    def test_extracts_floor(self):
        html = (
            '<div class="offer__info-item" data-name="flat.floor">'
            '<div class="offer__advert-short-info">12 из 12</div>'
            "</div>"
        )
        floor = KrishaParser._extract_floor(html)
        assert floor == 12

    def test_extracts_microdistrict(self):
        html = '<script>window.data={"advert":{"address":{"microdistrict":"mkr_Akkent"}}};</script>'
        microdistrict = KrishaParser._extract_microdistrict(html)
        assert microdistrict == "mkr Akkent"

    def test_extracts_street_and_house_number(self):
        html = '<script>window.data={"advert":{"address":{"street":"Nauryzbay_batyra","house_num":"28"}}};</script>'
        street = KrishaParser._extract_street(html)
        house_number = KrishaParser._extract_house_number(html)
        assert street == "Nauryzbay batyra"
        assert house_number == "28"

    def test_extracts_coordinates_from_map_json(self):
        html = '<script>window.data = {"advert":{"map":{"lat":43.261494803805,"lon":76.899913108869}}};</script>'
        coords = KrishaParser._extract_coordinates(html)
        assert coords == (43.261494803805, 76.899913108869)

    def test_extracts_coordinates_from_map_json_reversed_order(self):
        html = (
            '<script>window.data = {"advert":{"map":{"lon":76.899913108869,'
            '"zoom":14,"lat":43.261494803805}}};</script>'
        )
        coords = KrishaParser._extract_coordinates(html)
        assert coords == (43.261494803805, 76.899913108869)

    def test_extracts_coordinates_from_lat_lng_fallback(self):
        html = '<script>window.digitalData={"product":{"latLng":"43.2611,76.8945"}};</script>'
        coords = KrishaParser._extract_coordinates(html)
        assert coords == (43.2611, 76.8945)

    def test_extracts_images_from_window_data_photos_only(self):
        html = (
            '<script>window.data = {"advert":{"photos":['
            '{"src":"https://krisha-photos.kcdn.online/webp/a/1-full.jpg"},'
            '{"src":"https://krisha-photos.kcdn.online/webp/a/2-full.jpg"}'
            ']}};</script>'
            '<img src="https://example.com/banner.jpg" />'
        )
        parser = KrishaParser()
        images = parser._extract_images(html)
        assert images == [
            "https://krisha-photos.kcdn.online/webp/a/1-full.jpg",
            "https://krisha-photos.kcdn.online/webp/a/2-full.jpg",
        ]

    @pytest.mark.asyncio
    async def test_includes_coordinates_block_in_content(self):
        html = (
            "<html><body>"
            "<h1>1-комнатная квартира</h1>"
            '<script>window.data = {"advert":{"map":{"lat":43.261494803805,"lon":76.899913108869},'
            '"address":{"street":"Nauryzbay_batyra","house_num":"28"},'
            '"description":"жил. комплекс City Plus, 10 этажей",'
            '"photos":[{"src":"https://krisha-photos.kcdn.online/webp/a/1-full.jpg"}]'
            "}};</script>"
            '<div class="offer__info-item" data-name="flat.floor">'
            '<div class="offer__advert-short-info">1 из 5</div>'
            "</div>"
            '<img src="https://krisha.kz/static/images/article-banner.jpg" />'
            "</body></html>"
        )
        mock_response = _mock_httpx_response(html)
        patcher, _ = _patch_httpx_client(mock_response)

        with patcher:
            parser = KrishaParser()
            result = await parser.fetch_content("https://krisha.kz/a/show/12345")

        assert "[MAP_COORDINATES]" in result
        assert "latitude: 43.261494803805" in result
        assert "longitude: 76.899913108869" in result
        assert "[KRISHA_META]" in result
        assert "complex_name: City Plus" in result
        assert "street: Nauryzbay batyra" in result
        assert "house_number: 28" in result
        assert "floor: 1" in result
        assert "https://krisha-photos.kcdn.online/webp/a/1-full.jpg" in result
        assert "article-banner" not in result

    @pytest.mark.asyncio
    async def test_returns_cleaned_content(self):
        html = (
            "<html><body>"
            "<h1>3-комнатная квартира</h1>"
            "<p>Алматы, Бостандыкский район</p>"
            '<img src="https://photos-b.krisha.kz/photo.jpg" />'
            "</body></html>"
        )
        mock_response = _mock_httpx_response(html)
        patcher, mock_client = _patch_httpx_client(mock_response)

        with patcher:
            parser = KrishaParser()
            result = await parser.fetch_content("https://krisha.kz/a/show/12345")

        assert "квартира" in result

    def test_source_type_is_krisha(self):
        parser = KrishaParser()
        assert parser.get_source_type() == SourceType.KRISHA


class TestGenericParserHTTP:
    @pytest.mark.asyncio
    async def test_returns_cleaned_content(self):
        html = (
            "<html><body>"
            "<h1>Some Property</h1>"
            "<p>Somewhere in the world</p>"
            "</body></html>"
        )
        mock_response = _mock_httpx_response(html)
        patcher, mock_client = _patch_httpx_client(mock_response)

        with patcher:
            parser = GenericParser()
            result = await parser.fetch_content("https://example.com/listing/123")

        assert "Some Property" in result
        assert "Somewhere in the world" in result

    def test_source_type_is_other(self):
        parser = GenericParser()
        assert parser.get_source_type() == SourceType.OTHER
