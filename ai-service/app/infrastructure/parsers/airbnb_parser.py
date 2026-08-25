from __future__ import annotations

import json
import logging
import re
from urllib.parse import parse_qs, urlsplit, urlunsplit

from bs4 import BeautifulSoup

from app.domain.value_objects import SourceType
from app.infrastructure.parsers.base import BaseParser

logger = logging.getLogger(__name__)

_AIRBNB_SECTION_IDS = {
    "LOCATION_DEFAULT",
    "POLICIES_DEFAULT",
    "HIGHLIGHTS_DEFAULT",
    "DESCRIPTION_DEFAULT",
    "AMENITIES_DEFAULT",
}

# Nodes carrying a ``sectionId`` hold only layout, and their ``section`` field is
# an empty shell such as ``{"__typename": "LocationSection"}``. The body lives in
# a separate normalized entity, reachable only by its own ``__typename``.
_AIRBNB_SECTION_TYPENAMES: dict[str, tuple[str, ...]] = {
    "LOCATION_DEFAULT": ("StaysPdpLocation", "LocationSection"),
    "POLICIES_DEFAULT": ("StaysPdpRuleDetails", "PoliciesSection"),
    "HIGHLIGHTS_DEFAULT": ("StaysPdpHighlights", "HighlightsSection"),
    "DESCRIPTION_DEFAULT": ("StaysPdpDescription", "DescriptionSection"),
    "AMENITIES_DEFAULT": ("StaysPdpAmenitiesDetails", "AmenitiesSection"),
}
_MAX_LIST_ITEMS = 30
_MAX_TEXT_LENGTH = 400


def _unique_limited(values: list[str], limit: int = _MAX_LIST_ITEMS) -> list[str]:
    seen: set[str] = set()
    output: list[str] = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        output.append(value)
        if len(output) >= limit:
            break
    return output


