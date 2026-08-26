"""OpenRouter adapter for the assistant.

OpenRouter speaks the OpenAI chat-completions dialect, so this is thin on
purpose: shape the request, read one choice back, and let the application layer
decide what a tool call means.
"""

from __future__ import annotations

import json
import logging
from typing import Any

import httpx

from app.config import settings
from app.domain.assistant.gateway import AssistantGateway, ChatMessage, ModelResponse
from app.domain.assistant.value_objects import AssistantUnavailable, ToolCall

logger = logging.getLogger(__name__)


class OpenRouterAssistantGateway(AssistantGateway):
    def __init__(
        self,
        api_key: str | None = None,
        base_url: str | None = None,
        model: str | None = None,
        timeout_seconds: int | None = None,
    ) -> None:
        self._api_key = api_key if api_key is not None else settings.ASSISTANT_API_KEY
        self._base_url = (base_url or settings.ASSISTANT_API_URL).rstrip("/")
        self._model = model or settings.ASSISTANT_MODEL
        self._timeout = timeout_seconds or settings.ASSISTANT_TIMEOUT_SECONDS

    async def complete(
        self,
        messages: list[ChatMessage],
        tools: list[dict[str, Any]],
    ) -> ModelResponse:
        if not self._api_key:
            raise AssistantUnavailable("Assistant is not configured")

        payload: dict[str, Any] = {
            "model": self._model,
            "messages": [message.to_wire() for message in messages],
            # Deterministic enough to be predictable, not so rigid that it
            # cannot rephrase an answer for a person.
            "temperature": 0.2,
        }
        if tools:
            payload["tools"] = tools
            payload["tool_choice"] = "auto"

        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
            # OpenRouter attributes usage to an app; both headers are optional
            # but make the spend legible on their dashboard.
            "HTTP-Referer": settings.PUBLIC_BASE_URL,
            "X-Title": "Day PMS",
        }

        async with httpx.AsyncClient(timeout=self._timeout) as client:
            response = await client.post(
                f"{self._base_url}/chat/completions", json=payload, headers=headers
            )
            if response.status_code >= 400:
                logger.warning("Assistant call failed: %s %s", response.status_code, response.text[:300])
                raise AssistantUnavailable(f"Model returned {response.status_code}")
            body = response.json()

        choices = body.get("choices") or []
        if not choices:
            raise AssistantUnavailable("Model returned no choices")

        message = choices[0].get("message") or {}
        return ModelResponse(
            text=(message.get("content") or "").strip(),
            tool_calls=_read_tool_calls(message.get("tool_calls")),
        )


def _read_tool_calls(raw: Any) -> list[ToolCall]:
    if not isinstance(raw, list):
        return []

    calls: list[ToolCall] = []
    for entry in raw:
        if not isinstance(entry, dict):
            continue
        function = entry.get("function") or {}
        name = function.get("name")
        if not isinstance(name, str) or not name:
            continue

        # Arguments arrive as a JSON string. A model that emits a malformed one
        # should lose that call, not take the whole reply down with it.
        arguments = function.get("arguments")
        if isinstance(arguments, str):
            try:
                arguments = json.loads(arguments or "{}")
            except json.JSONDecodeError:
                logger.warning("Assistant sent unparsable arguments for %s", name)
                continue
        if not isinstance(arguments, dict):
            arguments = {}

        calls.append(ToolCall(name=name, arguments=arguments, call_id=str(entry.get("id") or name)))
    return calls
