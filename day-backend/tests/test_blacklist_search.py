"""The blacklist found by a number's digits or a reason's words, on the server: the list shows the
newest 200, and an older number must be found however many came after it."""

import pytest

from app.domain.auth.permissions import Permission
from app.presentation.api.v1 import leads as routes
from tests.test_property_facts import flat  # noqa: F401  (a fixture)


@pytest.mark.integration
async def test_an_old_number_is_found_by_its_digits_or_its_reason(flat, monkeypatch):  # noqa: F811
    client, _prop, use = flat
    use(Permission.BOOKINGS_READ, Permission.BOOKINGS_WRITE)
    first = await client.post("/api/v1/blacklist", json={"phone": "+77071234567", "reason": "Курил в квартире"})
    assert first.status_code in (200, 201), first.text
    for i, reason in enumerate(["Вечеринка ночью", "Не вернул ключи 100%"]):
        made = await client.post("/api/v1/blacklist", json={"phone": f"+7777987654{i}", "reason": reason})
        assert made.status_code in (200, 201), made.text

    async def found(q: str) -> list[str]:
        return [e["phone"] for e in (await client.get("/api/v1/blacklist", params={"q": q})).json()]

    assert await found("123 45") == ["+77071234567"]  # digits however they are typed
    assert await found("курил") == ["+77071234567"]  # words in any case
    assert await found("100%") == ["+77779876541"]  # a "%" is a character, not a wildcard
    assert len(await found("")) == 3

    # Before the limit: with room for one, the oldest still answers its search.
    monkeypatch.setattr(routes, "BLACKLIST_SHOWN", 1)
    assert len(await found("")) == 1
    assert await found("1234567") == ["+77071234567"]
