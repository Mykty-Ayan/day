"""What a night is worth right now, and what it must not be sold below.

A flat that stays empty tonight earns nothing, and tonight cannot be resold
tomorrow. That asymmetry is the whole argument for dropping the price as the
evening wears on — and also the trap: an operator who drops far enough will
always fill the flat, and can do that all month while losing money.

So two numbers bound every suggestion. The floor is what the night costs to
sell — cleaning, utilities, the consumables that go out of the door with the
guest. Below it, an empty flat is strictly better. The reference is RevPAR: the
revenue the flat earns per available night over a trailing period, empty nights
included. Late at night a price near RevPAR is a good sale; well under it, night
after night, is a business quietly shrinking.
"""

from __future__ import annotations

import enum
from dataclasses import dataclass, field
from decimal import Decimal


class PriceReason(str, enum.Enum):
    """Why the suggestion differs from the rack rate.

    Every step is named because an operator has to be able to disagree with it.
    A number that arrives without a reason gets either obeyed blindly or
    ignored entirely, and both are worse than an argument they can check.
    """

    RACK = "rack"
    #: Most of our own flats are taken for that date — the market is tight.
    HIGH_OCCUPANCY = "high_occupancy"
    #: Ours are mostly empty for that date.
    LOW_OCCUPANCY = "low_occupancy"
    #: Colleagues are asking for that date in the groups.
    LEAD_PRESSURE = "lead_pressure"
    #: The date is close and the flat is still empty.
    LAST_MINUTE = "last_minute"
    #: It is tonight, and it is late.
    TONIGHT = "tonight"
    #: Competitors nearby are cheaper or dearer.
    COMPETITORS = "competitors"
    #: The result was raised to the floor.
    FLOOR = "floor"


@dataclass(frozen=True)
class Economics:
    """What one night costs us, and what it usually earns.

    `marginal_cost` is the money that leaves the account because a guest came:
    the cleaner, the laundry, the consumables, the utilities the stay adds. Rent
    to the flat's owner is not in it — that is paid whether anyone sleeps there
    or not, so it cannot argue against selling a night cheaply. It argues about
    whether to keep the flat at all, which is a different decision.
    """

    marginal_cost: Decimal = Decimal("0")
    #: Revenue per available night over a trailing window, empty nights
    #: included. None when there is not enough history to mean anything.
    revpar: Decimal | None = None
    #: Never sell under this even if the arithmetic says to.
    hard_floor: Decimal | None = None

    @property
    def floor(self) -> Decimal:
        """The lowest defensible price for a night."""
        candidates = [self.marginal_cost]
        if self.hard_floor is not None:
            candidates.append(self.hard_floor)
        return max(candidates)


@dataclass(frozen=True)
class CompetitorRates:
    """What comparable flats nearby are asking.

    There is no automatic source for this: Krisha does not publish an API,
    Booking sits behind a WAF, and a channel manager reports our own rates, not
    the neighbours'. So these arrive from whoever last looked — an operator
    typing what they saw, or an import written later. Absent means "unknown",
    and unknown must never be read as "we are competitive".
    """

    median: Decimal | None = None
    sample_size: int = 0
    #: How stale the observation is. Nobody should price tonight off a number
    #: someone wrote down three weeks ago.
    days_old: int = 0

    @property
    def is_usable(self) -> bool:
        return self.median is not None and self.sample_size >= 3 and self.days_old <= 7


@dataclass(frozen=True)
class Demand:
    """What we can see about how wanted this date is."""

    #: Share of our own flats already taken for that night, 0 to 1.
    occupancy: float = 0.0
    #: Nights between now and check-in. 0 is tonight.
    days_ahead: int = 0
    #: Local hour, 0-23. Only consulted when days_ahead is 0.
    hour: int = 12
    #: Open requests from the colleagues' groups for that date.
    open_leads: int = 0


@dataclass(frozen=True)
class PriceStep:
    reason: PriceReason
    #: Multiplier applied at this step, e.g. 0.85 for a 15 % cut.
    factor: Decimal
    price_after: Decimal
    note: str = ""


@dataclass(frozen=True)
class PriceSuggestion:
    """A price, and the argument for it."""

    rack: Decimal
    suggested: Decimal
    floor: Decimal
    steps: tuple[PriceStep, ...] = field(default_factory=tuple)

    @property
    def at_floor(self) -> bool:
        return self.suggested <= self.floor

    @property
    def discount_percent(self) -> Decimal:
        if self.rack <= 0:
            return Decimal("0")
        return ((self.rack - self.suggested) / self.rack * 100).quantize(Decimal("1"))
