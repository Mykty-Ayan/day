from __future__ import annotations

import json
import logging

import httpx

from app.config import settings
from app.domain.services import DataExtractor
from app.domain.value_objects import SourceType

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are a property data extraction assistant. Given the text content of a property listing page,
extract structured data about the property.

Return a JSON object with the following fields (use null for missing data):
{
    "name": "Property title/name",
    "internal_name": "Short descriptive internal label in Latin (e.g. Meridian 12 floor)",
    "type": "apartment | house | room",
    "description": "Property description",
    "latitude": 0.0,
    "longitude": 0.0,
    "address_full": "Full address string",
    "rooms": 0,
    "beds": 0,
    "area_total": 0.0,
    "area_living": 0.0,
    "floor": 0,
    "check_in_instructions": "Check-in details",
    "check_out_instructions": "Check-out details",
    "house_rules": "House rules",
    "amenities": ["amenity1", "amenity2"],
    "base_price": 0.0,
    "photos": ["url1", "url2"]
}

Important:
- Return ONLY the JSON object, no markdown or additional text.
- Use null for any field you cannot determine from the listing.
- If listing content contains a [MAP_COORDINATES] block, use those exact values for latitude/longitude.
- For internal_name, generate a concise descriptive latin label (complex/street/floor if available).
- For internal_name, prioritize residential complex name (if present) + floor.
- If no residential complex is present, use microdistrict + floor for internal_name.
- If both complex and microdistrict are missing, use street + house number + floor for internal_name.
- For internal_name, transliterate non-latin text to latin.
- For internal_name, avoid numeric-only values and generic placeholders.
- For type, normalize to one of: apartment, house, room.
- For amenities, return a list of strings.
- For photos, return a list of image URLs found in the listing.
- For base_price, extract the nightly/daily rate if available.
"""

SOURCE_HINTS: dict[SourceType, str] = {
    SourceType.BOOKING: "This is a Booking.com listing. Look for property details in structured data sections.",
    SourceType.AIRBNB: "This is an Airbnb listing. Look for property details in the listing description.",
    SourceType.KRISHA: "This is a Krisha.kz listing (Kazakhstan real estate). Prices may be in KZT or USD.",
    SourceType.TEXT: "This is raw text provided by the user describing a property. Extract all available details.",
    SourceType.OTHER: "This is a generic property listing.",
}


class LLMExtractor(DataExtractor):
    """Extracts structured property data from text content using an LLM API."""

    async def extract(self, content: str, source_type: SourceType, user_prompt: str | None = None) -> dict:
        # Check for API key availability
        if settings.LLM_PROVIDER == "openai" and not settings.OPENAI_API_KEY:
            logger.warning("No OpenAI API key configured; extraction is unavailable")
            raise ValueError("OpenAI API key is not configured in ai-service")
        if settings.LLM_PROVIDER == "anthropic" and not settings.ANTHROPIC_API_KEY:
            logger.warning("No Anthropic API key configured; extraction is unavailable")
            raise ValueError("Anthropic API key is not configured in ai-service")
        if settings.LLM_PROVIDER == "openrouter" and not settings.OPENROUTER_API_KEY:
            logger.warning("No OpenRouter API key configured; extraction is unavailable")
            raise ValueError("OpenRouter API key is not configured in ai-service")

        # Truncate content to fit within LLM context window
        truncated_content = content[: settings.MAX_CONTENT_LENGTH]

        # Build user message
        source_hint = SOURCE_HINTS.get(source_type, "")
        user_message = f"{source_hint}\n\nListing content:\n{truncated_content}"
        if user_prompt:
            user_message += f"\n\nAdditional instructions: {user_prompt}"

        if settings.LLM_PROVIDER == "openrouter":
            return await self._call_openrouter(user_message)
        if settings.LLM_PROVIDER == "anthropic":
            return await self._call_anthropic(user_message)
        return await self._call_openai(user_message)

    async def _call_openai(self, user_message: str) -> dict:
        """Call OpenAI Chat Completions API."""
        url = "https://api.openai.com/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": settings.LLM_MODEL,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_message},
            ],
            "response_format": {"type": "json_object"},
        }
        # GPT-5 models currently accept only the default temperature value.
        if not settings.LLM_MODEL.startswith("gpt-5"):
            payload["temperature"] = 0.1

        timeout = httpx.Timeout(settings.REQUEST_TIMEOUT)
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(url, json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()

        content = self._extract_message_content(data)
        return self._parse_json_response(content)

    async def _call_anthropic(self, user_message: str) -> dict:
        """Call Anthropic Messages API."""
        url = "https://api.anthropic.com/v1/messages"
        headers = {
            "x-api-key": settings.ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        }
        payload = {
            "model": settings.LLM_MODEL,
            "max_tokens": 4096,
            "system": SYSTEM_PROMPT,
            "messages": [
                {"role": "user", "content": user_message},
            ],
            "temperature": 0.1,
        }

        timeout = httpx.Timeout(settings.REQUEST_TIMEOUT)
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(url, json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()

        content = data["content"][0]["text"]
        return self._parse_json_response(content)

    async def _call_openrouter(self, user_message: str) -> dict:
        """Call OpenRouter Chat Completions API."""
        url = f"{settings.OPENROUTER_BASE_URL.rstrip('/')}/chat/completions"
        headers = {
            "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
            "Content-Type": "application/json",
            "X-Title": settings.OPENROUTER_APP_NAME,
        }
        if settings.OPENROUTER_HTTP_REFERER:
            headers["HTTP-Referer"] = settings.OPENROUTER_HTTP_REFERER

        payload = {
            "model": settings.LLM_MODEL,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_message},
            ],
            "temperature": 0.1,
            "response_format": {"type": "json_object"},
        }

        timeout = httpx.Timeout(settings.REQUEST_TIMEOUT)
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(url, json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()

        content = self._extract_message_content(data)
        return self._parse_json_response(content)

    @staticmethod
    def _extract_message_content(response_data: dict) -> str:
        choices = response_data.get("choices")
        if not isinstance(choices, list) or not choices:
            raise ValueError("LLM response has no choices")

        message = choices[0].get("message")
        if not isinstance(message, dict):
            raise ValueError("LLM response missing message object")

        content = message.get("content")
        if isinstance(content, str):
            return content

        # Some providers return message.content as list parts
        if isinstance(content, list):
            text_parts: list[str] = []
            for part in content:
                if isinstance(part, dict) and part.get("type") in {"text", "output_text"}:
                    text = part.get("text")
                    if isinstance(text, str):
                        text_parts.append(text)
            if text_parts:
                return "\n".join(text_parts)

        raise ValueError("LLM response content is empty or unsupported")

    @staticmethod
    def _parse_json_response(content: str) -> dict:
        """Parse JSON from LLM response, handling potential markdown wrapping."""
        content = content.strip()

        # Strip markdown code fences if present
        if content.startswith("```"):
            lines = content.splitlines()
            # Remove first line (```json or ```) and last line (```)
            lines = [line for line in lines if not line.strip().startswith("```")]
            content = "\n".join(lines).strip()

        try:
            result = json.loads(content)
        except json.JSONDecodeError:
            logger.warning("Failed to parse LLM response as JSON: %.200s", content)
            return {}

        if not isinstance(result, dict):
            logger.warning("LLM response is not a dict: %s", type(result).__name__)
            return {}

        return result
