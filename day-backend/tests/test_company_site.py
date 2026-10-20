"""A company's public site: the owner sets its address and look, a guest opens
/c/<slug> and sees the company, its rules for anyone and its flats on sale."""

import uuid

import pytest
from pydantic import ValidationError

from app.domain.auth.permissions import Permission
from app.presentation.schemas.site import SiteUpdate
from tests.test_property_facts import flat  # noqa: F401  (a fixture)


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
                                                   "accent_color": "#0E7A5F"})
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
    assert (body["title"], body["whatsapp"], body["accent_color"], body["rules"]) == (
        "Munar", "77012345678", "#0e7a5f", ["Без животных"]
    )
    cards = [(f["code"], f["rooms"], f["night_price"], f["hour_price"]) for f in body["flats"]]
    assert cards == [(code, 2, 20000.0, None)]
    assert "9090" not in page.text
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
