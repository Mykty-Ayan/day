"""What to ask for a night, given how wanted it is and how late it is.

The danger this code carries is one-directional. Dropping the price always
fills the flat, so a bug that drops too far never announces itself as a bug —
it shows up as a busy month that lost money. Most of these tests are therefore
about the bottom: what the floor is, that it is absolute, and that nothing
sneaks under it.
"""

from __future__ import annotations

from decimal import Decimal

import pytest

from app.application.pricing.suggest import suggest_price
from app.domain.pricing.value_objects import CompetitorRates, Demand, Economics, PriceReason

RACK = Decimal(20000)


def economics(marginal=5000, revpar=None, hard_floor=None) -> Economics:
    return Economics(
        marginal_cost=Decimal(marginal),
        revpar=Decimal(revpar) if revpar is not None else None,
        hard_floor=Decimal(hard_floor) if hard_floor is not None else None,
    )


def reasons(suggestion) -> list[PriceReason]:
    return [step.reason for step in suggestion.steps]


class TestTheFloor:
    def test_the_floor_is_what_the_night_costs_to_sell(self):
        # Cleaner, laundry, consumables — the money that leaves because a guest
        # came. Below it an empty flat is strictly better.
        assert economics(marginal=5000).floor == Decimal(5000)

    def test_a_hard_floor_set_by_the_operator_wins_when_higher(self):
        assert economics(marginal=5000, hard_floor=9000).floor == Decimal(9000)

    def test_the_marginal_cost_wins_when_it_is_higher(self):
        assert economics(marginal=12000, hard_floor=9000).floor == Decimal(12000)

    def test_nothing_is_ever_suggested_below_it(self):
        # Every signal pushed down at once: empty portfolio, tonight, midnight —
        # against a flat whose cleaning alone costs most of the rack rate.
        suggestion = suggest_price(
            RACK,
            economics(marginal=15000),
            Demand(occupancy=0.0, days_ahead=0, hour=23),
        )

        assert suggestion.suggested == Decimal(15000)
        assert PriceReason.FLOOR in reasons(suggestion)
        assert suggestion.at_floor

    def test_a_cheap_flat_is_not_dragged_up_to_a_floor_it_clears(self):
        # The floor only ever raises a price that fell under it; it is not a
        # target to aim at.
        suggestion = suggest_price(
            RACK,
            economics(marginal=9000),
            Demand(occupancy=0.0, days_ahead=0, hour=23),
        )

        assert suggestion.suggested > Decimal(9000)
        assert PriceReason.FLOOR not in reasons(suggestion)

    def test_the_uplift_cap_cannot_push_a_price_under_the_floor(self):
        # The cap on the way up ran after the clamp on the way down, so a flat
        # whose cleaning costs more than 1.3× its rack rate came back priced
        # under its own floor — while the steps still said it had been raised to
        # it. An explanation that contradicts the number is worse than either
        # mistake alone.
        suggestion = suggest_price(
            RACK,
            economics(marginal=30000),
            Demand(occupancy=0.5, days_ahead=5),
        )

        assert suggestion.suggested >= suggestion.floor
        assert suggestion.suggested == Decimal(30000)

    def test_rent_to_the_owner_is_not_part_of_the_floor(self):
        # It is paid whether anyone sleeps there or not, so it cannot argue
        # against selling tonight cheaply. It argues about keeping the flat,
        # which is a different decision on a different screen.
        assert "rent" not in Economics.__dataclass_fields__


class TestLateAtNight:
    def test_after_ten_the_target_becomes_revpar(self):
        # RevPAR already contains the empty nights, so selling at it makes
        # tonight as good as an average night — and better than the nothing it
        # is heading for.
        suggestion = suggest_price(
            RACK,
            economics(marginal=5000, revpar=11000),
            Demand(occupancy=0.5, days_ahead=0, hour=23),
        )

        assert suggestion.suggested == Decimal(11000)
        assert PriceReason.TONIGHT in reasons(suggestion)

    def test_it_never_goes_under_the_floor_to_reach_revpar(self):
        suggestion = suggest_price(
            RACK,
            economics(marginal=13000, revpar=8000),
            Demand(occupancy=0.5, days_ahead=0, hour=23),
        )

        assert suggestion.suggested >= Decimal(13000)

    def test_it_does_not_raise_a_price_that_is_already_below_revpar(self):
        # Reaching "up" to RevPAR at midnight would be asking more of the last
        # guest of the night than of the first.
        suggestion = suggest_price(
            Decimal(9000),
            economics(marginal=3000, revpar=15000),
            Demand(occupancy=0.5, days_ahead=0, hour=23),
        )

        assert suggestion.suggested <= Decimal(9000)

    def test_without_history_it_cuts_rather_than_inventing_a_target(self):
        suggestion = suggest_price(
            RACK,
            economics(marginal=3000, revpar=None),
            Demand(occupancy=0.5, days_ahead=0, hour=23),
        )

        assert Decimal(3000) < suggestion.suggested < RACK

    def test_the_evening_cut_is_gentler_than_the_night_one(self):
        evening = suggest_price(RACK, economics(revpar=11000), Demand(days_ahead=0, hour=20))
        night = suggest_price(RACK, economics(revpar=11000), Demand(days_ahead=0, hour=23))

        assert evening.suggested > night.suggested

    def test_daytime_today_is_not_a_fire_sale(self):
        noon = suggest_price(RACK, economics(revpar=11000), Demand(days_ahead=0, hour=12))

        assert noon.suggested > Decimal(15000)
        assert PriceReason.TONIGHT not in reasons(noon)


