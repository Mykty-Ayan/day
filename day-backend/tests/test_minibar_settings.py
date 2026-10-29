"""How a company runs its minibar: the ways a guest may pay (a Kaspi invoice before
delivery, on by default; added to the booking's bill), at least one on, and the
hours it takes orders in (none: round the clock; they may run past midnight).
"""

import uuid
from datetime import time

import pytest

from app.application.settings.update_settings import UpdateSettingsService
from app.domain.settings.entities import CompanySettings
from tests.test_company_time_zone import FakeSettingsRepository
from tests.test_property_facts import flat  # noqa: F401  (a fixture)


def test_the_hours_may_run_past_midnight():
    day = CompanySettings(minibar_opens=time(10), minibar_closes=time(22))
    night = CompanySettings(minibar_opens=time(10), minibar_closes=time(2))
    at = [time(9, 59), time(10), time(21, 59), time(22), time(1, 59), time(2)]
    assert [day.minibar_takes_orders(t) for t in at] == [False, True, True, False, False, False]
    assert [night.minibar_takes_orders(t) for t in at] == [False, True, True, True, True, False]
    assert CompanySettings().minibar_takes_orders(time(4)) is True


async def test_the_company_keeps_one_way_to_pay_and_whole_hours():
    svc = UpdateSettingsService(FakeSettingsRepository())
    company = uuid.uuid4()
    fresh = await svc.execute(company, time_zone="Asia/Almaty")
    assert (fresh.minibar_invoice, fresh.minibar_on_booking, fresh.minibar_opens) == (True, False, None)
    both = await svc.execute(company, minibar_on_booking=True, minibar_opens=time(10), minibar_closes=time(2))
    assert (both.minibar_invoice, both.minibar_on_booking, both.minibar_opens, both.minibar_closes) == (
        True, True, time(10), time(2)
    )
    for wrong in ({"minibar_invoice": False, "minibar_on_booking": False}, {"minibar_opens": time(9)},
                  {"minibar_opens": time(9), "minibar_closes": None}, {"minibar_opens": time(9),
                                                                      "minibar_closes": time(9)}):
        with pytest.raises(ValueError):
            await svc.execute(uuid.uuid4(), **wrong)
    clock = await svc.execute(company, minibar_opens=None, minibar_closes=None)
    assert (clock.minibar_opens, clock.minibar_closes) == (None, None)


@pytest.mark.integration
async def test_the_owner_sets_the_ways_to_pay_and_the_hours(flat):  # noqa: F811  (the imported fixture)
    from app.domain.auth.permissions import Permission

    client, _, use = flat
    use(Permission.SETTINGS_READ, Permission.SETTINGS_WRITE)
    fresh = (await client.get("/api/v1/settings")).json()
    assert (fresh["minibar_invoice"], fresh["minibar_on_booking"], fresh["minibar_opens"]) == (True, False, None)
    for wrong in ({"minibar_invoice": False}, {"minibar_opens": "10:00"},
                  {"minibar_opens": "10:00", "minibar_closes": "10:00"}):
        assert (await client.patch("/api/v1/settings", json=wrong)).status_code == 422
    body = {"minibar_on_booking": True, "minibar_opens": "10:00", "minibar_closes": "02:00"}
    saved = await client.patch("/api/v1/settings", json=body)
    assert saved.status_code == 200, saved.text
    got = (await client.get("/api/v1/settings")).json()
    assert (got["minibar_invoice"], got["minibar_on_booking"], got["minibar_opens"], got["minibar_closes"]) == (
        True, True, "10:00:00", "02:00:00"
    )
    # The other settings leave the minibar as it was.
    assert (await client.patch("/api/v1/settings", json={"time_zone": "Asia/Almaty"})).json()["minibar_opens"] == (
        "10:00:00"
    )
    clock = (await client.patch("/api/v1/settings", json={"minibar_opens": None, "minibar_closes": None})).json()
    assert (clock["minibar_opens"], clock["minibar_closes"]) == (None, None)
