"""The assistant's conversation, driven by a scripted model.

The rule under test is the one the whole context exists to enforce: a tool that
reads may run on the model's say-so, and a tool that changes anything may not.
"""

from __future__ import annotations

import uuid
from datetime import date

import pytest

from app.application.assistant.ask import MAX_STEPS, AskAssistantService
from app.application.assistant.tools import Tool, ToolContext
from app.domain.assistant.gateway import AssistantGateway, ChatMessage, ModelResponse
from app.domain.assistant.value_objects import AssistantUnavailable, ToolCall, ToolEffect

TODAY = date(2026, 8, 26)


class ScriptedGateway(AssistantGateway):
    """Replays prepared model turns and records what it was sent."""

    def __init__(self, *turns: ModelResponse) -> None:
        self._turns = list(turns)
        self.seen: list[list[ChatMessage]] = []

    async def complete(self, messages, tools):
        self.seen.append(list(messages))
        if not self._turns:
            return ModelResponse(text="…")
        return self._turns.pop(0)


def _read_tool(name: str, result, calls: list[str]) -> Tool:
    async def run(**kwargs):
        calls.append(f"{name}:{kwargs}")
        return result

    return Tool(
        name=name,
        description="",
        parameters={"type": "object", "properties": {}, "required": []},
        effect=ToolEffect.READ,
        run=run,
    )


def _write_tool(name: str, calls: list[str]) -> Tool:
    async def run(**kwargs):
        calls.append(f"{name}:{kwargs}")
        return {"done": True}

    return Tool(
        name=name,
        description="",
        parameters={"type": "object", "properties": {}, "required": []},
        effect=ToolEffect.WRITE,
        run=run,
        describe=lambda args: f"Сделать {name} с {args}",
    )


class TestAskAssistantService:
    @pytest.mark.asyncio
    async def test_plain_question_is_answered_without_tools(self):
        gateway = ScriptedGateway(ModelResponse(text="Свободных нет."))
        service = AskAssistantService(gateway, {})

        reply = await service.execute("Что свободно?", today=TODAY)

        assert reply.text == "Свободных нет."
        assert reply.pending is None
        assert reply.used_tools == []

    @pytest.mark.asyncio
    async def test_a_read_tool_runs_and_its_result_reaches_the_model(self):
        calls: list[str] = []
        gateway = ScriptedGateway(
            ModelResponse(
                tool_calls=[ToolCall(name="availability", arguments={"check_in": "2026-08-28"}, call_id="c1")]
            ),
            ModelResponse(text="Свободна 62-я, 25 000 ₸."),
        )
        service = AskAssistantService(gateway, {"availability": _read_tool("availability", {"free": ["62auc"]}, calls)})

        reply = await service.execute("Что свободно 28-го?", today=TODAY)

        assert reply.text == "Свободна 62-я, 25 000 ₸."
        assert calls == ["availability:{'check_in': '2026-08-28'}"]
        assert reply.used_tools == ["availability"]
        # The tool's answer must be in front of the model on the second turn,
        # otherwise it is inventing the reply.
        last_turn = gateway.seen[-1]
        assert any(m.role == "tool" and "62auc" in m.content for m in last_turn)

    @pytest.mark.asyncio
    async def test_a_write_is_proposed_and_never_executed(self):
        calls: list[str] = []
        gateway = ScriptedGateway(
            ModelResponse(
                text="Сейчас оформлю",
                tool_calls=[ToolCall(name="create_booking", arguments={"guest_name": "Ерлан"}, call_id="c1")],
            ),
            ModelResponse(text="Готово!"),  # must never be reached
        )
        service = AskAssistantService(gateway, {"create_booking": _write_tool("create_booking", calls)})

        reply = await service.execute("Забронируй 62-ю на Ерлана", today=TODAY)

        assert calls == [], "the change ran without the operator approving it"
        assert reply.pending is not None
        assert reply.pending.tool == "create_booking"
        assert reply.pending.arguments == {"guest_name": "Ерлан"}
        assert "Ерлан" in reply.pending.summary
        assert reply.text != "Готово!", "the model was allowed to claim the change had happened"

    @pytest.mark.asyncio
    async def test_a_failing_read_is_reported_to_the_model_not_the_operator(self):
        async def explode(**kwargs):
            raise ValueError("Квартира «77» не найдена")

        broken = Tool(
            name="property_info",
            description="",
            parameters={"type": "object", "properties": {}, "required": []},
            effect=ToolEffect.READ,
            run=explode,
        )
        gateway = ScriptedGateway(
            ModelResponse(tool_calls=[ToolCall(name="property_info", arguments={"query": "77"}, call_id="c1")]),
            ModelResponse(text="Такой квартиры нет."),
        )
        service = AskAssistantService(gateway, {"property_info": broken})

        reply = await service.execute("Какой вайфай в 77-й?", today=TODAY)

        assert reply.text == "Такой квартиры нет."
        assert any(
            m.role == "tool" and "не найдена" in m.content for m in gateway.seen[-1]
        ), "the model never learned why the tool failed"

    @pytest.mark.asyncio
    async def test_an_unknown_tool_does_not_end_the_turn(self):
        gateway = ScriptedGateway(
            ModelResponse(tool_calls=[ToolCall(name="launch_rocket", arguments={}, call_id="c1")]),
            ModelResponse(text="Не умею."),
        )
        service = AskAssistantService(gateway, {})

        reply = await service.execute("Запусти ракету", today=TODAY)

        assert reply.text == "Не умею."

    @pytest.mark.asyncio
    async def test_a_model_that_only_calls_tools_is_cut_off(self):
        calls: list[str] = []
        looping = [
            ModelResponse(tool_calls=[ToolCall(name="today", arguments={}, call_id=f"c{i}")])
            for i in range(MAX_STEPS + 2)
        ]
        gateway = ScriptedGateway(*looping)
        service = AskAssistantService(gateway, {"today": _read_tool("today", {"arrivals": []}, calls)})

        with pytest.raises(AssistantUnavailable):
            await service.execute("Что сегодня?", today=TODAY)

        assert len(calls) == MAX_STEPS

    @pytest.mark.asyncio
    async def test_an_empty_question_is_refused(self):
        service = AskAssistantService(ScriptedGateway(), {})

        with pytest.raises(ValueError):
            await service.execute("   ", today=TODAY)

    @pytest.mark.asyncio
    async def test_history_is_replayed_before_the_new_question(self):
        gateway = ScriptedGateway(ModelResponse(text="Да."))
        service = AskAssistantService(gateway, {})

        await service.execute(
            "А на завтра?",
            history=[ChatMessage(role="user", content="Что свободно сегодня?")],
            today=TODAY,
        )

        roles = [m.role for m in gateway.seen[0]]
        contents = [m.content for m in gateway.seen[0]]
        assert roles == ["system", "user", "user"]
        assert contents[1] == "Что свободно сегодня?"
        assert contents[2] == "А на завтра?"
        assert "2026-08-26" in contents[0], "the model was not told what day it is"


