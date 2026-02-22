"""Unit tests for domain entities and value objects."""

from __future__ import annotations

from app.domain.entities import ExtractedProperty, ParseResult
from app.domain.value_objects import SourceType


class TestSourceType:
    def test_normalize_krisha_show_url(self):
        url = "https://krisha.kz/show/690725054"
        assert SourceType.normalize_url(url) == "https://krisha.kz/a/show/690725054"

    def test_normalize_krisha_show_url_without_scheme(self):
        url = "krisha.kz/show/690725054"
        assert SourceType.normalize_url(url) == "https://krisha.kz/a/show/690725054"

    def test_normalize_krisha_show_url_preserves_query(self):
        url = "https://www.krisha.kz/show/690725054?srchid=abc"
        assert SourceType.normalize_url(url) == "https://krisha.kz/a/show/690725054?srchid=abc"

    def test_normalize_airbnb_hosting_editor_url(self):
        url = "https://www.airbnb.ru/hosting/listings/editor/1502076254219978997/details/photo-tour"
        assert SourceType.normalize_url(url) == "https://www.airbnb.ru/rooms/1502076254219978997"

    def test_normalize_airbnb_hosting_editor_url_without_scheme(self):
        url = "airbnb.ru/hosting/listings/editor/1502076254219978997/details/photo-tour"
        assert SourceType.normalize_url(url) == "https://airbnb.ru/rooms/1502076254219978997"

    def test_normalize_airbnb_room_url_strips_extra_path(self):
        url = "https://www.airbnb.com/rooms/12345/details"
        assert SourceType.normalize_url(url) == "https://www.airbnb.com/rooms/12345"

    def test_detect_booking_url(self):
        url = "https://www.booking.com/hotel/kz/cozy-apartment.html"
        assert SourceType.detect_from_url(url) == SourceType.BOOKING

    def test_detect_booking_url_case_insensitive(self):
        url = "https://WWW.BOOKING.COM/hotel/test"
        assert SourceType.detect_from_url(url) == SourceType.BOOKING

    def test_detect_airbnb_url(self):
        url = "https://www.airbnb.com/rooms/12345"
        assert SourceType.detect_from_url(url) == SourceType.AIRBNB

    def test_detect_airbnb_subdomain(self):
        url = "https://airbnb.co.uk/rooms/12345"
        assert SourceType.detect_from_url(url) == SourceType.AIRBNB

    def test_detect_krisha_url(self):
        url = "https://krisha.kz/a/show/12345"
        assert SourceType.detect_from_url(url) == SourceType.KRISHA

    def test_detect_krisha_legacy_show_url(self):
        url = "https://krisha.kz/show/12345"
        assert SourceType.detect_from_url(url) == SourceType.KRISHA

    def test_detect_unknown_url(self):
        url = "https://example.com/property/123"
        assert SourceType.detect_from_url(url) == SourceType.OTHER

    def test_detect_empty_url(self):
        assert SourceType.detect_from_url("") == SourceType.OTHER

    def test_source_type_values(self):
        assert SourceType.BOOKING.value == "booking"
        assert SourceType.AIRBNB.value == "airbnb"
        assert SourceType.KRISHA.value == "krisha"
        assert SourceType.TEXT.value == "text"
        assert SourceType.OTHER.value == "other"


class TestExtractedProperty:
    def test_default_values(self):
        prop = ExtractedProperty()
        assert prop.name is None
        assert prop.internal_name is None
        assert prop.type is None
        assert prop.amenities == []
        assert prop.photos == []
        assert prop.base_price is None

    def test_with_values(self, sample_extracted_property):
        assert sample_extracted_property.name == "Cozy Studio Apartment"
        assert sample_extracted_property.rooms == 2
        assert len(sample_extracted_property.amenities) == 3
        assert len(sample_extracted_property.photos) == 2

    def test_amenities_are_independent(self):
        """Ensure default_factory creates separate list instances."""
        prop1 = ExtractedProperty()
        prop2 = ExtractedProperty()
        prop1.amenities.append("WiFi")
        assert prop2.amenities == []

    def test_photos_are_independent(self):
        """Ensure default_factory creates separate list instances."""
        prop1 = ExtractedProperty()
        prop2 = ExtractedProperty()
        prop1.photos.append("https://example.com/photo.jpg")
        assert prop2.photos == []


class TestParseResult:
    def test_default_values(self):
        result = ParseResult()
        assert result.source_url == ""
        assert result.source_type == SourceType.OTHER
        assert result.raw_data == {}
        assert result.confidence == 0.0
        assert result.warnings == []
        assert isinstance(result.property_data, ExtractedProperty)

    def test_with_values(self):
        result = ParseResult(
            source_url="https://booking.com/test",
            source_type=SourceType.BOOKING,
            raw_data={"name": "Test"},
            confidence=0.85,
            warnings=["Minor issue"],
        )
        assert result.source_url == "https://booking.com/test"
        assert result.source_type == SourceType.BOOKING
        assert result.confidence == 0.85
        assert len(result.warnings) == 1

    def test_warnings_are_independent(self):
        r1 = ParseResult()
        r2 = ParseResult()
        r1.warnings.append("warning")
        assert r2.warnings == []
