"""The port the assistant talks to a model through.

Kept narrow on purpose: one call, a list of messages and a list of tools in,
either text or a tool call out. Swapping providers should not reach past this
file, and a fake implementing it is enough to test the whole conversation.
"""

from __future__ import annotations

import abc
import json
from dataclasses import dataclass, field
from typing import Any

from app.domain.assistant.value_objects import ToolCall


@dataclass
class ChatMessage:
    role: str  # system | user | assistant | tool
    content: str = ""
    tool_calls: list[ToolCall] = field(default_factory=list)
    tool_call_id: str = ""

    def to_wire(self) -> dict[str, Any]:
        if self.role == "tool":
            return {"role": "tool", "tool_call_id": self.tool_call_id, "content": self.content}
        if self.tool_calls:
            return {
                "role": "assistant",
                "content": self.content or None,
                "tool_calls": [
                    {
                        "id": call.call_id,
                        "type": "function",
                        # The wire format carries arguments as a JSON string,
                        # not an object — sending a dict here is silently
                        # rejected by some providers and mangled by others.
                        "function": {"name": call.name, "arguments": json.dumps(call.arguments)},
                    }
                    for call in self.tool_calls
                ],
            }
        return {"role": self.role, "content": self.content}


@dataclass
class ModelResponse:
    text: str = ""
    tool_calls: list[ToolCall] = field(default_factory=list)


class AssistantGateway(abc.ABC):
    @abc.abstractmethod
    async def complete(
        self,
        messages: list[ChatMessage],
        tools: list[dict[str, Any]],
    ) -> ModelResponse: ...
