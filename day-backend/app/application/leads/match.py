"""Which of our flats answer a colleague's request, and what to write back.

A lead in these groups lives minutes — the export has "Первому отдала" and
"Достаточно спасибо выбирают больше не отправляйте" — so the operator needs the
answer already written, not a screen to go and assemble one on.

Nothing here sends anything. It returns a draft; a person presses send. The
groups themselves make that the only safe arrangement: they are moderated
("не по теме не писать, удалю"), and an unattended account posting into them
loses the account and the source of leads with it.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from app.application.booking.check_availability import AvailableProperty
from app.domain.leads.value_objects import MessageKind, ParsedMessage


@dataclass(frozen=True)
class Match:
    """One of our flats against one request."""

    available: AvailableProperty
    #: Per night, so it can be compared with the budget the colleague named.
    price_per_night: Decimal | None
    within_budget: bool

    @property
    def property_id(self):
        return self.available.property.id


@dataclass(frozen=True)
class LeadMatches:
    request: ParsedMessage
    matches: tuple[Match, ...] = ()

    @property
    def has_answer(self) -> bool:
        return bool(self.matches)


def match_request(
    request: ParsedMessage,
    available: list[AvailableProperty],
    nights: int | None = None,
) -> LeadMatches:
    """Rank our free flats against what the colleague asked for.

    Room count is the only hard filter. District is deliberately not one: people
    write "Абая Гагарина Жарокова" and "возле гостиницы Казахстан", and matching
    that against a stored address by string would throw away flats that do fit.
    A person reads the district in a second; a wrong automatic filter is
    invisible.

    Budget does not filter either. A colleague who wrote 20 000 still takes a
    22 000 flat when nothing else is free — but the operator has to see which is
    which, so it is carried as a flag.
    """
    if request.kind is not MessageKind.REQUEST:
        return LeadMatches(request=request)

    nights = nights or request.dates.nights
    fitting: list[Match] = []
    for item in available:
        rooms = item.property.rooms
        if rooms is not None and not request.rooms.matches(rooms):
            continue
        per_night = _per_night(item.total_price, nights)
        fitting.append(
            Match(
                available=item,
                price_per_night=per_night,
                within_budget=_within(per_night, request.budget),
            )
        )

    # Inside budget first, then cheaper first. A flat we cannot price sorts last
    # rather than disappearing: it is still free, and the operator may know its
    # price by heart.
    fitting.sort(
        key=lambda m: (
            not m.within_budget,
            m.price_per_night if m.price_per_night is not None else Decimal("Infinity"),
        )
    )
    return LeadMatches(request=request, matches=tuple(fitting))


def _per_night(total: Decimal | None, nights: int | None) -> Decimal | None:
    if total is None:
        return None
    if not nights or nights < 1:
        return total
    return (total / nights).quantize(Decimal("1"))


def _within(per_night: Decimal | None, budget: Decimal | None) -> bool:
    if budget is None:
        # Half the requests name no budget at all. Calling those "over budget"
        # would bury every one of them at the bottom of the list.
        return True
    if per_night is None:
        return False
    return per_night <= budget


#: Colleagues write to each other in fragments — "Есть свободная квартира",
#: "Цена 20 000к". A polite paragraph reads like an agency and gets skipped, so
#: the draft matches the register of the room.
_MAX_OFFERED = 3


def build_reply(result: LeadMatches) -> str:
    """The message an operator sends the colleague, ready to press send on.

    Empty when there is nothing to offer: a draft saying "ничего нет" would be
    sent by accident and is worth less than silence.
    """
    if not result.has_answer:
        return ""

    lines = ["Здравствуйте! По вашей заявке свободно:"]
    for match in result.matches[:_MAX_OFFERED]:
        lines.append(_describe(match))

    if result.request.commission:
        # They offered a cut; saying it is accepted saves a round trip.
        lines.append("")
        lines.append("Процент ваш.")
    return "\n".join(lines)


def _describe(match: Match) -> str:
    prop = match.available.property
    parts = [prop.name or prop.address_full or "квартира"]
    if prop.rooms:
        parts.append(f"{prop.rooms}-комн")
    if prop.block:
        parts.append(f"блок {prop.block}")
    head = ", ".join(parts)
    if match.price_per_night is None:
        return f"— {head}, цену уточню"
    # Thousands are separated by a space, the way money is written here. The
    # substitution has to stay on the number: run over the whole line it eats
    # the commas between the address parts too.
    price = f"{match.price_per_night:,.0f}".replace(",", " ")
    return f"— {head} — {price} ₸/ночь"
