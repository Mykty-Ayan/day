"""Concrete message providers.

Each one implements `MessageProvider` and is the only place that knows a
vendor's HTTP shape.
"""

from __future__ import annotations

import logging

import httpx

from app.config import settings
from app.domain.messaging.services import SentMessage
from app.domain.messaging.value_objects import Channel

logger = logging.getLogger(__name__)

_TIMEOUT = httpx.Timeout(10.0, connect=5.0)


class ProviderError(RuntimeError):
    """A message could not be delivered. Callers retry through the outbox."""


class TelegramProvider:
    """Telegram Bot API — the host-facing channel."""

    channel = Channel.TELEGRAM

    def __init__(self, token: str | None = None) -> None:
        self._token = token or settings.TELEGRAM_BOT_TOKEN

    @property
    def is_configured(self) -> bool:
        return bool(self._token)

    async def send_text(self, to: str, text: str) -> SentMessage:
        if not self.is_configured:
            raise ProviderError("TELEGRAM_BOT_TOKEN is not set")

        url = f"https://api.telegram.org/bot{self._token}/sendMessage"
        payload = {
            "chat_id": to,
            "text": text,
            # HTML rather than Markdown: guest names and property titles contain
            # underscores and asterisks often enough that Markdown breaks.
            "parse_mode": "HTML",
            "disable_web_page_preview": True,
        }
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            response = await client.post(url, json=payload)

        if response.status_code != 200:
            raise ProviderError(f"Telegram returned {response.status_code}: {response.text[:200]}")

        body = response.json()
        if not body.get("ok"):
            raise ProviderError(f"Telegram rejected the message: {body.get('description')}")
        return SentMessage(provider_message_id=str(body["result"]["message_id"]))

    async def download_file(self, file_id: str, max_bytes: int) -> bytes:
        """Fetch a file the user sent us — a voice note, in practice.

        Two hops, because Telegram hands out a path before it hands out bytes.
        The size is checked against the metadata first so an oversized file
        costs one small request rather than a download.
        """
        if not self.is_configured:
            raise ProviderError("TELEGRAM_BOT_TOKEN is not set")

        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            described = await client.get(
                f"https://api.telegram.org/bot{self._token}/getFile", params={"file_id": file_id}
            )
            if described.status_code != 200:
                raise ProviderError(f"Telegram returned {described.status_code} for getFile")

            body = described.json()
            if not body.get("ok"):
                raise ProviderError(f"Telegram refused the file: {body.get('description')}")

            result = body.get("result") or {}
            path = result.get("file_path")
            if not path:
                raise ProviderError("Telegram returned no file path")
            size = result.get("file_size")
            if isinstance(size, int) and size > max_bytes:
                raise ProviderError(f"File is {size} bytes, over the {max_bytes} limit")

            downloaded = await client.get(f"https://api.telegram.org/file/bot{self._token}/{path}")
            if downloaded.status_code != 200:
                raise ProviderError(f"Telegram returned {downloaded.status_code} downloading the file")

        content = downloaded.content
        if len(content) > max_bytes:
            raise ProviderError(f"File is {len(content)} bytes, over the {max_bytes} limit")
        return content

    async def set_webhook(self, url: str, secret: str) -> None:
        """Point Telegram at our webhook. Safe to call on every boot."""
        if not self.is_configured:
            raise ProviderError("TELEGRAM_BOT_TOKEN is not set")

        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            response = await client.post(
                f"https://api.telegram.org/bot{self._token}/setWebhook",
                json={
                    "url": url,
                    "secret_token": secret,
                    "allowed_updates": ["message"],
                    # Updates queued while the bot was down are stale by the time
                    # we boot; answering them would confuse the host.
                    "drop_pending_updates": True,
                },
            )
        body = response.json()
        if response.status_code != 200 or not body.get("ok"):
            raise ProviderError(f"setWebhook failed: {body.get('description', response.text[:200])}")


class WhapiProvider:
    """WhatsApp through whapi.cloud — the guest-facing channel."""

    channel = Channel.WHATSAPP

    def __init__(self, token: str | None = None, api_url: str | None = None) -> None:
        self._token = token or settings.WHAPI_TOKEN
        self._api_url = (api_url or settings.WHAPI_API_URL).rstrip("/")

    @property
    def is_configured(self) -> bool:
        return bool(self._token)

    async def send_text(self, to: str, text: str) -> SentMessage:
        if not self.is_configured:
            raise ProviderError("WHAPI_TOKEN is not set")

        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            response = await client.post(
                f"{self._api_url}/messages/text",
                headers={"Authorization": f"Bearer {self._token}"},
                json={"to": to, "body": text},
            )

        if response.status_code >= 400:
            raise ProviderError(f"whapi returned {response.status_code}: {response.text[:200]}")

        body = response.json()
        if not body.get("sent", True):
            raise ProviderError(f"whapi did not send the message: {body}")
        return SentMessage(provider_message_id=str(body.get("message", {}).get("id", "")))


class FakeProvider:
    """Records what would have been sent. Used by every unit test."""

    def __init__(self, channel: Channel = Channel.TELEGRAM, fail_with: str | None = None) -> None:
        self.channel = channel
        self.sent: list[tuple[str, str]] = []
        self._fail_with = fail_with

    async def send_text(self, to: str, text: str) -> SentMessage:
        if self._fail_with:
            raise ProviderError(self._fail_with)
        self.sent.append((to, text))
        return SentMessage(provider_message_id=f"fake-{len(self.sent)}")
