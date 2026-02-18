from __future__ import annotations

import asyncio
import json
import logging
import re
from urllib.parse import parse_qs, urlsplit

logger = logging.getLogger(__name__)

_GENERIC_LOCATION_TITLES = {
    "where you'll be",
    "where you’ll be",
    "where youll be",
}


def _unique(values: list[str], limit: int = 30) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for value in values:
        key = value.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(value)
        if len(out) >= limit:
            break
    return out


def _normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


class AirbnbMCPEnricher:
    """Optional Airbnb enrichment via MCP `airbnb_listing_details` tool."""

    def __init__(
        self,
        command: str,
        args: list[str],
        timeout_seconds: int = 20,
        workdir: str | None = None,
        ignore_robots_text: bool = True,
    ) -> None:
        self._command = command
        self._args = args
        self._timeout_seconds = timeout_seconds
        self._workdir = workdir
        self._ignore_robots_text = ignore_robots_text

    @staticmethod
    def _extract_listing_id(url: str) -> str | None:
        match = re.match(r"^/rooms/(\d+)(?:/.*)?$", urlsplit(url).path)
        if not match:
            return None
        return match.group(1)

    @staticmethod
    def _build_listing_details_args(url: str, listing_id: str) -> dict:
        args: dict[str, object] = {"id": listing_id}
        query = parse_qs(urlsplit(url).query)
        for key in ("checkin", "checkout"):
            value = query.get(key, [None])[0]
            if isinstance(value, str) and value.strip():
                args[key] = value.strip()
        for key in ("adults", "children", "infants", "pets"):
            value = query.get(key, [None])[0]
            if not isinstance(value, str) or not value.strip():
                continue
            try:
                args[key] = int(value)
            except ValueError:
                continue
        return args

    @staticmethod
    def _format_message(payload: dict) -> bytes:
        return (json.dumps(payload) + "\n").encode("utf-8")

    @staticmethod
    async def _send_message(proc: asyncio.subprocess.Process, payload: dict) -> None:
        if proc.stdin is None:
            raise RuntimeError("MCP process stdin is not available")
        proc.stdin.write(AirbnbMCPEnricher._format_message(payload))
        await proc.stdin.drain()

    @staticmethod
    async def _read_message(proc: asyncio.subprocess.Process) -> dict:
        if proc.stdout is None:
            raise RuntimeError("MCP process stdout is not available")
        while True:
            line = await proc.stdout.readline()
            if not line:
                raise RuntimeError("MCP process closed stdout")
            candidate = line.decode("utf-8", errors="replace").strip()
            if not candidate:
                continue
            try:
                parsed = json.loads(candidate)
            except json.JSONDecodeError:
                # Some servers print logs to stdout; ignore non-JSON lines.
                continue
            if isinstance(parsed, dict):
                return parsed

    async def _request(self, proc: asyncio.subprocess.Process, req_id: int, method: str, params: dict) -> dict:
        payload = {"jsonrpc": "2.0", "id": req_id, "method": method, "params": params}
        await self._send_message(proc, payload)

        while True:
            message = await asyncio.wait_for(self._read_message(proc), timeout=self._timeout_seconds)
            if message.get("id") != req_id:
                continue
            if "error" in message:
                raise RuntimeError(f"MCP request {method} failed: {message['error']}")
            result = message.get("result")
            if not isinstance(result, dict):
                raise RuntimeError(f"MCP request {method} returned invalid result")
            return result

    async def _notify_initialized(self, proc: asyncio.subprocess.Process) -> None:
        payload = {"jsonrpc": "2.0", "method": "notifications/initialized", "params": {}}
        await self._send_message(proc, payload)

    @staticmethod
    def _extract_json_from_tool_result(result: dict) -> dict:
        is_error = bool(result.get("isError"))
        content = result.get("content")
        if not isinstance(content, list):
            return {}
        error_message: str | None = None
        for item in content:
            if not isinstance(item, dict):
                continue
            if item.get("type") != "text":
                continue
            text = item.get("text")
            if not isinstance(text, str) or not text.strip():
                continue
            try:
                parsed = json.loads(text)
            except json.JSONDecodeError:
                continue
            if isinstance(parsed, dict):
                if is_error:
                    error_text = parsed.get("error")
                    if isinstance(error_text, str) and error_text.strip():
                        error_message = error_text.strip()
                else:
                    return parsed
        if is_error:
            raise RuntimeError(error_message or "MCP tool returned an error")
        return {}

    @staticmethod
    def _split_house_rules(raw: str) -> list[str]:
        chunks = [_normalize_text(chunk) for chunk in re.split(r"[,;]\s*", raw)]
        return _unique([chunk for chunk in chunks if chunk], limit=40)

    @staticmethod
    def _extract_checkin_checkout(house_rules: list[str]) -> tuple[str | None, str | None]:
        checkin_tokens = ("check-in", "check in", "checkin", "заезд")
        checkout_tokens = ("check-out", "check out", "checkout", "выезд")
        checkin: str | None = None
        checkout: str | None = None
        for rule in house_rules:
            lowered = rule.lower()
            if checkin is None and any(token in lowered for token in checkin_tokens):
                checkin = rule
            if checkout is None and any(token in lowered for token in checkout_tokens):
                checkout = rule
            if checkin and checkout:
                break
        return checkin, checkout

    @staticmethod
    def _parse_amenity_groups(raw: str) -> tuple[list[dict], list[str]]:
        groups: list[dict] = []
        current_title: str | None = None
        current_items: list[str] = []

        def flush_current() -> None:
            nonlocal current_title, current_items
            if not current_items:
                current_title = None
                return
            group: dict[str, object] = {"amenities": _unique(current_items, limit=30)}
            if current_title:
                group["title"] = current_title
            groups.append(group)
            current_title = None
            current_items = []

        for token in [_normalize_text(part) for part in raw.split(",")]:
            if not token:
                continue
            if ":" in token:
                left, right = token.split(":", maxsplit=1)
                left = _normalize_text(left)
                right = _normalize_text(right)
                if left:
                    flush_current()
                    current_title = left
                if right:
                    current_items.append(right)
            else:
                current_items.append(token)
        flush_current()

        amenities: list[str] = []
        for group in groups:
            items = group.get("amenities")
            if isinstance(items, list):
                for item in items:
                    if isinstance(item, str) and item.strip():
                        amenities.append(item.strip())
        return groups[:10], _unique(amenities, limit=40)

    @staticmethod
    def _map_listing_details_payload(listing_id: str, payload: dict) -> dict:
        enrichment: dict[str, object] = {"airbnb_listing_id": listing_id}
        listing_url = payload.get("listingUrl")
        if isinstance(listing_url, str) and listing_url.strip():
            enrichment["source_room_url"] = listing_url.strip()

        details = payload.get("details")
        if not isinstance(details, list):
            return enrichment

        for section in details:
            if not isinstance(section, dict):
                continue
            section_id = section.get("id")
            if section_id == "LOCATION_DEFAULT":
                lat = section.get("lat")
                lng = section.get("lng")
                if isinstance(lat, (int, float)):
                    enrichment["latitude"] = float(lat)
                if isinstance(lng, (int, float)):
                    enrichment["longitude"] = float(lng)
                subtitle = section.get("subtitle")
                title = section.get("title")
                address_parts: list[str] = []
                if isinstance(subtitle, str) and subtitle.strip():
                    address_parts.append(_normalize_text(subtitle))
                if isinstance(title, str) and title.strip() and title.lower().strip() not in _GENERIC_LOCATION_TITLES:
                    address_parts.append(_normalize_text(title))
                if address_parts:
                    enrichment["address_full"] = ", ".join(address_parts)

            if section_id == "DESCRIPTION_DEFAULT":
                html_description = section.get("htmlDescription")
                if isinstance(html_description, dict):
                    text = html_description.get("htmlText")
                    if isinstance(text, str) and text.strip():
                        enrichment["description"] = _normalize_text(text)

            if section_id == "POLICIES_DEFAULT":
                title = section.get("title")
                if isinstance(title, str) and title.strip():
                    enrichment["airbnb_policies_title"] = _normalize_text(title)
                raw_rules = section.get("houseRulesSections")
                if isinstance(raw_rules, str) and raw_rules.strip():
                    rules = AirbnbMCPEnricher._split_house_rules(raw_rules)
                    if rules:
                        enrichment["house_rules"] = rules
                        checkin, checkout = AirbnbMCPEnricher._extract_checkin_checkout(rules)
                        if checkin:
                            enrichment["check_in_instructions"] = checkin
                        if checkout:
                            enrichment["check_out_instructions"] = checkout

            if section_id == "HIGHLIGHTS_DEFAULT":
                raw_highlights = section.get("highlights")
                if isinstance(raw_highlights, str) and raw_highlights.strip():
                    highlights = _unique(
                        [_normalize_text(chunk) for chunk in re.split(r"[,;]\s*", raw_highlights) if chunk.strip()],
                        limit=20,
                    )
                    if highlights:
                        enrichment["airbnb_highlights"] = highlights

            if section_id == "AMENITIES_DEFAULT":
                raw_groups = section.get("seeAllAmenitiesGroups")
                if isinstance(raw_groups, str) and raw_groups.strip():
                    groups, amenities = AirbnbMCPEnricher._parse_amenity_groups(raw_groups)
                    if groups:
                        enrichment["airbnb_amenity_groups"] = groups
                    if amenities:
                        enrichment["amenities"] = amenities

        return enrichment

    async def enrich(self, source_url: str) -> dict:
        listing_id = self._extract_listing_id(source_url)
        if not listing_id:
            return {}

        params = self._build_listing_details_args(source_url, listing_id)
        if self._ignore_robots_text:
            params["ignoreRobotsText"] = True
        proc = await asyncio.create_subprocess_exec(
            self._command,
            *self._args,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
            cwd=self._workdir or None,
        )
        try:
            await self._request(
                proc=proc,
                req_id=1,
                method="initialize",
                params={
                    "protocolVersion": "2024-11-05",
                    "capabilities": {},
                    "clientInfo": {"name": "day-ai-service", "version": "0.1.0"},
                },
            )
            await self._notify_initialized(proc)
            await self._request(proc=proc, req_id=2, method="tools/list", params={})
            tool_result = await self._request(
                proc=proc,
                req_id=3,
                method="tools/call",
                params={"name": "airbnb_listing_details", "arguments": params},
            )
            payload = self._extract_json_from_tool_result(tool_result)
            return self._map_listing_details_payload(listing_id, payload)
        finally:
            if proc.stdin is not None:
                proc.stdin.close()
            try:
                await asyncio.wait_for(proc.wait(), timeout=1)
            except asyncio.TimeoutError:
                proc.terminate()
                try:
                    await asyncio.wait_for(proc.wait(), timeout=1)
                except asyncio.TimeoutError:
                    proc.kill()
                    await proc.wait()
