from __future__ import annotations

from app.infrastructure.enrichers.airbnb_mcp_enricher import AirbnbMCPEnricher


class TestAirbnbMCPEnricher:
    def test_extract_listing_id(self):
        assert AirbnbMCPEnricher._extract_listing_id("https://www.airbnb.com/rooms/50530162") == "50530162"
        assert AirbnbMCPEnricher._extract_listing_id("https://www.airbnb.com/rooms/50530162/details") == "50530162"
        assert AirbnbMCPEnricher._extract_listing_id("https://www.airbnb.com/s/Almaty/homes") is None

    def test_build_listing_details_args_from_url(self):
        args = AirbnbMCPEnricher._build_listing_details_args(
            "https://www.airbnb.com/rooms/50530162?checkin=2026-03-10&checkout=2026-03-12&adults=2",
            "50530162",
        )
        assert args["id"] == "50530162"
        assert args["checkin"] == "2026-03-10"
        assert args["checkout"] == "2026-03-12"
        assert args["adults"] == 2

    def test_map_listing_details_payload(self):
        payload = {
            "listingUrl": "https://www.airbnb.com/rooms/50530162?check_in=2026-03-10&check_out=2026-03-12",
            "details": [
                {
                    "id": "LOCATION_DEFAULT",
                    "lat": 43.26172,
                    "lng": 76.93551,
                    "subtitle": "Almaty, Kazakhstan",
                    "title": "Where you’ll be",
                },
                {
                    "id": "POLICIES_DEFAULT",
                    "title": "Things to know",
                    "houseRulesSections": "Check-in after 3:00 PM, Checkout before 12:00 PM, No smoking",
                },
                {
                    "id": "HIGHLIGHTS_DEFAULT",
                    "highlights": "Self check-in, Extra spacious",
                },
                {
                    "id": "DESCRIPTION_DEFAULT",
                    "htmlDescription": {"htmlText": "Cozy apartment in city center"},
                },
                {
                    "id": "AMENITIES_DEFAULT",
                    "seeAllAmenitiesGroups": "Bathroom: Hair dryer, Shampoo, Internet and office: Wifi, Dedicated workspace",
                },
            ],
        }
        enrichment = AirbnbMCPEnricher._map_listing_details_payload("50530162", payload)

        assert enrichment["airbnb_listing_id"] == "50530162"
        assert enrichment["source_room_url"].startswith("https://www.airbnb.com/rooms/50530162")
        assert enrichment["latitude"] == 43.26172
        assert enrichment["longitude"] == 76.93551
        assert enrichment["address_full"] == "Almaty, Kazakhstan"
        assert enrichment["airbnb_policies_title"] == "Things to know"
        assert enrichment["description"] == "Cozy apartment in city center"
        assert enrichment["check_in_instructions"] == "Check-in after 3:00 PM"
        assert enrichment["check_out_instructions"] == "Checkout before 12:00 PM"
        assert "Self check-in" in enrichment["airbnb_highlights"]
        assert "Wifi" in enrichment["amenities"]
        assert enrichment["airbnb_amenity_groups"][0]["title"] == "Bathroom"

    def test_extract_json_from_tool_result_raises_when_is_error(self):
        result = {
            "isError": True,
            "content": [{"type": "text", "text": '{"error":"blocked by robots"}'}],
        }
        try:
            AirbnbMCPEnricher._extract_json_from_tool_result(result)
            assert False, "Expected RuntimeError"
        except RuntimeError as exc:
            assert "blocked by robots" in str(exc)
