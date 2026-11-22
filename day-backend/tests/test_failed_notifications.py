"""Notices the bot gave up on: the owner sees them on Today and sends them again,
instead of a double sale or a guest's booking lost with a line in a log."""

import uuid
from datetime import datetime, timedelta

import pytest

from app.domain.auth.permissions import Permission
from app.domain.messaging.entities import OutboundNotification
from app.domain.messaging.value_objects import NotificationEvent, NotificationStatus
from tests.test_property_facts import flat  # noqa: F401  (a fixture)


def test_given_up_after_every_try_is_undelivered_a_dropped_one_is_not():
    n = OutboundNotification()
    for _ in range(OutboundNotification.MAX_ATTEMPTS):
        n.schedule_retry("Forbidden: bot was blocked by the user")
    assert (n.status, n.undelivered) == (NotificationStatus.FAILED, True)
    dropped = OutboundNotification()
    dropped.drop("The chat may no longer read this")
    assert dropped.undelivered is False
    n.send_again(datetime(2026, 11, 23, 9, 0))
    assert (n.status, n.attempts, n.next_attempt_at, n.undelivered) == (
        NotificationStatus.PENDING, 0, datetime(2026, 11, 23, 9, 0), False
    )


@pytest.mark.integration
async def test_the_owner_sees_and_sends_again_only_their_undelivered_notices(flat):  # noqa: F811
    from app.infrastructure.models.auth import CompanyModel
    from app.infrastructure.models.messaging import OutboundNotificationModel
    from tests.test_property_tag_filter import _seed

    client, prop, use = flat
    use(Permission.PROPERTIES_READ)
    mine = uuid.UUID((await client.get(f"/api/v1/properties/{prop}")).json()["company_id"])
    theirs = uuid.uuid4()
    now = datetime.utcnow()

    def row(company, attempts=OutboundNotification.MAX_ATTEMPTS, status="failed", days=0, **payload):
        return OutboundNotificationModel(
            id=uuid.uuid4(), company_id=company, channel="telegram", target="1", status=status,
            event=NotificationEvent.CALENDAR_CLASH.value, attempts=attempts, last_error="Forbidden: bot was blocked",
            payload=payload, created_at=now - timedelta(days=days),
        )

    lost = row(mine, property_name="Кв. 12", guest_name="Дана", booking_id="b-1")
    their = row(theirs)
    await _seed(
        CompanyModel(id=theirs, name=f"Other {theirs.hex[:6]}"),
        lost,
        row(mine, attempts=0),  # dropped: not to be sent
        row(mine, status="sent", attempts=1),
        row(mine, days=10),  # older than a week
        their,
    )

    use(Permission.BOOKINGS_READ)
    assert (await client.get("/api/v1/channels/failed")).status_code == 403
    use(Permission.API_KEYS_MANAGE)
    listed = (await client.get("/api/v1/channels/failed")).json()
    assert [(n["id"], n["event"], n["property_name"], n["guest_name"], n["booking_id"]) for n in listed] == [
        (str(lost.id), "calendar_clash", "Кв. 12", "Дана", "b-1")
    ]
    assert listed[0]["reason"] == "Forbidden: bot was blocked"

    # Another company's notice is not found from here.
    assert (await client.post(f"/api/v1/channels/failed/{their.id}/send-again")).status_code == 404
    assert (await client.post(f"/api/v1/channels/failed/{lost.id}/send-again")).status_code == 204
    assert (await client.get("/api/v1/channels/failed")).json() == []
    # Once queued again it is no longer «given up on»: a second tap finds nothing.
    assert (await client.post(f"/api/v1/channels/failed/{lost.id}/send-again")).status_code == 404

