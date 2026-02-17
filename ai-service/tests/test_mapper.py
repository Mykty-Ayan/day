"""Unit tests for property mapper."""

from __future__ import annotations

from app.domain.entities import ExtractedProperty
from app.domain.value_objects import SourceType
from app.infrastructure.mappers.property_mapper import (
    DefaultPropertyMapper,
    _normalize_property_type,
    _safe_float,
    _safe_int,
    _slugify,
    _strip_html,
)


class TestSlugify:
    def test_basic_slug(self):
        assert _slugify("Cozy Studio Apartment") == "cozy-studio-apartment"

    def test_special_characters(self):
        assert _slugify("Villa & Resort #1") == "villa-resort-1"

    def test_unicode_characters(self):
        result = _slugify("Квартира в центре")
        # Cyrillic should be stripped, leaving empty -> unnamed-property
        assert result == "unnamed-property"

    def test_empty_string(self):
        assert _slugify("") == "unnamed-property"

    def test_only_special_chars(self):
        assert _slugify("@#$%^&*") == "unnamed-property"

    def test_multiple_spaces(self):
        assert _slugify("Hello   World") == "hello-world"

    def test_leading_trailing_hyphens(self):
        assert _slugify("--hello--") == "hello"


class TestStripHtml:
    def test_strip_tags(self):
        assert _strip_html("<b>Bold</b> text") == "Bold text"

    def test_none_input(self):
        assert _strip_html(None) is None

    def test_empty_string(self):
        assert _strip_html("") is None

    def test_only_tags(self):
        assert _strip_html("<br/><hr/>") is None

    def test_nested_tags(self):
        assert _strip_html("<div><p>Hello</p></div>") == "Hello"

    def test_collapses_whitespace(self):
        assert _strip_html("  Hello   World  ") == "Hello World"


class TestSafeInt:
    def test_valid_int(self):
        assert _safe_int(5) == 5

    def test_string_int(self):
        assert _safe_int("3") == 3

    def test_float_to_int(self):
        assert _safe_int(3.7) == 3

    def test_none(self):
        assert _safe_int(None) is None

    def test_invalid_string(self):
        assert _safe_int("abc") is None

    def test_empty_string(self):
        assert _safe_int("") is None


class TestSafeFloat:
    def test_valid_float(self):
        assert _safe_float(3.14) == 3.14

    def test_string_float(self):
        assert _safe_float("2.5") == 2.5

    def test_int_to_float(self):
        assert _safe_float(5) == 5.0

    def test_none(self):
        assert _safe_float(None) is None

    def test_invalid_string(self):
        assert _safe_float("not-a-number") is None

    def test_nan_rejected(self):
        assert _safe_float(float("nan")) is None

    def test_inf_rejected(self):
        assert _safe_float(float("inf")) is None

    def test_negative_inf_rejected(self):
        assert _safe_float(float("-inf")) is None


class TestNormalizePropertyType:
    def test_apartment(self):
        assert _normalize_property_type("apartment") == "apartment"

    def test_house(self):
        assert _normalize_property_type("house") == "house"

    def test_room(self):
        assert _normalize_property_type("room") == "room"

    def test_flat_alias(self):
        assert _normalize_property_type("flat") == "apartment"

    def test_studio_alias(self):
        assert _normalize_property_type("studio") == "apartment"

    def test_condo_alias(self):
        assert _normalize_property_type("condo") == "apartment"

    def test_villa_alias(self):
        assert _normalize_property_type("villa") == "house"

    def test_cottage_alias(self):
        assert _normalize_property_type("cottage") == "house"

    def test_cabin_alias(self):
        assert _normalize_property_type("cabin") == "house"

    def test_suite_alias(self):
        assert _normalize_property_type("suite") == "room"

    def test_private_room_alias(self):
        assert _normalize_property_type("private room") == "room"

    def test_case_insensitive(self):
        assert _normalize_property_type("APARTMENT") == "apartment"

    def test_unknown_type(self):
        assert _normalize_property_type("spaceship") is None

    def test_none(self):
        assert _normalize_property_type(None) is None

    def test_empty_string(self):
        assert _normalize_property_type("") is None


