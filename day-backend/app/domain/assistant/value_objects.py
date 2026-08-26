"""What the assistant is allowed to be.

The one rule the whole context turns on: a tool that only reads may run on the
model's say-so, while a tool that changes anything must come back to the
operator first. The model proposes; the person disposes.
"""

from __future__ import annotations

import enum
from dataclasses import dataclass, field
from typing import Any


class ToolEffect(str, enum.Enum):
    READ = "read"
    WRITE = "write"


@dataclass(frozen=True)
class ToolCall:
    name: str
    arguments: dict[str, Any]
    call_id: str = ""


@dataclass(frozen=True)
class PendingAction:
    """A change the assistant wants to make, described for a human to approve.

    `summary` is what the operator reads before tapping; `arguments` is what
    gets executed if they do — the same payload the app would have sent.
    """

    tool: str
    arguments: dict[str, Any]
    summary: str


@dataclass
class AssistantReply:
    text: str
    pending: PendingAction | None = None
    used_tools: list[str] = field(default_factory=list)


class AssistantUnavailable(RuntimeError):
    """No model is configured, so the assistant cannot answer at all."""
