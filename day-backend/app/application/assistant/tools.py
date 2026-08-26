"""What the assistant can do, and which half of it needs permission.

Every tool here is something the operator can already do by tapping. The
assistant gets no authority of its own: reads run inside the conversation,
writes come back as a proposal the person approves, and both execute under the
caller's own company and permissions.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Any, Awaitable, Callable

from app.domain.assistant.value_objects import ToolEffect

_DATE = {"type": "string", "description": "Дата в формате ГГГГ-ММ-ДД"}


@dataclass(frozen=True)
class Tool:
    name: str
    description: str
    parameters: dict[str, Any]
    effect: ToolEffect
    run: Callable[..., Awaitable[Any]]
    # Renders the proposal a person reads before approving a write.
    describe: Callable[[dict[str, Any]], str] | None = None

    def to_wire(self) -> dict[str, Any]:
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters,
            },
        }


def _object(properties: dict[str, Any], required: list[str]) -> dict[str, Any]:
    return {"type": "object", "properties": properties, "required": required}


def parse_date(value: Any, fallback: date | None = None) -> date:
    if isinstance(value, str) and value.strip():
        try:
            return date.fromisoformat(value.strip()[:10])
        except ValueError as error:
            raise ValueError(f"Не понимаю дату «{value}»") from error
    if fallback is not None:
        return fallback
    raise ValueError("Нужна дата")


def money(value: Any) -> str:
    try:
        return f"{float(value):,.0f}".replace(",", " ")
    except (TypeError, ValueError):
        return str(value)


def build_tools(context: "ToolContext") -> dict[str, Tool]:
    """Assemble the toolset bound to one operator's company."""

    tools = [
        Tool(
            name="availability",
            description=(
                "Какие квартиры свободны на даты и почём. Если гость назвал только дату заезда, "
                "считай, что он остаётся на одну ночь."
            ),
            parameters=_object(
                {
                    "check_in": _DATE,
                    "check_out": _DATE,
                    "guests": {"type": "integer", "description": "Сколько гостей, по умолчанию 2"},
                },
                ["check_in"],
            ),
            effect=ToolEffect.READ,
            run=context.availability,
        ),
        Tool(
            name="today",
            description="Заезды, выезды и кто сейчас проживает. Без аргументов — на сегодня.",
            parameters=_object({"day": _DATE}, []),
            effect=ToolEffect.READ,
            run=context.today,
        ),
        Tool(
            name="bookings",
            description=(
                "Найти брони: по имени гостя, по квартире или за период. "
                "Отсюда берётся id брони для продления, оплаты и уборки."
            ),
            parameters=_object(
                {
                    "search": {"type": "string", "description": "Имя гостя или телефон"},
                    "date_from": _DATE,
                    "date_to": _DATE,
                },
                [],
            ),
            effect=ToolEffect.READ,
            run=context.bookings,
        ),
        Tool(
            name="property_info",
            description=(
                "Справка по квартире: адрес, блок, этаж, номер, Wi-Fi и инструкции заезда. "
                "Ищет по названию или внутреннему имени вроде 62auc."
            ),
            parameters=_object({"query": {"type": "string"}}, ["query"]),
            effect=ToolEffect.READ,
            run=context.property_info,
        ),
        Tool(
            name="money",
            description="Сколько заработано за период и какая загрузка.",
            parameters=_object({"date_from": _DATE, "date_to": _DATE}, []),
            effect=ToolEffect.READ,
            run=context.money,
        ),
        Tool(
            name="create_booking",
            description=(
                "Забронировать свободную квартиру на гостя. Сначала проверь доступность, "
                "чтобы не предложить занятую."
            ),
            parameters=_object(
                {
                    "property_query": {"type": "string", "description": "Название или внутреннее имя квартиры"},
                    "guest_name": {"type": "string"},
                    "guest_phone": {"type": "string"},
                    "check_in": _DATE,
                    "check_out": _DATE,
                },
                ["property_query", "guest_name", "check_in"],
            ),
            effect=ToolEffect.WRITE,
            run=context.create_booking,
            describe=lambda args: (
                f"Забронировать {args.get('property_query')} на {args.get('guest_name')} "
                f"с {args.get('check_in')} по {args.get('check_out') or 'следующий день'}"
            ),
        ),
        Tool(
            name="extend_booking",
            description="Продлить бронь на несколько ночей. Занятость проверяется при сохранении.",
            parameters=_object(
                {
                    "booking_id": {"type": "string"},
                    "nights": {"type": "integer", "description": "Сколько ночей добавить, по умолчанию 1"},
                },
                ["booking_id"],
            ),
            effect=ToolEffect.WRITE,
            run=context.extend_booking,
            describe=lambda args: (
                f"Продлить бронь на {args.get('nights', 1)} ноч. (id {args.get('booking_id')})"
            ),
        ),
        Tool(
            name="record_payment",
            description="Записать полученную оплату по брони.",
            parameters=_object(
                {
                    "booking_id": {"type": "string"},
                    "amount": {"type": "number"},
                    "method": {"type": "string", "description": "cash, card или transfer"},
                },
                ["booking_id", "amount"],
            ),
            effect=ToolEffect.WRITE,
            run=context.record_payment,
            describe=lambda args: (
                f"Записать оплату {money(args.get('amount'))} ₸ по брони {args.get('booking_id')}"
            ),
        ),
        Tool(
            name="schedule_cleaning",
            description="Поставить уборку по квартире на дату и время.",
            parameters=_object(
                {
                    "property_query": {"type": "string"},
                    "day": _DATE,
                    "time": {"type": "string", "description": "ЧЧ:ММ, по умолчанию 12:00"},
                },
                ["property_query", "day"],
            ),
            effect=ToolEffect.WRITE,
            run=context.schedule_cleaning,
            describe=lambda args: (
                f"Поставить уборку в {args.get('property_query')} на {args.get('day')} "
                f"к {args.get('time') or '12:00'}"
            ),
        ),
    ]
    return {tool.name: tool for tool in tools}


