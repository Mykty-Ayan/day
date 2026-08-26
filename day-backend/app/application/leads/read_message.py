"""Reading a colleagues' group message into something the product can act on.

The prompt does the classification and the extraction in one call: two calls
would double the cost of a group that is mostly chatter, and the two decisions
lean on the same reading anyway.

Everything the model returns is treated as a suggestion until it survives
`_coerce` below. A model that invents a date, a room count of forty, or a
budget of "договоримся" must not put that into the operator's screen.
"""

from __future__ import annotations

import json
import logging
import re
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation

from app.domain.assistant.gateway import AssistantGateway, ChatMessage
from app.domain.leads.value_objects import DateRange, MessageKind, ParsedMessage, RoomCount

logger = logging.getLogger(__name__)

PROMPT = """Ты разбираешь сообщения из рабочих чатов субарендаторов Алматы.
Сегодня {today}.

Верни ровно один JSON-объект, без пояснений и без markdown.

Поле kind — одно из:
  request   — ищут квартиру для гостя (обычно с процентом тому, кто найдёт)
  offer     — предлагают свою свободную квартиру коллегам
  blacklist — номер телефона гостя с предупреждением: испортил квартиру, шумел
  closing   — закрывают ранее поданную заявку: «достаточно», «гость выбрал», «стоп»
  cleaning  — заявка на уборку: адрес, комнаты, время, цена
  noise     — всё остальное: приветствия, реклама, объявления, разговоры

Для kind=request заполни, что названо, остальное оставь пустым:
  district  — район, ЖК или улица, строкой как написано
  guests    — сколько человек, число
  rooms_min, rooms_max — комнатность; «2 ком» это 2 и 2, «3-4» это 3 и 4
  check_in  — дата заезда YYYY-MM-DD; «сегодня» и «завтра» считай от сегодняшней даты
  nights    — сколько ночей; «на сутки» это 1, «с 6 по 8» это 2
  budget    — бюджет за ночь в тенге, числом; «20 к» это 20000, «25-30 с%» это 25000
  commission — true, если упомянут процент: «с %», «бюджет ваш с %»

Для kind=blacklist заполни phone (в виде +7XXXXXXXXXX) и note — чем гость плох.
Для остальных kind заполни только kind.

Чего в сообщении нет — не придумывай."""

_MAX_ROOMS = 10
_MAX_GUESTS = 30
_MAX_NIGHTS = 365
_MAX_BUDGET = Decimal("10000000")
_PHONE = re.compile(r"\+?7\d{10}$")


class ReadGroupMessageService:
    def __init__(self, gateway: AssistantGateway) -> None:
        self._gateway = gateway

    async def execute(self, text: str, today: date | None = None) -> ParsedMessage:
        if not text.strip():
            return ParsedMessage(kind=MessageKind.NOISE)

        today = today or date.today()
        response = await self._gateway.complete(
            [
                ChatMessage(role="system", content=PROMPT.format(today=today.isoformat())),
                ChatMessage(role="user", content=text),
            ],
            tools=[],
        )
        return _coerce(response.text, today)


def _coerce(raw: str, today: date) -> ParsedMessage:
    """Turn whatever the model said into a ParsedMessage, or into NOISE.

    A message we failed to read is noise, not an error: one unreadable line in a
    busy group must not stop the rest of the batch.
    """
    payload = _load_json(raw)
    if payload is None:
        return ParsedMessage(kind=MessageKind.NOISE)

    try:
        kind = MessageKind(str(payload.get("kind", "")).strip().lower())
    except ValueError:
        logger.info("Unknown message kind %r", payload.get("kind"))
        return ParsedMessage(kind=MessageKind.NOISE)

    if kind is MessageKind.BLACKLIST:
        phone = _phone(payload.get("phone"))
        # A blacklist entry without a number warns nobody and matches nothing.
        if not phone:
            return ParsedMessage(kind=MessageKind.NOISE)
        return ParsedMessage(kind=kind, phone=phone, note=_text(payload.get("note")))

    if kind is not MessageKind.REQUEST:
        return ParsedMessage(kind=kind)

    return ParsedMessage(
        kind=kind,
        district=_text(payload.get("district")),
        guests=_bounded_int(payload.get("guests"), 1, _MAX_GUESTS),
        rooms=_rooms(payload),
        dates=_dates(payload, today),
        budget=_budget(payload.get("budget")),
        commission=bool(payload.get("commission")),
    )


def _load_json(raw: str) -> dict | None:
    text = (raw or "").strip()
    if text.startswith("```"):
        # Models fence JSON even when told not to; unwrapping is cheaper than
        # arguing with them in the prompt.
        text = re.sub(r"^```[a-z]*\s*|\s*```$", "", text, flags=re.I | re.S).strip()
    try:
        payload = json.loads(text)
    except (json.JSONDecodeError, TypeError):
        logger.info("Model returned no usable JSON: %r", text[:120])
        return None
    return payload if isinstance(payload, dict) else None


def _text(value: object) -> str:
    return str(value).strip() if isinstance(value, (str, int)) and str(value).strip() else ""


def _bounded_int(value: object, low: int, high: int) -> int | None:
    try:
        number = int(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    return number if low <= number <= high else None


def _rooms(payload: dict) -> RoomCount:
    low = _bounded_int(payload.get("rooms_min"), 1, _MAX_ROOMS)
    high = _bounded_int(payload.get("rooms_max"), 1, _MAX_ROOMS)
    if low is not None and high is not None and low > high:
        low, high = high, low
    return RoomCount(minimum=low, maximum=high)


def _dates(payload: dict, today: date) -> DateRange:
    check_in = _date(payload.get("check_in"))
    # A stay that started last month is a message we read too late, not a lead.
    if check_in is not None and check_in < today - timedelta(days=1):
        check_in = None
    return DateRange(check_in=check_in, nights=_bounded_int(payload.get("nights"), 1, _MAX_NIGHTS))


def _date(value: object) -> date | None:
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        return datetime.strptime(value.strip(), "%Y-%m-%d").date()
    except ValueError:
        return None


def _budget(value: object) -> Decimal | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        amount = Decimal(str(value).replace(" ", "").replace(",", "."))
    except (InvalidOperation, ValueError):
        return None
    return amount if Decimal(0) < amount <= _MAX_BUDGET else None


def _phone(value: object) -> str:
    digits = re.sub(r"\D", "", str(value or ""))
    if len(digits) == 11 and digits.startswith("8"):
        digits = "7" + digits[1:]
    candidate = f"+{digits}"
    return candidate if _PHONE.match(candidate) else ""
