"""The "open the booking" button under a host notice.

The button is a convenience; the notice is the point. These tests pin the shape
Telegram expects and the rule that a refused button never costs the host the
message itself.
"""

from __future__ import annotations

import json

import pytest

from app.domain.messaging.services import AppButton
from app.infrastructure.messaging import providers
from app.infrastructure.messaging.providers import TelegramProvider


class StubResponse:
    def __init__(self, status_code: int, body: dict) -> None:
        self.status_code = status_code
        self._body = body

    @property
    def text(self) -> str:
        return json.dumps(self._body)

    def json(self) -> dict:
        return self._body


class StubClient:
    """Stands in for httpx.AsyncClient: answers each post with the next queued response."""

    def __init__(self, responses: list[StubResponse], calls: list[dict]) -> None:
        self._responses = responses
        self._calls = calls

    def __call__(self, *args, **kwargs):
        return self

    async def __aenter__(self) -> "StubClient":
        return self

    async def __aexit__(self, *exc) -> bool:
        return False

    async def post(self, url: str, json: dict | None = None, **kwargs) -> StubResponse:
        self._calls.append(json or {})
        return self._responses.pop(0)


SENT = StubResponse(200, {"ok": True, "result": {"message_id": 7}})
BUTTON = AppButton("Открыть бронь", "https://app.example.com/tma?booking=42")


def _stub(monkeypatch, *responses: StubResponse) -> list[dict]:
    calls: list[dict] = []
    monkeypatch.setattr(providers.httpx, "AsyncClient", StubClient(list(responses), calls))
    return calls


@pytest.mark.asyncio
async def test_button_opens_the_mini_app(monkeypatch):
    calls = _stub(monkeypatch, SENT)

    await TelegramProvider(token="t").send_text("555", "Новая бронь", buttons=[BUTTON])

    assert calls[0]["reply_markup"] == {
        "inline_keyboard": [[{"text": "Открыть бронь", "web_app": {"url": "https://app.example.com/tma?booking=42"}}]]
    }


@pytest.mark.asyncio
async def test_a_refused_button_still_delivers_the_text(monkeypatch):
    calls = _stub(monkeypatch, StubResponse(400, {"ok": False, "description": "BUTTON_TYPE_INVALID"}), SENT)

    sent = await TelegramProvider(token="t").send_text("555", "Новая бронь", buttons=[BUTTON])

    assert sent.provider_message_id == "7"
    assert "reply_markup" not in calls[1]
    assert calls[1]["text"] == "Новая бронь"


@pytest.mark.asyncio
async def test_plain_text_has_no_keyboard(monkeypatch):
    calls = _stub(monkeypatch, SENT)

    await TelegramProvider(token="t").send_text("555", "Привет")

    assert "reply_markup" not in calls[0]


@pytest.mark.asyncio
async def test_other_refusals_are_not_blamed_on_the_button(monkeypatch):
    calls = _stub(monkeypatch, StubResponse(400, {"ok": False, "description": "Bad Request: chat not found"}))

    with pytest.raises(providers.ProviderError):
        await TelegramProvider(token="t").send_text("555", "Новая бронь", buttons=[BUTTON])

    assert len(calls) == 1
