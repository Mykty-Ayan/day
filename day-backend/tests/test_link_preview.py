"""What a chat shows for a guest link: Open Graph tags for the robots of WhatsApp,
Telegram and Instagram, which run no script. Never the guest's name or phone."""

import uuid
from datetime import date, timedelta

import pytest

from app.domain.auth.permissions import Permission
from app.presentation.api.v1.link_preview import preview_image, render
from tests.test_property_facts import flat  # noqa: F401  (a fixture)


def test_an_airbnb_photo_is_asked_small_enough_for_a_chat():
    big = "https://a0.muscache.com/im/pictures/hosting/x/original/y.jpeg"
    assert preview_image(big) == big + "?im_w=720"
    assert preview_image(big + "?im_w=1200") == big + "?im_w=720"
    own = "https://files.daiynsolutions.com/photos/a.jpg"
    assert preview_image(own) == own
    assert preview_image(None) is None


def test_the_page_escapes_what_the_owner_wrote():
    page = render('Студия "у <моря>"', "до 2 гостей", None, "https://app.example/s/abc")
    assert '<meta property="og:title" content="Студия &quot;у &lt;моря&gt;&quot;">' in page
    assert "<моря>" not in page and "og:image" not in page


@pytest.mark.integration
async def test_a_flats_link_shows_its_name_price_and_photo(flat):  # noqa: F811  (the imported fixture)
    client, prop, use = flat
    use(Permission.PROPERTIES_READ, Permission.PROPERTIES_WRITE)
    await client.patch(f"/api/v1/properties/{prop}", json={"rooms": 2, "max_guests": 4, "complex_name": "Ауэзов Сити"})
    await client.post(f"/api/v1/properties/{prop}/photos",
                      json={"url": "https://a0.muscache.com/im/pictures/x/original/cover.jpeg", "is_cover": True})
    code = (await client.get(f"/api/v1/properties/{prop}")).json()["public_code"]

    use()  # a robot: no credential at all
    page = await client.get(f"/api/v1/public/preview/s/{code}")
    assert page.status_code == 200 and page.headers["content-type"].startswith("text/html")
    for part in ("Т13 · Ауэзов Сити", "2-комн. · до 4 гостей · 20 000 ₸ за ночь",
                 "cover.jpeg?im_w=720", f"/s/{code}"):
        assert part in page.text, part
    assert (await client.get("/api/v1/public/preview/s/nosuchcode")).status_code == 404


@pytest.mark.integration
async def test_a_personal_links_preview_tells_nothing_of_the_guest(flat):  # noqa: F811  (the imported fixture)
    client, prop, use = flat
    soon = date.today() + timedelta(days=9)
    use(Permission.BOOKINGS_WRITE, Permission.PROPERTIES_READ)
    offer = (await client.post("/api/v1/offers", json={
        "guest_name": "Ерлан Сапаров", "guest_phone": "+77012345672", "check_in": soon.isoformat(),
        "check_out": (soon + timedelta(days=2)).isoformat(), "guests": 2, "property_ids": [str(prop)],
        "external_id": str(uuid.uuid4()),
    })).json()

    use()
    page = await client.get(f"/api/v1/public/preview/o/{offer['code']}")
    assert page.status_code == 200
    assert "Квартира на ваши даты" in page.text and "гостей: 2" in page.text
    for secret in ("Ерлан", "Сапаров", "2345672", offer["external_id"]):
        assert secret not in page.text, secret
