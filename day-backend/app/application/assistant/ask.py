"""Running one question past the model.

Reads are answered inside the loop: the model asks, the tool runs, the result
goes back, and the operator gets a sentence. The first write the model proposes
ends the turn — it comes back as something to approve, not something done.
"""

from __future__ import annotations

import json
import logging
from datetime import date

from app.application.assistant.tools import Tool
from app.domain.assistant.gateway import AssistantGateway, ChatMessage
from app.domain.assistant.value_objects import (
    AssistantReply,
    AssistantUnavailable,
    PendingAction,
    ToolEffect,
)

logger = logging.getLogger(__name__)

# Enough hops for "find the booking, then propose the change"; short enough that
# a confused model cannot spend an operator's afternoon.
MAX_STEPS = 6

SYSTEM_PROMPT = """Ты помощник субарендатора, который сдаёт квартиры посуточно.
Сегодня {today}.

Отвечай коротко, по-русски, как коллега в переписке — без списков на пол-экрана
и без вступлений. Суммы пиши с пробелом между разрядами и знаком ₸.

Данные бери инструментами, никогда не выдумывай. Если чего-то нет — так и скажи.
Чтобы изменить что-то (бронь, оплата, уборка), сначала найди нужную бронь или
квартиру инструментом, а потом предложи изменение: оператор подтвердит его сам.
Никогда не утверждай, что изменение сделано, — ты его только предлагаешь."""


class AskAssistantService:
    def __init__(self, gateway: AssistantGateway, tools: dict[str, Tool]) -> None:
        self._gateway = gateway
        self._tools = tools

    async def execute(
        self,
        question: str,
        history: list[ChatMessage] | None = None,
        today: date | None = None,
    ) -> AssistantReply:
        if not question.strip():
            raise ValueError("Пустой вопрос")

        messages: list[ChatMessage] = [
            ChatMessage(role="system", content=SYSTEM_PROMPT.format(today=(today or date.today()).isoformat())),
            *(history or []),
            ChatMessage(role="user", content=question.strip()),
        ]
        wire_tools = [tool.to_wire() for tool in self._tools.values()]
        used: list[str] = []

        for _ in range(MAX_STEPS):
            response = await self._gateway.complete(messages, wire_tools)

            if not response.tool_calls:
                return AssistantReply(text=response.text, used_tools=used)

            messages.append(ChatMessage(role="assistant", content=response.text, tool_calls=response.tool_calls))

            for call in response.tool_calls:
                tool = self._tools.get(call.name)
                if tool is None:
                    messages.append(
                        ChatMessage(
                            role="tool",
                            tool_call_id=call.call_id,
                            content=json.dumps({"error": "Нет такого инструмента"}, ensure_ascii=False),
                        )
                    )
                    continue

                used.append(tool.name)

                if tool.effect is ToolEffect.WRITE:
                    # Stop here. Anything the model says after proposing a change
                    # would read as if the change had happened.
                    return AssistantReply(
                        text=response.text,
                        pending=PendingAction(
                            tool=tool.name,
                            arguments=call.arguments,
                            summary=tool.describe(call.arguments) if tool.describe else tool.name,
                        ),
                        used_tools=used,
                    )

                messages.append(
                    ChatMessage(
                        role="tool",
                        tool_call_id=call.call_id,
                        content=json.dumps(await _safely(tool, call.arguments), ensure_ascii=False, default=str),
                    )
                )

        logger.warning("Assistant hit the step ceiling without answering")
        raise AssistantUnavailable("Не смог собрать ответ, попробуйте переформулировать")


async def _safely(tool: Tool, arguments: dict) -> object:
    """A failed read is information for the model, not the end of the turn."""
    try:
        return await tool.run(**arguments)
    except TypeError as error:
        return {"error": f"Неверные аргументы: {error}"}
    except ValueError as error:
        return {"error": str(error)}
    except Exception:
        logger.exception("Assistant tool %s failed", tool.name)
        return {"error": "Инструмент не отработал"}
