"""Checking a booking made in Day against its apartment's stay rules."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from app.domain.booking.repositories import BookingRepository
from app.domain.booking.stay_rules import RuleBreach, StayRules, stay_breaches
from app.domain.booking.value_objects import RentalMode
from app.domain.settings.entities import DEFAULT_TIME_ZONE
from app.domain.settings.repositories import CompanySettingsRepository


async def company_now(settings_repo: CompanySettingsRepository | None, company_id: uuid.UUID) -> datetime:
    """Now on the company's clock, naive like every check-in in Day."""
    zone = DEFAULT_TIME_ZONE
    if settings_repo is not None:
        settings = await settings_repo.get_by_company(company_id)
        if settings is not None and settings.time_zone:
            zone = settings.time_zone
    return datetime.now(ZoneInfo(zone)).replace(tzinfo=None)


async def stay_rule_breaches(
    rules: StayRules,
    property_id: uuid.UUID,
    check_in: datetime,
    check_out: datetime,
    rental_mode: RentalMode,
    *,
    company_id: uuid.UUID,
    booking_repo: BookingRepository,
    settings_repo: CompanySettingsRepository | None,
    exclude_id: uuid.UUID | None = None,
    with_lead_time: bool = True,
) -> list[RuleBreach]:
    """The rules the booking breaks. The neighbours and the clock are read only
    when a rule needs them. `with_lead_time` is off for a change that keeps the
    check-in (a later check-out, a move to another flat)."""
    neighbours = []
    if rules.buffer_hours is not None:
        reach = timedelta(hours=rules.buffer_hours)
        neighbours = await booking_repo.get_by_property_and_dates(
            property_id, check_in - reach, check_out + reach, exclude_id=exclude_id
        )
    now = None
    if with_lead_time and rules.min_lead_hours is not None:
        now = await company_now(settings_repo, company_id)
    return stay_breaches(rules, check_in, check_out, rental_mode, now=now, neighbours=neighbours)


def overridden_rules(breaches: list[RuleBreach]) -> str:
    """The breaches an operator confirmed, as the audit log keeps them."""
    return "; ".join(f"{b.rule} {b.limit} (booking: {b.actual})" for b in breaches)
