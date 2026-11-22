"""A company's public site: the owner sets its address and look, a guest opens
/c/<slug> and sees the company, its rules for anyone and its flats on sale."""

import uuid
from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from app.domain.auth.permissions import Permission
from app.presentation.schemas.site import SiteUpdate
from tests.test_property_facts import flat  # noqa: F401  (a fixture)


def test_the_site_s_today_is_the_company_s_day_not_the_server_s():
    # 21:00 UTC on the 21st is already the 22nd in Almaty (UTC+5).
    from app.presentation.api.v1 import site as site_api

    class _Clock(datetime):
        @classmethod
        def now(cls, tz=None):
            return datetime(2026, 11, 21, 21, tzinfo=timezone.utc).astimezone(tz)

    real = site_api.datetime
    site_api.datetime = _Clock
    try:
        assert site_api.company_today(SimpleNamespace(time_zone="Asia/Almaty")).isoformat() == "2026-11-22"
        assert site_api.company_today(None).isoformat() == "2026-11-22"
    finally:
        site_api.datetime = real


def test_an_address_is_short_latin_and_not_day_s_own():
    assert SiteUpdate(slug=" Munar ", title="Munar").slug == "munar"
    assert SiteUpdate(slug="auezov-city", title="x").slug == "auezov-city"
    for wrong in ("mu", "-munar", "munar-", "мунар", "mu nar", "admin", "a" * 41):
        with pytest.raises(ValidationError):
            SiteUpdate(slug=wrong, title="x")


def test_contacts_and_color_are_kept_in_one_form():
    site = SiteUpdate(slug="munar", title=" Munar ", whatsapp="8 (701) 234-56-78",
                      instagram="https://instagram.com/munar.apart/", accent_color="#0E7A5F", about="  ")
    assert (site.title, site.whatsapp, site.instagram, site.accent_color, site.about) == (
        "Munar", "77012345678", "munar.apart", "#0e7a5f", None
    )
    for link in ("@munar.apart", "http://m.instagram.com/munar.apart?igsh=x"):
        assert SiteUpdate(slug="munar", title="x", instagram=link).instagram == "munar.apart"
    for bad in ({"accent_color": "green"}, {"whatsapp": "123"}, {"instagram": "a b"}, {"logo_url": "ftp://x"}):
        with pytest.raises(ValidationError):
            SiteUpdate(slug="munar", title="x", **bad)


@pytest.mark.integration
async def test_the_owner_sets_up_the_site_and_a_guest_opens_it(flat):  # noqa: F811  (the imported fixture)
    client, prop, use = flat
    slug = f"t-{uuid.uuid4().hex[:8]}"
    use(Permission.SETTINGS_READ)
    assert (await client.get("/api/v1/site")).json() is None
    assert (await client.put("/api/v1/site", json={"slug": slug, "title": "x"})).status_code == 403

    use(Permission.SETTINGS_READ, Permission.SETTINGS_WRITE, Permission.PROPERTIES_READ, Permission.PROPERTIES_WRITE,
        Permission.PROPERTY_FACTS_WRITE)
    saved = await client.put("/api/v1/site", json={"slug": slug, "title": "Munar", "whatsapp": "+7 701 234 56 78",
                                                   "accent_color": "#0E7A5F", "tagline": " Квартиры у парка "})
    assert saved.status_code == 200, saved.text
    assert (await client.get("/api/v1/site")).json()["slug"] == slug
    await client.patch(f"/api/v1/properties/{prop}", json={"rooms": 2, "max_guests": 4})
    await client.post("/api/v1/company-facts", json={"text": "Без животных"})
    await client.post("/api/v1/company-facts", json={"text": "Код сейфа 9090", "audience": "guest"})
    code = (await client.get(f"/api/v1/properties/{prop}")).json()["public_code"]

    use()  # a guest
    page = await client.get(f"/api/v1/public/companies/{slug.upper()}")
    assert page.status_code == 200, page.text
    body = page.json()
    assert (body["title"], body["tagline"], body["whatsapp"], body["accent_color"], body["rules"]) == (
        "Munar", "Квартиры у парка", "77012345678", "#0e7a5f", ["Без животных"]
    )
    cards = [(f["code"], f["rooms"], f["night_price"], f["hour_price"]) for f in body["flats"]]
    assert cards == [(code, 2, 20000.0, None)]
    assert "9090" not in page.text
    # Nothing booked: free tonight; no photo yet.
    assert (body["flats"][0]["free_from"], body["flats"][0]["photos"]) == (body["today"], 0)

    # Booked tonight and tomorrow: free from the day after.
    use(Permission.BOOKINGS_READ, Permission.BOOKINGS_WRITE, Permission.PROPERTIES_READ)
    first, after = date.today(), date.today() + timedelta(days=2)
    booked = await client.post("/api/v1/bookings", json={
        "property_id": str(prop), "guest_name": "Ерлан", "guest_phone": "+77010001232",
        "check_in": f"{first}T14:00:00", "check_out": f"{after}T12:00:00",
    })
    assert booked.status_code == 201, booked.text
    use()
    later = (await client.get(f"/api/v1/public/companies/{slug}")).json()
    assert later["flats"][0]["free_from"] == after.isoformat()
    # The flat's own page names the company, to link back and to write to it.
    stay = (await client.get(f"/api/v1/public/stays/{code}")).json()
    assert (stay["company"]["slug"], stay["company"]["whatsapp"]) == (slug, "77012345678")
    assert (await client.get("/api/v1/public/companies/nosuchsite")).status_code == 404


