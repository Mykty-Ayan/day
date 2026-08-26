"""Registering the Mini App button on the bot.

The button is the only door into the Mini App. It used to be typed into
BotFather once, which meant a change of front-end domain left it pointing at an
address that no longer served the app — and nothing here noticed, because the
request never reached us. These tests pin the shape Telegram expects, the https
requirement, and the fact that a failure to register does not take the API down
with it.
"""

from __future__ import annotations

import json

import pytest

from app.infrastructure.messaging import providers
from app.infrastructure.messaging.providers import ProviderError, TelegramProvider


class StubResponse:
    def __init__(self, status_code: int = 200, body: dict | None = None) -> None:
        self.status_code = status_code
        self._body = body if body is not None else {"ok": True, "result": True}

    @property
    def text(self) -> str:
        return json.dumps(self._body)

    def json(self) -> dict:
        return self._body


class StubClient:
    """Stands in for httpx.AsyncClient and records the one call we make."""

    def __init__(self, response: StubResponse, calls: list[tuple[str, dict]]) -> None:
        self._response = response
        self._calls = calls

    def __call__(self, *args, **kwargs):
        return self

    async def __aenter__(self) -> "StubClient":
        return self

    async def __aexit__(self, *exc) -> bool:
        return False

    async def post(self, url: str, json: dict | None = None, **kwargs) -> StubResponse:
        self._calls.append((url, json or {}))
        return self._response


@pytest.fixture
def calls(monkeypatch):
    recorded: list[tuple[str, dict]] = []
    monkeypatch.setattr(providers.httpx, "AsyncClient", StubClient(StubResponse(), recorded))
    return recorded


class TestSetMenuButton:
    @pytest.mark.asyncio
    async def test_it_points_the_button_at_the_mini_app(self, calls):
        provider = TelegramProvider(token="bot-token")

        await provider.set_menu_button("https://app.example.com/tma", "Day")

        url, payload = calls[0]
        assert url == "https://api.telegram.org/botbot-token/setChatMenuButton"
        assert payload["menu_button"] == {
            "type": "web_app",
            "text": "Day",
            "web_app": {"url": "https://app.example.com/tma"},
        }

    @pytest.mark.asyncio
    async def test_it_sets_the_default_for_every_chat(self, calls):
        # Without chat_id Telegram applies the button to chats that do not have
        # one of their own — including chats opened after this deploy. Passing a
        # chat_id here would leave every other operator without the app.
        provider = TelegramProvider(token="bot-token")

        await provider.set_menu_button("https://app.example.com/tma", "Day")

        assert "chat_id" not in calls[0][1]

    @pytest.mark.asyncio
    async def test_a_plain_http_url_is_refused_before_the_call(self, calls):
        provider = TelegramProvider(token="bot-token")

        with pytest.raises(ProviderError, match="must be https"):
            await provider.set_menu_button("http://localhost:5173/tma", "Day")

        assert calls == []

    @pytest.mark.asyncio
    async def test_an_unconfigured_bot_refuses(self, calls):
        provider = TelegramProvider(token="")

        with pytest.raises(ProviderError, match="TELEGRAM_BOT_TOKEN"):
            await provider.set_menu_button("https://app.example.com/tma", "Day")

        assert calls == []

    @pytest.mark.asyncio
    async def test_telegram_saying_no_is_reported(self, monkeypatch):
        recorded: list[tuple[str, dict]] = []
        response = StubResponse(400, {"ok": False, "description": "BUTTON_URL_INVALID"})
        monkeypatch.setattr(providers.httpx, "AsyncClient", StubClient(response, recorded))
        provider = TelegramProvider(token="bot-token")

        with pytest.raises(ProviderError, match="BUTTON_URL_INVALID"):
            await provider.set_menu_button("https://app.example.com/tma", "Day")

    @pytest.mark.asyncio
    async def test_an_ok_false_body_with_http_200_is_still_a_failure(self, monkeypatch):
        # Telegram answers 200 with ok:false more often than it answers 4xx.
        recorded: list[tuple[str, dict]] = []
        response = StubResponse(200, {"ok": False, "description": "Unauthorized"})
        monkeypatch.setattr(providers.httpx, "AsyncClient", StubClient(response, recorded))
        provider = TelegramProvider(token="bot-token")

        with pytest.raises(ProviderError, match="Unauthorized"):
            await provider.set_menu_button("https://app.example.com/tma", "Day")


class TestButtonLabel:
    def test_the_label_matches_the_name_the_bot_uses_for_it(self):
        # The bot tells people to "открыть «Панель»" when it cannot help. If the
        # button is registered under another name, that sentence points at a
        # control that does not exist on screen.
        from app.config import Settings
        from app.presentation.api.v1.webhooks import _VOICE_FAILED

        label = Settings.model_fields["TELEGRAM_MENU_BUTTON_TEXT"].default

        assert f"«{label}»" in _VOICE_FAILED
