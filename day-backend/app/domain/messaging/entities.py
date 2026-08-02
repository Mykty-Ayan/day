from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta

from app.domain.messaging.value_objects import (
    Channel,
    ConversationState,
    MessageDirection,
    MessageStatus,
    NotificationEvent,
    NotificationStatus,
)


@dataclass
class ChannelIdentity:
    """Binds an external chat to a company, and where known to a person.

    `user_id` is set for the host's Telegram chat; `guest_id` for a WhatsApp
    contact once they identify themselves. Both stay None for a stranger who has
    only just written in.
    """

    id: uuid.UUID = field(default_factory=uuid.uuid4)
    company_id: uuid.UUID = field(default_factory=uuid.uuid4)
    channel: Channel = Channel.TELEGRAM
    external_id: str = ""
    display_name: str = ""
    user_id: uuid.UUID | None = None
    guest_id: uuid.UUID | None = None
    is_active: bool = True
    created_at: datetime | None = None


@dataclass
class Conversation:
    id: uuid.UUID = field(default_factory=uuid.uuid4)
    company_id: uuid.UUID = field(default_factory=uuid.uuid4)
    channel: Channel = Channel.TELEGRAM
    identity_id: uuid.UUID = field(default_factory=uuid.uuid4)
    state: ConversationState = ConversationState.IDLE
    # Everything the flow has collected so far: dates, property choice, name.
    context: dict = field(default_factory=dict)
    last_message_at: datetime | None = None
    created_at: datetime | None = None


@dataclass
class Message:
    id: uuid.UUID = field(default_factory=uuid.uuid4)
    conversation_id: uuid.UUID = field(default_factory=uuid.uuid4)
    direction: MessageDirection = MessageDirection.INBOUND
    body: str = ""
    provider_message_id: str | None = None
    status: MessageStatus = MessageStatus.RECEIVED
    payload: dict = field(default_factory=dict)
    created_at: datetime | None = None


@dataclass
class OutboundNotification:
    """One queued message to a host, written in the same transaction as the
    domain change that caused it.

    The queue is what makes "a booking was created, so the host hears about it"
    survive the provider being down.
    """

    id: uuid.UUID = field(default_factory=uuid.uuid4)
    company_id: uuid.UUID = field(default_factory=uuid.uuid4)
    channel: Channel = Channel.TELEGRAM
    target: str = ""
    event: NotificationEvent = NotificationEvent.BOOKING_CREATED
    payload: dict = field(default_factory=dict)
    status: NotificationStatus = NotificationStatus.PENDING
    attempts: int = 0
    last_error: str | None = None
    next_attempt_at: datetime | None = None
    created_at: datetime | None = None
    sent_at: datetime | None = None

    # Give up after this many tries; a target that keeps failing is a
    # configuration problem, not a transient one.
    MAX_ATTEMPTS = 6

    def schedule_retry(self, error: str, now: datetime | None = None) -> None:
        """Back off exponentially: 1, 2, 4, 8, 16, 32 minutes."""
        now = now or datetime.utcnow()
        self.attempts += 1
        self.last_error = error[:500]
        if self.attempts >= self.MAX_ATTEMPTS:
            self.status = NotificationStatus.FAILED
            self.next_attempt_at = None
            return
        self.status = NotificationStatus.PENDING
        self.next_attempt_at = now + timedelta(minutes=2 ** (self.attempts - 1))

    def mark_sent(self, now: datetime | None = None) -> None:
        self.status = NotificationStatus.SENT
        self.sent_at = now or datetime.utcnow()
        self.next_attempt_at = None
        self.last_error = None


@dataclass
class ChannelLinkCode:
    """Single-use code an owner pastes into the bot to bind their chat.

    Without it there is no way to tell which company a Telegram chat belongs to,
    and asking for a password in a chat window would be worse.
    """

    id: uuid.UUID = field(default_factory=uuid.uuid4)
    company_id: uuid.UUID = field(default_factory=uuid.uuid4)
    code: str = ""
    channel: Channel = Channel.TELEGRAM
    created_by: uuid.UUID | None = None
    expires_at: datetime | None = None
    used_at: datetime | None = None
    created_at: datetime | None = None

    def is_usable(self, now: datetime | None = None) -> bool:
        now = now or datetime.utcnow()
        if self.used_at is not None:
            return False
        return self.expires_at is None or self.expires_at > now
