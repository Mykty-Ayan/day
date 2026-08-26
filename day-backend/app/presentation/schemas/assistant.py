from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class AssistantTurn(BaseModel):
    """One earlier exchange, replayed so the assistant keeps the thread."""

    role: str = Field(pattern="^(user|assistant)$")
    content: str = Field(max_length=4000)


class AssistantAskRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    # Bounded on purpose: a phone conversation that needs more than this has
    # drifted, and every turn is paid for twice — once to send, once to think.
    history: list[AssistantTurn] = Field(default_factory=list, max_length=10)


class PendingActionResponse(BaseModel):
    """A change the assistant proposes. Nothing happens until it is confirmed."""

    tool: str
    arguments: dict[str, Any]
    summary: str


class AssistantAskResponse(BaseModel):
    text: str
    pending: PendingActionResponse | None = None
    used_tools: list[str] = Field(default_factory=list)


class AssistantConfirmRequest(BaseModel):
    tool: str = Field(min_length=1, max_length=64)
    arguments: dict[str, Any] = Field(default_factory=dict)


class AssistantConfirmResponse(BaseModel):
    tool: str
    result: Any
