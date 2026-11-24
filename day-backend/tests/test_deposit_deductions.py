"""A hold of a deposit, line by line with photos: stored with the hold, read back signed."""

import uuid

import pytest

from app.domain.auth.permissions import Permission
from app.infrastructure.storage import s3
from app.presentation.api.v1 import bookings
from tests.test_instruction_photos import storage_keys  # noqa: F401  (a fixture)
from tests.test_property_facts import flat  # noqa: F401  (a fixture)
from tests.test_property_photo_upload import JPEG


@pytest.mark.integration
async def test_the_owner_keeps_part_of_a_deposit_with_a_photo_and_reads_it_back(flat, storage_keys, monkeypatch):  # noqa: F811
    client, prop, use = flat
    use(Permission.BOOKINGS_READ, Permission.BOOKINGS_WRITE)
    made = await client.post(
        "/api/v1/bookings",
        json={
            "property_id": str(prop),
            "guest_name": "Айгерим",
            "check_in": "2027-04-01T14:00:00",
            "check_out": "2027-04-03T12:00:00",
            "override_rules": True,
        },
    )
    assert made.status_code == 201, made.text
    booking = made.json()["id"]
    deposit = (await client.post(f"/api/v1/bookings/{booking}/deposits", json={"amount": 10000})).json()["id"]
    base = f"/api/v1/bookings/{booking}/deposits/{deposit}"
    assert (await client.post(f"{base}/action", json={"action": "pay"})).status_code == 200

    async def fake_upload(**kwargs):
        return s3.build_public_url(f"deposits/{kwargs['booking_id']}/{uuid.uuid4()}.jpg")

    monkeypatch.setattr(bookings, "upload_deposit_photo", fake_upload)
    # Not a photo: refused before anything is stored.
    assert (
        await client.post(f"{base}/photos", files={"file": ("x.pdf", b"%PDF-1.4", "image/jpeg")})
    ).status_code == 415
    # Another booking's deposit: nothing to attach to.
    other = f"/api/v1/bookings/{uuid.uuid4()}/deposits/{deposit}/photos"
    assert (await client.post(other, files={"file": ("g.jpg", JPEG, "image/jpeg")})).status_code == 404
    photo = await client.post(f"{base}/photos", files={"file": ("glass.jpg", JPEG, "image/jpeg")})
    assert photo.status_code == 201, photo.text
    stored, preview = photo.json()["url"], photo.json()["preview_url"]
    assert "X-Amz-Signature" in preview and "X-Amz-Signature" not in stored

    held = await client.post(
        f"{base}/action",
        json={
            "action": "partial_hold",
            "reason": "для себя",
            "deductions": [
                {"amount": 3000, "reason": "Разбит бокал", "photos": [stored]},
                {"amount": 1500, "reason": "Пятно на диване"},
            ],
        },
    )
    assert held.status_code == 200, held.text
    detail = (await client.get(f"/api/v1/bookings/{booking}")).json()
    [kept] = detail["deposits"]
    assert (kept["status"], float(kept["held_amount"]), kept["reason"]) == ("partially_held", 4500.0, "для себя")
    assert [(float(d["amount"]), d["reason"]) for d in kept["deductions"]] == [
        (3000.0, "Разбит бокал"),
        (1500.0, "Пятно на диване"),
    ]
    # The stored photo is private: read back as a link that expires.
    assert kept["deductions"][0]["photos"][0].startswith(stored + "?")
