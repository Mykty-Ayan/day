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

    def _collect_section_payloads(self, deferred_state: dict | list) -> dict[str, object]:
        sections: dict[str, object] = {}
        for node in self._iter_nodes(deferred_state):
            if not isinstance(node, dict):
                continue

            section_id = node.get("sectionId")
            if isinstance(section_id, str) and section_id in _AIRBNB_SECTION_IDS and section_id not in sections:
                payload = node.get("section")
                sections[section_id] = payload if isinstance(payload, (dict, list)) else node

            for key in _AIRBNB_SECTION_IDS:
                payload = node.get(key)
                if key not in sections and isinstance(payload, (dict, list)):
                    sections[key] = payload
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

    def _build_airbnb_enrichment(self, url: str, deferred_state: dict | list | None) -> dict:
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
            subtitle = self._first_text(location, ("subtitle",))
            title = self._first_text(location, ("title",))
            if subtitle or title:
                enrichment["address_full"] = ", ".join([part for part in [subtitle, title] if part])

        description = sections.get("DESCRIPTION_DEFAULT")
        if description is not None:
            description_text = self._first_text(description, ("htmlText", "description", "text"))
            if description_text:
                enrichment["description"] = description_text

        policies = sections.get("POLICIES_DEFAULT")
        if policies is not None:
            policy_titles = self._collect_titles(policies, limit=10)
            if policy_titles:
                enrichment["airbnb_policies_title"] = policy_titles[0]
            rules = self._extract_house_rules(policies)
            if rules:
                enrichment["house_rules"] = rules

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
        enrichment = self._build_airbnb_enrichment(url, deferred_state)
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

        if enrichment:
            # Keep parser-level enrichment deterministic and machine-readable.
            text += "\n\n[AIRBNB_ENRICHMENT]\n" + json.dumps(enrichment, ensure_ascii=False)

        return text
