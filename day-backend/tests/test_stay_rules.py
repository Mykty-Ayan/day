"""An apartment's stay rules checked against a booking made in Day: the fewest and
most nights, the hours kept free around an hourly booking, the hours ahead."""

from datetime import datetime
from types import SimpleNamespace

from app.domain.booking.stay_rules import RuleBreach, stay_breaches
from app.domain.booking.value_objects import RentalMode

DAILY, HOURLY = RentalMode.DAILY, RentalMode.HOURLY
NOW = datetime(2026, 10, 16, 12, 0)


def rules(**values):
    none = {"min_nights": None, "max_nights": None, "buffer_minutes": None, "min_lead_hours": None}
    return SimpleNamespace(**{**none, **values})


def stay(check_in: str, check_out: str, mode=DAILY):
    return SimpleNamespace(
        check_in=datetime.fromisoformat(check_in), check_out=datetime.fromisoformat(check_out), rental_mode=mode
    )


def breaches(flat, booking, *, now=NOW, neighbours=()):
    return stay_breaches(flat, booking.check_in, booking.check_out, booking.rental_mode, now=now, neighbours=neighbours)


def test_no_rule_no_breach():
    assert breaches(rules(), stay("2026-10-20T14:00", "2026-10-21T12:00")) == []


def test_a_daily_stay_keeps_to_the_fewest_and_most_nights():
    flat = rules(min_nights=2, max_nights=7)
    assert breaches(flat, stay("2026-10-20T14:00", "2026-10-21T12:00")) == [RuleBreach("min_nights", 2, 1)]
    assert breaches(flat, stay("2026-10-20T14:00", "2026-10-22T12:00")) == []
    assert breaches(flat, stay("2026-10-20T14:00", "2026-10-28T12:00")) == [RuleBreach("max_nights", 7, 8)]


def test_nights_do_not_bind_an_hourly_booking():
    flat = rules(min_nights=2, max_nights=7)
    assert breaches(flat, stay("2026-10-20T10:00", "2026-10-20T13:00", HOURLY)) == []


def test_a_stay_is_booked_the_set_hours_ahead():
    flat = rules(min_lead_hours=3)
    # 12:00 now: a 14:00 check-in is two hours ahead.
    assert breaches(flat, stay("2026-10-16T14:00", "2026-10-17T12:00")) == [RuleBreach("min_lead_hours", 3, 2)]
    assert breaches(flat, stay("2026-10-16T15:00", "2026-10-17T12:00")) == []
    assert breaches(flat, stay("2026-10-16T13:30", "2026-10-16T16:00", HOURLY)) == [RuleBreach("min_lead_hours", 3, 1)]
    # No clock given (a move keeps its dates): no lead check.
    assert breaches(flat, stay("2026-10-16T14:00", "2026-10-17T12:00"), now=None) == []


def test_an_hourly_booking_keeps_the_cleaning_buffer_on_both_sides():
    flat = rules(buffer_minutes=120)
    before = stay("2026-10-20T10:00", "2026-10-20T12:00", HOURLY)
    after = stay("2026-10-20T18:00", "2026-10-20T20:00", HOURLY)
    # 13:00-17:00: one hour after the first, one hour before the second.
    assert breaches(flat, stay("2026-10-20T13:00", "2026-10-20T17:00", HOURLY), neighbours=[before, after]) == [
        RuleBreach("buffer_minutes", 120, 60)
    ]
    assert breaches(flat, stay("2026-10-20T14:00", "2026-10-20T16:00", HOURLY), neighbours=[before, after]) == []


def test_the_buffer_is_counted_in_minutes():
    # Thirty minutes to clean: a gap of 45 is enough, a gap of 15 is not.
    flat = rules(buffer_minutes=30)
    before = stay("2026-10-20T10:00", "2026-10-20T12:00", HOURLY)
    assert breaches(flat, stay("2026-10-20T12:45", "2026-10-20T14:00", HOURLY), neighbours=[before]) == []
    assert breaches(flat, stay("2026-10-20T12:15", "2026-10-20T14:00", HOURLY), neighbours=[before]) == [
        RuleBreach("buffer_minutes", 30, 15)
    ]


def test_the_buffer_holds_between_a_daily_stay_and_an_hourly_booking():
    flat = rules(buffer_minutes=180)
    daily = stay("2026-10-19T14:00", "2026-10-20T12:00")
    assert breaches(flat, stay("2026-10-20T13:00", "2026-10-20T15:00", HOURLY), neighbours=[daily]) == [
        RuleBreach("buffer_minutes", 180, 60)
    ]


def test_the_buffer_does_not_split_two_daily_stays():
    # Check-out at 12:00, check-in at 14:00 is the flat's own turnover: a buffer
    # meant for hourly cleaning must not forbid back-to-back nights.
    flat = rules(buffer_minutes=180)
    earlier = stay("2026-10-18T14:00", "2026-10-20T12:00")
    assert breaches(flat, stay("2026-10-20T14:00", "2026-10-22T12:00"), neighbours=[earlier]) == []


def test_every_broken_rule_is_reported():
    flat = rules(min_nights=3, min_lead_hours=48)
    assert breaches(flat, stay("2026-10-17T14:00", "2026-10-18T12:00")) == [
        RuleBreach("min_nights", 3, 1),
        RuleBreach("min_lead_hours", 48, 26),
    ]


def test_a_booking_inside_a_completed_one_has_no_cleaning_time():
    # An hourly booking 10:00-12:00 marked completed at 11:00. Its hours no longer
    # block the flat, but a new one at 11:30 leaves no time to clean.
    flat = rules(buffer_minutes=120)
    completed = stay("2026-10-20T10:00", "2026-10-20T12:00", HOURLY)
    assert breaches(flat, stay("2026-10-20T11:30", "2026-10-20T13:00", HOURLY), neighbours=[completed]) == [
        RuleBreach("buffer_minutes", 120, 0)
    ]
