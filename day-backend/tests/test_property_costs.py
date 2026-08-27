"""What a flat costs its subletter.

The split between fixed and marginal is the point of this entity, and getting
it wrong is expensive in both directions: put rent into the marginal cost and
the flat never sells a cheap night it should have; leave cleaning out of it and
it sells nights that lose money.
"""

from __future__ import annotations

from decimal import Decimal

import pytest

from app.domain.property.entities import PropertyCosts


def costs(rent=300000, utilities=15000, cleaning=4000, consumables=500) -> PropertyCosts:
    return PropertyCosts(
        monthly_rent=Decimal(rent),
        monthly_utilities=Decimal(utilities),
        cleaning_cost=Decimal(cleaning),
        consumables_per_night=Decimal(consumables),
    )


class TestMarginalCost:
    def test_one_night_costs_a_cleaning_and_a_night_of_consumables(self):
        assert costs().marginal_cost(1) == Decimal(4500)

    def test_the_cleaner_is_paid_once_however_long_the_guest_stays(self):
        # This is why a long stay can be sold cheaper per night without losing
        # money: the same cleaning spreads over more nights.
        assert costs().marginal_cost(4) == Decimal(6000)
        assert costs().marginal_cost(4) / 4 < costs().marginal_cost(1)

    @pytest.mark.parametrize("nights", [0, -3])
    def test_a_stay_of_no_nights_still_costs_one(self, nights):
        # An hourly booking is shorter than a night and still turns the flat
        # over. Charging it nothing would put the floor under the cleaner.
        assert costs().marginal_cost(nights) == costs().marginal_cost(1)

    def test_rent_is_not_in_it(self):
        # Rent is paid whether anyone sleeps there or not, so it cannot argue
        # against selling tonight cheaply.
        with_rent = costs(rent=300000)
        without_rent = costs(rent=0)

        assert with_rent.marginal_cost(1) == without_rent.marginal_cost(1)


class TestFixedCost:
    def test_a_month_of_calendar_costs_about_a_month_of_rent(self):
        month = costs().fixed_cost(30)

        assert Decimal(305000) < month < Decimal(325000)

    def test_a_year_of_periods_adds_up_to_a_year_of_rent(self):
        # Prorating by 30 would bill 12.17 months a year — a whole extra month
        # of rent appearing as a loss nobody made.
        year = costs().fixed_cost(365)

        assert year == (Decimal(300000) + Decimal(15000)) * 12

    def test_it_does_not_care_whether_anyone_stayed(self):
        assert costs().fixed_cost(7) > 0

    @pytest.mark.parametrize("days", [0, -1])
    def test_an_empty_period_costs_nothing(self, days):
        assert costs(rent=300000).fixed_cost(days) == Decimal("0")

    def test_a_flat_with_no_costs_recorded_reports_none(self):
        # Costs are opt-in per flat. An unfilled one must read as zero rather
        # than as an error, or a single missing row breaks the whole report.
        assert PropertyCosts().fixed_cost(30) == Decimal("0")
        assert PropertyCosts().marginal_cost(1) == Decimal("0")