class AirbnbParser(BaseParser):
    """Parser for Airbnb property listings."""

    def get_source_type(self) -> SourceType:
        return SourceType.AIRBNB

    @staticmethod
    def _normalize_text(value: str) -> str:
        cleaned = re.sub(r"\s+", " ", value).strip()
        if len(cleaned) > _MAX_TEXT_LENGTH:
            return cleaned[:_MAX_TEXT_LENGTH]
        return cleaned

    @classmethod
    def _iter_nodes(cls, data: object):
        if isinstance(data, dict):
            yield data
            for value in data.values():
                yield from cls._iter_nodes(value)
            return
        if isinstance(data, list):
            for item in data:
                yield from cls._iter_nodes(item)

    @classmethod
    def _first_text(cls, data: object, keys: tuple[str, ...]) -> str | None:
        for node in cls._iter_nodes(data):
            if not isinstance(node, dict):
                continue
            for key in keys:
                value = node.get(key)
                if isinstance(value, str):
                    cleaned = cls._normalize_text(value)
                    if cleaned:
                        return cleaned
        return None

    @classmethod
    def _first_float(cls, data: object, keys: tuple[str, ...]) -> float | None:
        for node in cls._iter_nodes(data):
            if not isinstance(node, dict):
                continue
            for key in keys:
                value = node.get(key)
                if isinstance(value, (int, float)):
                    return float(value)
                if isinstance(value, str):
                    try:
                        return float(value.replace(",", "."))
                    except ValueError:
                        continue
        return None

    @classmethod
    def _first_bool(cls, data: object, keys: tuple[str, ...]) -> bool | None:
        for node in cls._iter_nodes(data):
            if not isinstance(node, dict):
                continue
            for key in keys:
                value = node.get(key)
                if isinstance(value, bool):
                    return value
        return None

    @classmethod
    def _first_int(cls, data: object, keys: tuple[str, ...]) -> int | None:
        for node in cls._iter_nodes(data):
            if not isinstance(node, dict):
                continue
            for key in keys:
                value = node.get(key)
                if isinstance(value, int):
                    return value
                if isinstance(value, float) and value.is_integer():
                    return int(value)
                if isinstance(value, str):
                    match = re.search(r"\d+", value)
                    if not match:
                        continue
                    try:
                        return int(match.group(0))
                    except ValueError:
                        continue
        return None

    @classmethod
    def _collect_titles(cls, data: object, *, limit: int = _MAX_LIST_ITEMS) -> list[str]:
        titles: list[str] = []
        for node in cls._iter_nodes(data):
            if not isinstance(node, dict):
                continue
            title = node.get("title")
            if isinstance(title, str):
                cleaned = cls._normalize_text(title)
                if cleaned:
                    titles.append(cleaned)
        return _unique_limited(titles, limit=limit)

    @staticmethod
    def _extract_listing_id(url: str) -> str | None:
        match = re.match(r"^/rooms/(\d+)(?:/.*)?$", urlsplit(url).path)
        if not match:
            return None
        return match.group(1)

    def _extract_ld_json(self, html: str) -> dict:
        """Extract primary JSON-LD object from Airbnb page."""
        soup = BeautifulSoup(html, "lxml")
        for script in soup.find_all("script", attrs={"type": "application/ld+json"}):
            raw = script.string or script.get_text()
            if not raw:
                continue
            try:
                parsed = json.loads(raw)
            except Exception:
                continue

            candidates = parsed if isinstance(parsed, list) else [parsed]
            for candidate in candidates:
                if not isinstance(candidate, dict):
                    continue
                obj_type = str(candidate.get("@type", "")).lower()
                if obj_type in {"vacationrental", "lodgingbusiness", "hotel", "accommodation"}:
                    return candidate
        return {}

    def _extract_deferred_state(self, html: str) -> dict | list | None:
        soup = BeautifulSoup(html, "lxml")
        script = soup.find("script", attrs={"id": "data-deferred-state-0"})
        if script is None:
            return None

        raw = script.string or script.get_text()
        if not raw:
            return None
        try:
            parsed = json.loads(raw)
        except Exception:
            return None
        if isinstance(parsed, (dict, list)):
            return parsed
        return None

    @classmethod
    def _payload_weight(cls, payload: object, limit: int = 5000) -> int:
        """Count the scalar values a payload carries.

        Airbnb repeats every section: an empty shell like
        ``{"__typename": "LocationSection"}``, a layout node of paddings and
        borders, and the entity that actually holds the content. Keeping the
        first match froze the shell in place, so candidates are ranked by how
        much they carry instead.
        """
        count = 0
        for node in cls._iter_nodes(payload):
            for key, value in node.items():
                if key == "__typename":
                    continue
                if isinstance(value, (str, int, float, bool)):
                    count += 1
            if count >= limit:
                break
        return count

    def _collect_section_payloads(self, deferred_state: dict | list) -> dict[str, object]:
        sections: dict[str, object] = {}
        # Reverse index so a single walk can place a node by its type.
        by_typename: dict[str, str] = {
            typename: section_id
            for section_id, typenames in _AIRBNB_SECTION_TYPENAMES.items()
            for typename in typenames
        }

        # A content entity always outranks anything reached through sectionId,
        # whose nodes hold layout only. Rank breaks ties inside a tier.
        ranked: dict[str, tuple[int, int]] = {}

        def offer(section_id: str, payload: object, tier: int) -> None:
            if not isinstance(payload, (dict, list)):
                return
            rank = (tier, self._payload_weight(payload))
            if section_id not in ranked or rank > ranked[section_id]:
                ranked[section_id] = rank
                sections[section_id] = payload

        for node in self._iter_nodes(deferred_state):
            if not isinstance(node, dict):
                continue

            typename = node.get("__typename")
            if isinstance(typename, str) and typename in by_typename:
                offer(by_typename[typename], node, tier=2)

            section_id = node.get("sectionId")
            if isinstance(section_id, str) and section_id in _AIRBNB_SECTION_IDS:
                payload = node.get("section")
                offer(section_id, payload if isinstance(payload, (dict, list)) else node, tier=1)

            for key in _AIRBNB_SECTION_IDS:
                offer(key, node.get(key), tier=1)
        return sections

    def _extract_amenity_groups(self, data: object) -> list[dict]:
        groups: list[dict] = []
        seen: set[tuple[str | None, tuple[str, ...]]] = set()
        for node in self._iter_nodes(data):
            if not isinstance(node, dict):
                continue
            amenities = node.get("amenities")
            if not isinstance(amenities, list):
                continue

            amenity_titles: list[str] = []
            for amenity in amenities:
                if not isinstance(amenity, dict):
                    continue
                title = amenity.get("title")
                if isinstance(title, str):
                    cleaned = self._normalize_text(title)
                    if cleaned:
                        amenity_titles.append(cleaned)

            amenity_titles = _unique_limited(amenity_titles, limit=20)
            if not amenity_titles:
                continue

            group_title = node.get("title")
            normalized_group_title = (
                self._normalize_text(group_title) if isinstance(group_title, str) and group_title.strip() else None
            )
            signature = (normalized_group_title, tuple(amenity_titles))
            if signature in seen:
                continue
            seen.add(signature)

            group: dict[str, object] = {"amenities": amenity_titles}
            if normalized_group_title:
                group["title"] = normalized_group_title
            groups.append(group)
            if len(groups) >= 10:
                break

        return groups

    def _extract_house_rules(self, data: object) -> list[str]:
        rules: list[str] = []
        for node in self._iter_nodes(data):
            if not isinstance(node, dict):
                continue
            house_rules_sections = node.get("houseRulesSections")
            if isinstance(house_rules_sections, str):
                for chunk in re.split(r"[,;]\s*", house_rules_sections):
                    cleaned = self._normalize_text(chunk)
                    if cleaned:
                        rules.append(cleaned)
            items = node.get("items")
            if not isinstance(items, list):
                continue
            for item in items:
                if not isinstance(item, dict):
                    continue
                title = item.get("title")
                if isinstance(title, str):
                    cleaned = self._normalize_text(title)
                    if cleaned:
                        rules.append(cleaned)
        return _unique_limited(rules, limit=_MAX_LIST_ITEMS)

    def _extract_room_and_bed_counts(self, data: object) -> tuple[int | None, int | None]:
        rooms = self._first_int(data, ("bedroomCount", "numberOfBedrooms", "bedrooms", "roomCount", "rooms"))
        beds = self._first_int(data, ("bedCount", "numberOfBeds", "beds"))

        candidates: list[str] = []
        for node in self._iter_nodes(data):
            if not isinstance(node, dict):
                continue
            for key in ("primaryLine", "secondaryLine", "subtitle", "summary", "line", "title", "accessibilityLabel"):
                value = node.get(key)
                if isinstance(value, str):
                    cleaned = self._normalize_text(value)
                    if cleaned:
                        candidates.append(cleaned)
                elif isinstance(value, dict):
                    for nested_key in ("body", "text", "accessibilityLabel"):
                        nested_val = value.get(nested_key)
                        if isinstance(nested_val, str):
                            cleaned = self._normalize_text(nested_val)
                            if cleaned:
                                candidates.append(cleaned)

        room_patterns = (
            r"(\d+)\s*(?:bedrooms?\b|спальн(?:я|и)?\b|комнат[аы]?\b)",
            r"(?:bedrooms?\b|спальн(?:я|и)?\b|комнат[аы]?\b)\s*[:\-]?\s*(\d+)",
        )
        bed_patterns = (
            r"(\d+)\s*(?:beds?\b|кроват[ьяеи]\b)",
            r"(?:beds?\b|кроват[ьяеи]\b)\s*[:\-]?\s*(\d+)",
        )

        for candidate in candidates:
            lowered = candidate.lower()
            if rooms is None:
                for pattern in room_patterns:
                    match = re.search(pattern, lowered)
                    if match:
                        try:
                            rooms = int(match.group(1))
                        except ValueError:
                            rooms = None
                        break
            if beds is None:
                for pattern in bed_patterns:
                    match = re.search(pattern, lowered)
                    if match:
                        try:
                            beds = int(match.group(1))
                        except ValueError:
                            beds = None
                        break
            if rooms is not None and beds is not None:
                break

        return rooms, beds

    def _extract_checkin_checkout_instructions(self, data: object) -> tuple[str | None, str | None]:
        checkin_tokens = ("check-in", "check in", "checkin", "заезд", "прибытие")
        checkout_tokens = ("check-out", "check out", "checkout", "выезд", "отъезд")
        checkin: str | None = None
        checkout: str | None = None

        lines: list[str] = []
        for node in self._iter_nodes(data):
            if not isinstance(node, dict):
                continue
            for key in ("houseRulesSections", "title", "subtitle", "text", "description", "htmlText"):
                value = node.get(key)
                if isinstance(value, str):
                    cleaned = self._normalize_text(value)
                    if cleaned:
                        lines.append(cleaned)

        for line in lines:
            segments = [self._normalize_text(s) for s in re.split(r"[,;]\s*", line)]
            for segment in segments:
                lowered = segment.lower()
                is_checkin = any(token in lowered for token in checkin_tokens)
                is_checkout = any(token in lowered for token in checkout_tokens)
                if is_checkin and is_checkout:
                    # "Прибытие и выезд" is the section heading, not an
                    # instruction for either side.
                    continue
                if checkin is None and is_checkin:
                    checkin = segment
                if checkout is None and is_checkout:
                    checkout = segment
                if checkin and checkout:
                    return checkin, checkout

        return checkin, checkout

    def _build_structured_enrichment(self, structured: dict) -> dict:
        enrichment: dict[str, object] = {}

        name = structured.get("name")
        if isinstance(name, str):
            cleaned_name = self._normalize_text(name)
            if cleaned_name:
                enrichment["name"] = cleaned_name

        description = structured.get("description")
        if isinstance(description, str):
            cleaned_description = self._normalize_text(description)
            if cleaned_description:
                enrichment["description"] = cleaned_description

        geo = structured.get("geo")
        if isinstance(geo, dict):
            lat = geo.get("latitude")
            lng = geo.get("longitude")
            if isinstance(lat, (int, float)):
                enrichment["latitude"] = float(lat)
            if isinstance(lng, (int, float)):
                enrichment["longitude"] = float(lng)

        address = structured.get("address")
        if isinstance(address, dict):
            parts: list[str] = []
            for key in ("streetAddress", "addressLocality", "addressRegion", "addressCountry"):
                value = address.get(key)
                if isinstance(value, str):
                    cleaned = self._normalize_text(value)
                    if cleaned:
                        parts.append(cleaned)
            if parts:
                enrichment["address_full"] = ", ".join(parts)
        elif isinstance(address, str):
            cleaned_address = self._normalize_text(address)
            if cleaned_address:
                enrichment["address_full"] = cleaned_address

        number_of_rooms = structured.get("numberOfRooms")
        if isinstance(number_of_rooms, (int, float)):
            enrichment["rooms"] = int(number_of_rooms)
        elif isinstance(number_of_rooms, str):
            match = re.search(r"\d+", number_of_rooms)
            if match:
                try:
                    enrichment["rooms"] = int(match.group(0))
                except ValueError:
                    pass

        image = structured.get("image")
        if isinstance(image, list):
            photos = [img for img in image if isinstance(img, str) and img.startswith("http")]
            if photos:
                enrichment["photos"] = _unique_limited(photos, limit=30)

        return enrichment

    def _extract_badges(self, data: object) -> list[str]:
        badges: list[str] = []
        for node in self._iter_nodes(data):
            if not isinstance(node, dict):
                continue
            raw_badges = node.get("badges")
            if not isinstance(raw_badges, list):
                continue
            for badge in raw_badges:
                if not isinstance(badge, dict):
                    continue
                text = badge.get("text")
                if isinstance(text, str):
                    cleaned = self._normalize_text(text)
                    if cleaned:
                        badges.append(cleaned)
        return _unique_limited(badges, limit=10)

    def _extract_price_breakdown_items(self, data: object) -> list[dict]:
        items_out: list[dict] = []
        seen: set[tuple[str, str]] = set()
        for node in self._iter_nodes(data):
            if not isinstance(node, dict):
                continue
            items = node.get("items")
            if not isinstance(items, list):
                continue
            for item in items:
                if not isinstance(item, dict):
                    continue
                description = item.get("description")
                price_string = item.get("priceString")
                if not isinstance(description, str) or not isinstance(price_string, str):
                    continue
                desc = self._normalize_text(description)
                price = self._normalize_text(price_string)
                if not desc or not price:
                    continue
                signature = (desc, price)
                if signature in seen:
                    continue
                seen.add(signature)
                items_out.append({"description": desc, "priceString": price})
                if len(items_out) >= 10:
                    return items_out
        return items_out

    def _extract_primary_price_label(self, data: object) -> str | None:
        candidates: list[str] = []
        for node in self._iter_nodes(data):
            if not isinstance(node, dict):
                continue
            for key in ("priceString", "accessibilityLabel"):
                value = node.get(key)
                if isinstance(value, str):
                    cleaned = self._normalize_text(value)
                    if cleaned and any(ch.isdigit() for ch in cleaned):
                        candidates.append(cleaned)
        if not candidates:
            return None

        strong_matches: list[str] = []
        for label in candidates:
            lower = label.lower()
            if any(token in lower for token in ("night", "ноч", "сут", "total", "usd", "kzt", "eur", "руб", "тенге")):
                strong_matches.append(label)
                continue
            if any(symbol in label for symbol in ("$", "€", "£", "₽", "₸")):
                strong_matches.append(label)

        if strong_matches:
            return strong_matches[0]
        return None

    @staticmethod
    def _parse_price_amount(label: str | None) -> float | None:
        if not label:
            return None
        match = re.search(r"\d[\d\s.,\u00A0]*", label)
        if not match:
            return None

        token = match.group(0).replace("\u00A0", " ").replace(" ", "")
        if "," in token and "." in token:
            if token.rfind(",") > token.rfind("."):
                token = token.replace(".", "").replace(",", ".")
            else:
                token = token.replace(",", "")
        elif "," in token:
            parts = token.split(",")
            if len(parts[-1]) <= 2:
                token = token.replace(",", ".")
            else:
                token = token.replace(",", "")
        try:
            return float(token)
        except ValueError:
            return None

    def _build_airbnb_enrichment(
        self,
        url: str,
        deferred_state: dict | list | None,
        structured: dict | None = None,
    ) -> dict:
        enrichment: dict[str, object] = {}
        parsed_url = urlsplit(url)
        listing_id = self._extract_listing_id(url)
        if listing_id:
            enrichment["airbnb_listing_id"] = listing_id
            if parsed_url.netloc:
                enrichment["source_room_url"] = urlunsplit(
                    ("https", parsed_url.netloc.lower(), f"/rooms/{listing_id}", "", "")
                )

        query = parse_qs(parsed_url.query)
        checkin = query.get("checkin", [None])[0]
        checkout = query.get("checkout", [None])[0]
        if isinstance(checkin, str) or isinstance(checkout, str):
            stay_window: dict[str, str] = {}
            if isinstance(checkin, str) and checkin.strip():
                stay_window["checkin"] = checkin.strip()
            if isinstance(checkout, str) and checkout.strip():
                stay_window["checkout"] = checkout.strip()
            if stay_window:
                enrichment["airbnb_stay_window"] = stay_window

        if structured:
            for key, value in self._build_structured_enrichment(structured).items():
                enrichment[key] = value

        if deferred_state is None:
            return enrichment

        sections = self._collect_section_payloads(deferred_state)

        location = sections.get("LOCATION_DEFAULT")
        if location is not None:
            lat = self._first_float(location, ("lat", "latitude"))
            lng = self._first_float(location, ("lng", "lon", "longitude"))
            if lat is not None:
                enrichment["latitude"] = lat
            if lng is not None:
                enrichment["longitude"] = lng
            # Only the section's own fields: a deep search reaches the map's
            # category pins ("Рестораны", "Магазины") and glues them onto the
            # address.
            address_parts = [
                self._normalize_text(value)
                for key in ("subtitle", "title", "exactAddress")
                if isinstance(value := location.get(key) if isinstance(location, dict) else None, str)
                and value.strip()
            ]
            if address_parts:
                enrichment["address_full"] = ", ".join(_unique_limited(address_parts, limit=3))

        description = sections.get("DESCRIPTION_DEFAULT")
        if description is not None:
            description_text = self._first_text(description, ("htmlText", "description", "text"))
            if description_text:
                enrichment["description"] = description_text

        rooms, beds = self._extract_room_and_bed_counts(deferred_state)
        if rooms is not None:
            enrichment["rooms"] = rooms
        if beds is not None:
            enrichment["beds"] = beds

        policies = sections.get("POLICIES_DEFAULT")
        if policies is not None:
            policy_titles = self._collect_titles(policies, limit=10)
            if policy_titles:
                enrichment["airbnb_policies_title"] = policy_titles[0]
            rules = self._extract_house_rules(policies)
            if rules:
                enrichment["house_rules"] = rules
            check_in, check_out = self._extract_checkin_checkout_instructions(policies)
            if check_in:
                enrichment["check_in_instructions"] = check_in
            if check_out:
                enrichment["check_out_instructions"] = check_out

        highlights = sections.get("HIGHLIGHTS_DEFAULT")
        if highlights is not None:
            highlights_titles = self._collect_titles(highlights, limit=10)
            if highlights_titles:
                enrichment["airbnb_highlights"] = highlights_titles

        amenities_section = sections.get("AMENITIES_DEFAULT")
        if amenities_section is not None:
            amenity_groups = self._extract_amenity_groups(amenities_section)
            if amenity_groups:
                enrichment["airbnb_amenity_groups"] = amenity_groups
                flattened_amenities: list[str] = []
                for group in amenity_groups:
                    group_amenities = group.get("amenities")
                    if isinstance(group_amenities, list):
                        flattened_amenities.extend(
                            [a for a in group_amenities if isinstance(a, str) and a.strip()]
                        )
                enrichment["amenities"] = _unique_limited(flattened_amenities, limit=_MAX_LIST_ITEMS)

        rating_label = self._first_text(deferred_state, ("avgRatingA11yLabel",))
        if rating_label:
            enrichment["airbnb_rating_label"] = rating_label

        badges = self._extract_badges(deferred_state)
        if badges:
            enrichment["airbnb_badges"] = badges

        price_breakdown_items = self._extract_price_breakdown_items(deferred_state)
        if price_breakdown_items:
            enrichment["airbnb_price_breakdown_items"] = price_breakdown_items

        price_label = self._extract_primary_price_label(deferred_state)
        if price_label:
            enrichment["airbnb_primary_price_label"] = price_label
            base_price = self._parse_price_amount(price_label)
            if base_price is not None:
                enrichment["base_price"] = base_price

        pagination_cursor = self._first_text(deferred_state, ("cursor",))
        if pagination_cursor and len(pagination_cursor) <= 200:
            enrichment["airbnb_pagination_cursor"] = pagination_cursor

        place_id = self._first_text(deferred_state, ("placeId", "canonicalPlaceId", "locationId"))
        if place_id and len(place_id) <= 120:
            enrichment["airbnb_place_id"] = place_id

        if "airbnb_stay_window" in enrichment:
            available = self._first_bool(
                deferred_state,
                ("isAvailableForStay", "isAvailable", "isAvailableForCheckin", "isAvailableForCheckout"),
            )
            if available is not None:
                enrichment["airbnb_stay_window_available"] = available

        return enrichment

    async def fetch_content(self, url: str) -> str:
        logger.info("Fetching Airbnb listing: %s", url)
        try:
            html = await self._fetch_html(url)
        except Exception:
            logger.exception("Failed to fetch Airbnb listing: %s", url)
            raise

        images = self._extract_images(html)
        structured = self._extract_ld_json(html)
        deferred_state = self._extract_deferred_state(html)
        enrichment = self._build_airbnb_enrichment(url, deferred_state, structured)
        text = self._clean_html(html)

        # Airbnb keeps most useful fields in JSON-LD script tags.
        if structured:
            text += "\n\n[STRUCTURED_DATA]\n" + json.dumps(structured, ensure_ascii=False)

            ld_images = structured.get("image")
            if isinstance(ld_images, list):
                for img in ld_images:
                    if isinstance(img, str) and img.startswith("http"):
                        images.append(img)

        # Keep image list short and unique.
        if images:
            dedup_images = list(dict.fromkeys(images))
            text += "\n\n[IMAGES]\n" + "\n".join(dedup_images[:30])
            if "photos" not in enrichment:
                enrichment["photos"] = dedup_images[:30]

        if enrichment:
            # Keep parser-level enrichment deterministic and machine-readable.
            text += "\n\n[AIRBNB_ENRICHMENT]\n" + json.dumps(enrichment, ensure_ascii=False)

        return text
