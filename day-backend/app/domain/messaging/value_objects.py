from __future__ import annotations

import enum


class Channel(str, enum.Enum):
    TELEGRAM = "telegram"
    WHATSAPP = "whatsapp"


class MessageDirection(str, enum.Enum):
    INBOUND = "inbound"
    OUTBOUND = "outbound"


class MessageStatus(str, enum.Enum):
    RECEIVED = "received"
    SENT = "sent"
    FAILED = "failed"


class ConversationState(str, enum.Enum):
    """Where a guest conversation stands.

    Only the WhatsApp guest flow is stateful; the host's Telegram chat answers
    each command independently and stays IDLE.
    """

    IDLE = "idle"
    AWAITING_DATES = "awaiting_dates"
    AWAITING_PROPERTY_CHOICE = "awaiting_property_choice"
    AWAITING_GUEST_NAME = "awaiting_guest_name"
    AWAITING_CONFIRMATION = "awaiting_confirmation"
    HANDED_TO_HUMAN = "handed_to_human"


class NotificationStatus(str, enum.Enum):
    PENDING = "pending"
    SENT = "sent"
    FAILED = "failed"


class NotificationEvent(str, enum.Enum):
    """What happened, not what to say — wording lives in the templates."""

    BOOKING_CREATED = "booking_created"
    BOOKING_CANCELLED = "booking_cancelled"
    GUEST_INQUIRY = "guest_inquiry"
    GUEST_HANDOFF = "guest_handoff"