class TestDefaultPropertyMapper:
    def test_map_full_data(self, sample_raw_data):
        mapper = DefaultPropertyMapper()
        prop = mapper.map_to_property(sample_raw_data, "https://example.com/test", SourceType.BOOKING)

        assert prop.name == "Cozy Studio Apartment"
        assert prop.internal_name == "cozy-studio-apartment"
        assert prop.type == "apartment"
        assert prop.description == "A beautiful studio in the city center"
        assert prop.source_url == "https://example.com/test"
        assert prop.latitude == 43.238949
        assert prop.longitude == 76.945465
        assert prop.address_full == "123 Main Street, Almaty"
        assert prop.rooms == 2
        assert prop.beds == 1
        assert prop.area_total == 45.5
        assert prop.area_living == 30.0
        assert prop.floor == 3
        assert prop.base_price == 25000.0
        assert prop.check_in_instructions == "Ring the bell at entrance"
        assert prop.check_out_instructions == "Leave keys on the table"
        assert prop.house_rules == "No smoking. No parties."
        assert prop.amenities == ["WiFi", "Kitchen", "Washer"]
        assert len(prop.photos) == 2

    def test_map_empty_data(self):
        mapper = DefaultPropertyMapper()
        prop = mapper.map_to_property({}, "https://example.com/test", SourceType.OTHER)

        assert prop.name is None
        assert prop.internal_name is None
        assert prop.source_url == "https://example.com/test"
        assert prop.amenities == []
        assert prop.photos == []

    def test_map_none_data(self):
        mapper = DefaultPropertyMapper()
        prop = mapper.map_to_property({}, "https://example.com/test", SourceType.OTHER)

        assert prop.source_url == "https://example.com/test"
        assert prop.name is None

    def test_map_with_html_in_description(self):
        mapper = DefaultPropertyMapper()
        raw = {"name": "<b>Bold Name</b>", "description": "<p>Some <em>description</em></p>"}
        prop = mapper.map_to_property(raw, "https://example.com/test", SourceType.OTHER)

        assert prop.name == "Bold Name"
        assert prop.description == "Some description"

    def test_map_amenities_filters_empty(self):
        mapper = DefaultPropertyMapper()
        raw = {"amenities": ["WiFi", "", None, "Pool", "  "]}
        prop = mapper.map_to_property(raw, "https://example.com/test", SourceType.OTHER)

        assert prop.amenities == ["WiFi", "Pool"]

    def test_map_photos_filters_non_http(self):
        mapper = DefaultPropertyMapper()
        raw = {"photos": ["https://example.com/photo.jpg", "/relative/path.jpg", "", "ftp://other.com/photo.jpg"]}
        prop = mapper.map_to_property(raw, "https://example.com/test", SourceType.OTHER)

        assert prop.photos == ["https://example.com/photo.jpg"]

    def test_map_amenities_non_list(self):
        mapper = DefaultPropertyMapper()
        raw = {"amenities": "WiFi, Pool"}
        prop = mapper.map_to_property(raw, "https://example.com/test", SourceType.OTHER)

        assert prop.amenities == []

    def test_map_photos_non_list(self):
        mapper = DefaultPropertyMapper()
        raw = {"photos": "https://example.com/photo.jpg"}
        prop = mapper.map_to_property(raw, "https://example.com/test", SourceType.OTHER)

        assert prop.photos == []

    def test_map_invalid_numeric_fields(self):
        mapper = DefaultPropertyMapper()
        raw = {"rooms": "not-a-number", "beds": "abc", "base_price": "free"}
        prop = mapper.map_to_property(raw, "https://example.com/test", SourceType.OTHER)

        assert prop.rooms is None
        assert prop.beds is None
        assert prop.base_price is None


class TestConfidenceCalculation:
    def test_full_confidence(self, sample_extracted_property):
        mapper = DefaultPropertyMapper()
        confidence = mapper.calculate_confidence(sample_extracted_property)
        assert confidence == 1.0

    def test_zero_confidence_empty_property(self):
        mapper = DefaultPropertyMapper()
        prop = ExtractedProperty()
        confidence = mapper.calculate_confidence(prop)
        assert confidence == 0.0

    def test_partial_confidence(self):
        mapper = DefaultPropertyMapper()
        prop = ExtractedProperty(
            name="Test Property",
            type="apartment",
            base_price=100.0,
        )
        confidence = mapper.calculate_confidence(prop)
        # name=0.20 + type=0.05 + base_price=0.15 = 0.40
        assert confidence == 0.40

    def test_confidence_name_only(self):
        mapper = DefaultPropertyMapper()
        prop = ExtractedProperty(name="Test")
        confidence = mapper.calculate_confidence(prop)
        assert confidence == 0.20

    def test_confidence_ignores_empty_strings(self):
        mapper = DefaultPropertyMapper()
        prop = ExtractedProperty(name="", description="")
        confidence = mapper.calculate_confidence(prop)
        assert confidence == 0.0

    def test_confidence_ignores_empty_lists(self):
        mapper = DefaultPropertyMapper()
        prop = ExtractedProperty(amenities=[], photos=[])
        confidence = mapper.calculate_confidence(prop)
        assert confidence == 0.0

    def test_confidence_with_amenities_and_photos(self):
        mapper = DefaultPropertyMapper()
        prop = ExtractedProperty(
            amenities=["WiFi"],
            photos=["https://example.com/photo.jpg"],
        )
        confidence = mapper.calculate_confidence(prop)
        # amenities=0.10 + photos=0.10 = 0.20
        assert confidence == 0.20

    def test_confidence_clamped_to_one(self):
        """Even if somehow score exceeds 1.0, it should clamp."""
        mapper = DefaultPropertyMapper()
        prop = ExtractedProperty(
            name="Test",
            type="apartment",
            description="Desc",
            address_full="Addr",
            rooms=2,
            beds=1,
            base_price=100.0,
            amenities=["WiFi"],
            photos=["https://example.com/photo.jpg"],
        )
        confidence = mapper.calculate_confidence(prop)
        assert confidence <= 1.0