class TestDemand:
    def test_a_full_portfolio_raises_the_price(self):
        suggestion = suggest_price(RACK, economics(), Demand(occupancy=0.9, days_ahead=5))

        assert suggestion.suggested > RACK
        assert PriceReason.HIGH_OCCUPANCY in reasons(suggestion)

    def test_an_empty_portfolio_lowers_it(self):
        suggestion = suggest_price(RACK, economics(), Demand(occupancy=0.1, days_ahead=5))

        assert suggestion.suggested < RACK
        assert PriceReason.LOW_OCCUPANCY in reasons(suggestion)

    def test_an_ordinary_date_is_left_alone(self):
        suggestion = suggest_price(RACK, economics(), Demand(occupancy=0.5, days_ahead=5))

        assert suggestion.suggested == RACK
        assert suggestion.steps == ()

    def test_colleagues_hunting_for_the_date_count_as_demand(self):
        # Requests in the groups arrive before our own bookings for that night
        # do — it is the earliest signal available.
        quiet = suggest_price(RACK, economics(), Demand(occupancy=0.5, days_ahead=5))
        busy = suggest_price(RACK, economics(), Demand(occupancy=0.5, days_ahead=5, open_leads=4))

        assert busy.suggested > quiet.suggested
        assert PriceReason.LEAD_PRESSURE in reasons(busy)

    def test_one_stray_request_is_not_a_trend(self):
        suggestion = suggest_price(RACK, economics(), Demand(occupancy=0.5, days_ahead=5, open_leads=1))

        assert PriceReason.LEAD_PRESSURE not in reasons(suggestion)

    def test_the_uplift_is_capped(self):
        # Every upward signal at once. A suggestion at double the rack rate is a
        # bug in the signals, not an opportunity.
        suggestion = suggest_price(
            RACK,
            economics(),
            Demand(occupancy=1.0, days_ahead=5, open_leads=10),
        )

        assert suggestion.suggested <= RACK * Decimal("1.3")


class TestCompetitors:
    def test_unknown_is_not_read_as_competitive(self):
        # There is no automatic source for neighbours' prices. Silence has to
        # mean silence, or the first missing import quietly reprices everything.
        suggestion = suggest_price(RACK, economics(), Demand(occupancy=0.5, days_ahead=5), None)

        assert PriceReason.COMPETITORS not in reasons(suggestion)

    @pytest.mark.parametrize(
        "rates",
        [
            CompetitorRates(median=Decimal(12000), sample_size=1, days_old=0),
            CompetitorRates(median=Decimal(12000), sample_size=5, days_old=30),
            CompetitorRates(median=None, sample_size=9, days_old=0),
        ],
    )
    def test_a_thin_or_stale_observation_is_ignored(self, rates):
        suggestion = suggest_price(RACK, economics(), Demand(occupancy=0.5, days_ahead=5), rates)

        assert PriceReason.COMPETITORS not in reasons(suggestion)

    def test_it_moves_halfway_toward_the_neighbours_not_all_the_way(self):
        # One observation of an asking price is not evidence anyone is filling
        # at it. Half a step keeps us in the conversation without following an
        # empty flat down.
        rates = CompetitorRates(median=Decimal(12000), sample_size=6, days_old=1)

        suggestion = suggest_price(RACK, economics(), Demand(occupancy=0.5, days_ahead=5), rates)

        assert Decimal(12000) < suggestion.suggested < RACK

    def test_dearer_neighbours_pull_the_price_up(self):
        rates = CompetitorRates(median=Decimal(30000), sample_size=6, days_old=1)

        suggestion = suggest_price(RACK, economics(), Demand(occupancy=0.5, days_ahead=5), rates)

        assert suggestion.suggested > RACK

    def test_a_small_difference_is_left_alone(self):
        rates = CompetitorRates(median=Decimal(19000), sample_size=6, days_old=1)

        suggestion = suggest_price(RACK, economics(), Demand(occupancy=0.5, days_ahead=5), rates)

        assert PriceReason.COMPETITORS not in reasons(suggestion)


class TestTheAnswerIsReadable:
    def test_prices_come_out_in_the_shape_people_say_them(self):
        # These are read aloud and typed into WhatsApp. 19 847 ₸ is not a price
        # anyone quotes.
        suggestion = suggest_price(
            Decimal(23300), economics(), Demand(occupancy=0.2, days_ahead=3)
        )

        assert suggestion.suggested % Decimal(500) == 0

    def test_every_step_carries_its_reason(self):
        # An operator has to be able to disagree. A number without an argument
        # is either obeyed blindly or ignored, and both are worse.
        suggestion = suggest_price(
            RACK,
            economics(marginal=5000, revpar=11000),
            Demand(occupancy=0.1, days_ahead=0, hour=23),
        )

        assert all(step.note for step in suggestion.steps)
        assert len(suggestion.steps) >= 3

    def test_the_discount_is_reported_against_the_rack_rate(self):
        suggestion = suggest_price(
            RACK, economics(marginal=5000, revpar=10000), Demand(days_ahead=0, hour=23)
        )

        assert suggestion.discount_percent == Decimal(50)

    def test_a_free_rack_rate_does_not_divide_by_zero(self):
        suggestion = suggest_price(Decimal(0), economics(marginal=0), Demand())

        assert suggestion.discount_percent == Decimal(0)
