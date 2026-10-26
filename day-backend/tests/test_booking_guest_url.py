"""The guest's own page link in the bookings API and the feed, for the CRM to
send the guest. The page shows the door code once the stay is paid, so the link
goes to those with property_secrets:read, as the check-in instructions do."""

import re

import pytest

from app.domain.auth.permissions import Permission
from app.domain.booking.entities import Booking
from app.presentation.api.v1.bookings import guest_url
from tests.test_property_facts import flat  # noqa: F401  (a fixture)


def test_the_link_is_the_guest_page_of_the_booking(monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "PUBLIC_APP_URL", "https://app.day.test/")
    assert guest_url(Booking(guest_code="abcdefghjkmnpqrs")) == "https://app.day.test/g/abcdefghjkmnpqrs"
    assert guest_url(Booking()) is None


@pytest.mark.integration
async def test_the_link_comes_with_the_right_to_hand_out_codes(flat, monkeypatch):  # noqa: F811
    from datetime import timedelta

    import app.application.booking.booking_feed as feed

    # The feed shows a change once it settled (30 s); here, at once.
    monkeypatch.setattr(feed, "FEED_SETTLE", timedelta(0))
    client, prop, use = flat
    reader = (Permission.BOOKINGS_READ, Permission.BOOKINGS_WRITE, Permission.PROPERTIES_READ)
    use(*reader, Permission.PROPERTY_SECRETS_READ)
    stay = {"property_id": str(prop), "guest_name": "Жалгас", "guest_phone": "+77079011161",
            "check_in": "2030-12-01T14:00:00", "check_out": "2030-12-03T12:00:00", "rental_mode": "daily",
            "adults_count": 1}
    made = await client.post("/api/v1/bookings", json=stay)
    assert made.status_code == 201, made.text
    link = made.json()["guest_url"]
    assert re.fullmatch(r"https?://.+/g/[a-z2-9]{16}", link)
    booking = made.json()["id"]

    assert (await client.get(f"/api/v1/bookings/{booking}")).json()["booking"]["guest_url"] == link
    assert [b["guest_url"] for b in (await client.get("/api/v1/bookings")).json()["items"]] == [link]
    assert [b["guest_url"] for b in (await client.get("/api/v1/bookings/feed")).json()["items"]] == [link]
    # The link opens the guest's page.
    assert (await client.get(f"/api/v1/public/guest/{link.rsplit('/', 1)[1]}")).status_code == 200

    use(*reader)
    assert (await client.get(f"/api/v1/bookings/{booking}")).json()["booking"]["guest_url"] is None
    assert [b["guest_url"] for b in (await client.get("/api/v1/bookings")).json()["items"]] == [None]
    assert [b["guest_url"] for b in (await client.get("/api/v1/bookings/feed")).json()["items"]] == [None]
