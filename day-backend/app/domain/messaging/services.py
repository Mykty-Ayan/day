"""Ports the messaging application layer talks through.

The application never imports a Telegram or whapi client directly — adding a
third channel means adding one infrastructure class, not touching use cases.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from app.domain.messaging.value_objects import Channel


@dataclass(frozen=True)
class SentMessage:
    provider_message_id: str


@dataclass(frozen=True)
class AppButton:
    """A button under a message that opens the Mini App at `url`."""

    text: str
    url: str


class MessageProvider(Protocol):
    channel: Channel

    async def send_text(self, to: str, text: str, *, buttons: list[AppButton] | None = None) -> SentMessage:
        """Deliver a plain text message. Raises on a provider error.

        A channel without Mini App buttons sends the text alone.
        """
        ...