@pytest.mark.integration
async def test_an_address_another_company_holds_is_refused(flat):  # noqa: F811  (the imported fixture)
    from app.infrastructure.models.auth import CompanyModel
    from app.infrastructure.models.site import CompanySiteModel
    from tests.test_property_tag_filter import _seed

    client, _, use = flat
    theirs, slug = uuid.uuid4(), f"t-{uuid.uuid4().hex[:8]}"
    await _seed(CompanyModel(id=theirs, name=f"Site other {theirs.hex[:6]}"),
                CompanySiteModel(company_id=theirs, slug=slug, title="Чужая"))
    use(Permission.SETTINGS_READ, Permission.SETTINGS_WRITE)

    taken = await client.put("/api/v1/site", json={"slug": slug, "title": "Моя"})
    assert taken.status_code == 409
    # The refused save leaves the session fit for the next one.
    assert (await client.put("/api/v1/site", json={"slug": slug + "x", "title": "Моя"})).status_code == 200


@pytest.mark.integration
async def test_a_guest_searches_the_site_by_dates(flat):  # noqa: F811  (the imported fixture)
    client, prop, use = flat
    slug = f"t-{uuid.uuid4().hex[:8]}"
    use(Permission.SETTINGS_READ, Permission.SETTINGS_WRITE, Permission.PROPERTIES_READ, Permission.PROPERTIES_WRITE,
        Permission.BOOKINGS_READ, Permission.BOOKINGS_WRITE)
    assert (await client.put("/api/v1/site", json={"slug": slug, "title": "Munar"})).status_code == 200
    today = date.fromisoformat((await client.get(f"/api/v1/public/companies/{slug}")).json()["today"])
    # Taken from the third night to the fifth.
    booked = await client.post("/api/v1/bookings", json={
        "property_id": str(prop), "guest_name": "Ерлан", "guest_phone": "+77010001233",
        "check_in": f"{today + timedelta(days=3)}T14:00:00", "check_out": f"{today + timedelta(days=5)}T12:00:00",
    })
    assert booked.status_code == 201, booked.text
    use()

    async def search(first: int, last: int):
        return await client.get(f"/api/v1/public/companies/{slug}", params={
            "check_in": str(today + timedelta(days=first)), "check_out": str(today + timedelta(days=last))})

    # Two free nights: free, and all the nights cost as the flat's page counts them.
    free = (await search(1, 3)).json()["flats"][0]
    stay = (await client.get(f"/api/v1/public/stays/{free['code']}", params={
        "date_from": str(today + timedelta(days=1)), "date_to": str(today + timedelta(days=3))})).json()
    assert (free["stay_free"], free["stay_total"]) == (True, sum(n["price"] for n in stay["nights"][:2]))
    # A night taken in the dates: not free, no price.
    taken = (await search(2, 4)).json()["flats"][0]
    assert (taken["stay_free"], taken["stay_total"]) == (False, None)
    # No dates: nothing said either way.
    plain = (await client.get(f"/api/v1/public/companies/{slug}")).json()["flats"][0]
    assert (plain["stay_free"], plain["stay_total"]) == (None, None)

    # Fewer nights than the flat takes: not free for them.
    use(Permission.PROPERTIES_READ, Permission.PROPERTIES_WRITE)
    assert (await client.patch(f"/api/v1/properties/{prop}", json={"min_nights": 3})).status_code == 200
    use()
    assert (await search(5, 7)).json()["flats"][0]["stay_free"] is False
    assert (await search(5, 8)).json()["flats"][0]["stay_free"] is True
    # More nights than it takes: the same.
    use(Permission.PROPERTIES_READ, Permission.PROPERTIES_WRITE)
    assert (await client.patch(f"/api/v1/properties/{prop}", json={"max_nights": 3})).status_code == 200
    use()
    assert (await search(5, 9)).json()["flats"][0]["stay_free"] is False

    # Dates a guest cannot pick are refused.
    for first, last in ((-1, 1), (3, 3), (4, 2), (0, 31), (366, 367)):
        assert (await search(first, last)).status_code == 422, (first, last)
    assert (await client.get(f"/api/v1/public/companies/{slug}", params={"check_in": str(today)})).status_code == 422
