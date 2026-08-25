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


class MessageProvider(Protocol):
    channel: Channel

    async def send_text(self, to: str, text: str) -> SentMessage:
        """Deliver a plain text message. Raises on a provider error."""
        ...
