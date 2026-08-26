"""Turning a rack rate into what to actually ask tonight.

The steps are multiplicative and ordered from the slowest-moving signal to the
fastest: how full we are for that date, then whether colleagues are hunting for
it, then how close it is, then — only for tonight — what time it is, and finally
the neighbours if anyone has looked recently. The result is clamped to the
floor, which is the one step that cannot be argued away.

Nothing here writes a price anywhere. It suggests, with its reasoning attached,
and a person decides — the same rule the assistant follows for anything that
touches money.
"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

from app.domain.pricing.value_objects import (
    CompetitorRates,
    Demand,
    Economics,
    PriceReason,
    PriceStep,
    PriceSuggestion,
)

#: Prices are said out loud and written in messages: "20 000", not "19 847".
_ROUNDING = Decimal("500")

#: Above this share of our flats taken, the date is tight enough to ask more.
_TIGHT = 0.75
#: Below this, we are the ones competing for the guest.
_SLACK = 0.35

#: Evening thresholds for a flat still empty tonight. After the second one the
#: night is nearly gone: anything above the floor beats nothing.
_EVENING = 19
_LATE = 22

_MAX_UPLIFT = Decimal("1.30")


def suggest_price(
    rack: Decimal,
    economics: Economics,
    demand: Demand,
    competitors: CompetitorRates | None = None,
) -> PriceSuggestion:
    steps: list[PriceStep] = []
    price = rack

    def apply(reason: PriceReason, factor: Decimal, note: str = "") -> None:
        nonlocal price
        price = _round(price * factor)
        steps.append(PriceStep(reason=reason, price_after=price, factor=factor, note=note))

    if demand.occupancy >= _TIGHT:
        apply(PriceReason.HIGH_OCCUPANCY, Decimal("1.15"), f"занято {demand.occupancy:.0%}")
    elif demand.occupancy <= _SLACK:
        apply(PriceReason.LOW_OCCUPANCY, Decimal("0.95"), f"занято {demand.occupancy:.0%}")

    if demand.open_leads >= 3:
        # Colleagues asking for the same night in the groups is the earliest
        # demand signal we get — earlier than our own bookings for it.
        apply(PriceReason.LEAD_PRESSURE, Decimal("1.10"), f"заявок в чатах: {demand.open_leads}")

    if demand.days_ahead == 0:
        apply(PriceReason.LAST_MINUTE, Decimal("0.90"), "заезд сегодня")
        if demand.hour >= _LATE:
            price = _toward_revpar(price, economics)
            steps.append(
                PriceStep(
                    reason=PriceReason.TONIGHT,
                    price_after=price,
                    note=f"{demand.hour}:00, ночь почти ушла",
                )
            )
        elif demand.hour >= _EVENING:
            apply(PriceReason.TONIGHT, Decimal("0.85"), f"{demand.hour}:00, вечер")
    elif demand.days_ahead == 1:
        apply(PriceReason.LAST_MINUTE, Decimal("0.95"), "заезд завтра")

    if competitors is not None and competitors.is_usable and competitors.median:
        factor = _competitor_factor(price, competitors.median)
        if factor != Decimal("1"):
            apply(
                PriceReason.COMPETITORS,
                factor,
                f"рядом медиана {competitors.median:.0f} ₸ по {competitors.sample_size} объектам",
            )

    # A suggestion well above the rack rate is a bug in the signals, not an
    # opportunity. There is no matching cap on the way down: an empty night
    # really is worth nothing, and the floor below is what stops the fall.
    ceiling = _round(rack * _MAX_UPLIFT)
    price = min(price, ceiling)

    # The floor is last and absolute. Everything above argued about how much a
    # night is worth; this says what it costs us to sell one. It runs after the
    # cap deliberately: a flat whose cleaning costs more than the cap allows is
    # a flat that cannot be sold at its rack rate, and the operator has to see
    # that number rather than one the cap quietly pushed back under the floor.
    floor = economics.floor
    if price < floor:
        price = _round(floor)
        steps.append(
            PriceStep(
                reason=PriceReason.FLOOR,
                price_after=price,
                note="ниже себестоимости ночи",
            )
        )

    return PriceSuggestion(rack=rack, suggested=price, floor=floor, steps=tuple(steps))


def _toward_revpar(price: Decimal, economics: Economics) -> Decimal:
    """Late at night, aim at what the flat earns on an average night.

    RevPAR already contains the empty nights, so it is the honest break-even for
    "sell it or lose it": at that price this night is as good as the average one
    and better than the nothing it is heading for. Without history to compute
    it, fall back to a plain cut rather than inventing a target.
    """
    if economics.revpar is None:
        return _round(price * Decimal("0.75"))
    return _round(min(price, max(economics.revpar, economics.floor)))


def _competitor_factor(price: Decimal, median: Decimal) -> Decimal:
    """Nudge toward the neighbours, never jump to them.

    A single observation of someone else's asking price is not evidence they are
    filling at it. Half a step keeps us in the same conversation without
    following an empty flat down.
    """
    if price <= 0 or median <= 0:
        return Decimal("1")
    ratio = median / price
    if Decimal("0.9") <= ratio <= Decimal("1.1"):
        return Decimal("1")
    return (Decimal("1") + ratio) / 2


def _round(value: Decimal) -> Decimal:
    if value <= 0:
        return Decimal("0")
    return (value / _ROUNDING).quantize(Decimal("1"), rounding=ROUND_HALF_UP) * _ROUNDING