class TestToolGuards:
    """The tools reach the services directly, so the checks the HTTP schemas
    make are not made for them. These are the ones that touch money."""

    def _context(self, today: date = TODAY, metrics=None) -> ToolContext:
        return ToolContext(
            uuid.uuid4(),
            availability_service=None,
            booking_repo=None,
            guest_repo=None,
            property_repo=None,
            create_booking_service=None,
            update_booking_service=None,
            payment_service=None,
            cleaning_service=None,
            metrics_service=metrics,
            today=today,
        )

    @pytest.mark.asyncio
    @pytest.mark.parametrize("amount", [-25000, 0, -0.01])
    async def test_a_payment_must_be_positive(self, amount):
        # PaymentCreate declares gt=0, but nothing goes through PaymentCreate
        # here: an unguarded tool would be the one way to write a payment that
        # makes a debt grow.
        with pytest.raises(ValueError, match="больше нуля"):
            await self._context().record_payment(booking_id=str(uuid.uuid4()), amount=amount)

    @pytest.mark.asyncio
    async def test_an_unreadable_amount_is_refused_before_anything_is_looked_up(self):
        with pytest.raises(ValueError, match="сумму"):
            await self._context().record_payment(booking_id=str(uuid.uuid4()), amount="много")

    @pytest.mark.asyncio
    async def test_asking_about_money_on_the_first_of_the_month_still_answers(self):
        # Metrics span a half-open range and refuse date_to <= date_from, so on
        # the 1st "сколько за этот месяц" used to collapse to an empty range.
        seen: list[tuple] = []

        class Metrics:
            async def execute(self, company, date_from, date_to):
                seen.append((date_from, date_to))
                return {"revenue": 0.0}

        context = self._context(today=date(2026, 9, 1), metrics=Metrics())

        answer = await context.money()

        assert seen == [(date(2026, 9, 1), date(2026, 9, 2))]
        assert answer["from"] == "2026-09-01"
        assert answer["to"] == "2026-09-02"

    @pytest.mark.asyncio
    async def test_a_normal_month_is_left_alone(self):
        seen: list[tuple] = []

        class Metrics:
            async def execute(self, company, date_from, date_to):
                seen.append((date_from, date_to))
                return {}

        context = self._context(today=date(2026, 9, 17), metrics=Metrics())

        await context.money()

        assert seen == [(date(2026, 9, 1), date(2026, 9, 17))]