class ToolContext:
    """Binds the toolset to one company's services.

    Each method returns plain data the model can read back to the operator —
    never an ORM object, never an internal exception.
    """

    def __init__(
        self,
        company_id: uuid.UUID,
        *,
        availability_service,
        booking_repo,
        guest_repo,
        property_repo,
        create_booking_service,
        update_booking_service,
        payment_service,
        cleaning_service,
        metrics_service,
        today: date | None = None,
    ) -> None:
        self._company_id = company_id
        self._availability = availability_service
        self._bookings = booking_repo
        self._guests = guest_repo
        self._properties = property_repo
        self._create_booking = create_booking_service
        self._update_booking = update_booking_service
        self._payments = payment_service
        self._cleaning = cleaning_service
        self._metrics = metrics_service
        self._today = today or date.today()

    # ---------- read ----------

    async def availability(self, check_in: str, check_out: str | None = None, guests: int = 2) -> Any:
        start = parse_date(check_in)
        end = parse_date(check_out, start + timedelta(days=1))
        found = await self._availability.execute(
            self._company_id, start, end, adults_count=max(1, guests), children_count=0
        )
        return {
            "check_in": start.isoformat(),
            "check_out": end.isoformat(),
            "free": [
                {
                    "property": item.property.name,
                    "internal_name": item.property.internal_name,
                    "price": float(item.total_price) if item.total_price is not None else None,
                    "no_price_reason": item.price_error,
                }
                for item in found
            ],
        }

    async def today(self, day: str | None = None) -> Any:
        when = parse_date(day, self._today)
        bookings = await self._bookings.list_by_company_date_range(
            self._company_id, when - timedelta(days=1), when + timedelta(days=1)
        )
        arrivals, departures, staying = [], [], []
        for booking in bookings:
            row = await self._describe_booking(booking)
            if booking.check_in.date() == when:
                arrivals.append(row)
            elif booking.check_out.date() == when:
                departures.append(row)
            elif booking.check_in.date() < when < booking.check_out.date():
                staying.append(row)
        return {"day": when.isoformat(), "arrivals": arrivals, "departures": departures, "in_house": staying}

    async def bookings(
        self, search: str | None = None, date_from: str | None = None, date_to: str | None = None
    ) -> Any:
        found = await self._bookings.list_by_company(
            self._company_id,
            limit=20,
            search=search,
            date_from=parse_date(date_from, self._today) if date_from else None,
            date_to=parse_date(date_to, self._today + timedelta(days=30)) if date_to else None,
        )
        return [await self._describe_booking(booking) for booking in found]

    async def property_info(self, query: str) -> Any:
        found = await self._find_property(query)
        if found is None:
            return {"error": f"Квартира «{query}» не найдена"}
        return {
            "name": found.name,
            "internal_name": found.internal_name,
            "address": found.address_full,
            "block": found.block,
            "floor": found.floor,
            "apartment": found.apartment_number,
            "wifi_name": found.wifi_name,
            "wifi_password": found.wifi_password,
            "check_in_instructions": found.check_in_instructions,
        }

    async def money(self, date_from: str | None = None, date_to: str | None = None) -> Any:
        start = parse_date(date_from, self._today.replace(day=1))
        end = parse_date(date_to, self._today)
        # Metrics are computed over a half-open range, so a single day has to be
        # asked for as two. On the first of the month "сколько за этот месяц"
        # otherwise collapses to an empty range and the tool errors.
        if end <= start:
            end = start + timedelta(days=1)
        summary = await self._metrics.execute(self._company_id, start, end)
        return {"from": start.isoformat(), "to": end.isoformat(), "summary": summary}

    # ---------- write ----------

    async def create_booking(
        self,
        property_query: str,
        guest_name: str,
        check_in: str,
        check_out: str | None = None,
        guest_phone: str = "",
    ) -> Any:
        found = await self._find_property(property_query)
        if found is None:
            raise ValueError(f"Квартира «{property_query}» не найдена")
        start = parse_date(check_in)
        end = parse_date(check_out, start + timedelta(days=1))
        booking = await self._create_booking(
            company_id=self._company_id,
            property_id=found.id,
            guest_name=guest_name,
            guest_phone=guest_phone,
            check_in=start,
            check_out=end,
        )
        return await self._describe_booking(booking)

    async def extend_booking(self, booking_id: str, nights: int = 1) -> Any:
        booking = await self._own_booking(booking_id)
        moved = await self._update_booking(
            booking_id=booking.id,
            company_id=self._company_id,
            check_out=booking.check_out + timedelta(days=max(1, nights)),
        )
        return await self._describe_booking(moved)

    async def record_payment(self, booking_id: str, amount: float, method: str = "transfer") -> Any:
        # The HTTP schema refuses anything but a positive amount; a tool that
        # reaches the service directly has to say so itself, or the assistant
        # becomes the one way to write a payment that makes a debt grow.
        try:
            value = float(amount)
        except (TypeError, ValueError) as error:
            raise ValueError(f"Не понимаю сумму «{amount}»") from error
        if value <= 0:
            raise ValueError("Сумма оплаты должна быть больше нуля")

        booking = await self._own_booking(booking_id)
        payment = await self._payments(
            booking_id=booking.id, company_id=self._company_id, amount=value, method=method
        )
        return {"booking_id": str(booking.id), "amount": float(payment.amount)}

    async def schedule_cleaning(self, property_query: str, day: str, time: str = "12:00") -> Any:
        found = await self._find_property(property_query)
        if found is None:
            raise ValueError(f"Квартира «{property_query}» не найдена")
        task = await self._cleaning(
            company_id=self._company_id,
            property_id=found.id,
            scheduled_date=parse_date(day),
            scheduled_time=time,
        )
        return {"task_id": str(task.id), "property": found.name, "day": day, "time": time}

    # ---------- helpers ----------

    async def _find_property(self, query: str):
        wanted = (query or "").strip().casefold()
        if not wanted:
            return None
        properties = await self._properties.list_by_company(self._company_id, limit=200)
        # Exact internal name first: an operator saying "62auc" means that flat
        # and nothing else.
        for prop in properties:
            if prop.internal_name.casefold() == wanted:
                return prop
        for prop in properties:
            if wanted in prop.name.casefold() or wanted in prop.internal_name.casefold():
                return prop
        return None

    async def _own_booking(self, booking_id: str):
        try:
            identifier = uuid.UUID(str(booking_id))
        except ValueError as error:
            raise ValueError(f"Некорректный id брони: {booking_id}") from error
        booking = await self._bookings.get_by_id(identifier)
        if booking is None or booking.company_id != self._company_id:
            raise ValueError("Бронь не найдена")
        return booking

    async def _describe_booking(self, booking) -> dict[str, Any]:
        guest = await self._guests.get_by_id(booking.guest_id)
        prop = await self._properties.get_by_id(booking.property_id)
        return {
            "id": str(booking.id),
            "guest": guest.name if guest else "",
            "phone": guest.phone if guest else "",
            "property": prop.name if prop else "",
            "internal_name": prop.internal_name if prop else "",
            "check_in": _day(booking.check_in),
            "check_out": _day(booking.check_out),
            "status": booking.status.value,
            "total_price": float(booking.total_price),
        }


def _day(value: datetime | date | None) -> str:
    if value is None:
        return ""
    return value.date().isoformat() if isinstance(value, datetime) else value.isoformat()
