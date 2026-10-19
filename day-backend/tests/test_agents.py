"""Agents: the people who bring guests for a cut (Ермек for Munar).

A booking names the agent who brought the guest; what the agent was paid is
the owner's to record, as an expense, since the cut differs from lead to lead.
"""

import uuid

import pytest

from app.domain.auth.permissions import Permission
from tests.test_property_facts import flat  # noqa: F401  (a fixture)

_STAY = {"guest_name": "Жалгас", "guest_phone": "+77079011160", "check_in": "2030-11-01T14:00:00",
         "check_out": "2030-11-02T12:00:00", "rental_mode": "daily", "adults_count": 2}


@pytest.mark.integration
async def test_an_agent_is_kept_and_named_on_the_bookings_they_bring(flat):  # noqa: F811  (the imported fixture)
    client, prop, use = flat
    use(Permission.BOOKINGS_READ, Permission.BOOKINGS_WRITE, Permission.PROPERTIES_READ)

    assert (await client.post("/api/v1/agents", json={"name": " "})).status_code == 422
    made = await client.post("/api/v1/agents", json={"name": "Ермек", "phone": "+7 701 000 00 00", "note": "WhatsApp"})
    assert made.status_code == 201, made.text
    agent = made.json()
    assert (agent["name"], agent["is_active"]) == ("Ермек", True)
    assert [a["id"] for a in (await client.get("/api/v1/agents")).json()] == [agent["id"]]

    booked = await client.post("/api/v1/bookings", json={**_STAY, "property_id": str(prop), "agent_id": agent["id"]})
    assert booked.status_code == 201, booked.text
    booking = booked.json()
    assert booking["agent_id"] == agent["id"]

    # Taken off the booking, and back.
    path = f"/api/v1/bookings/{booking['id']}"
    assert (await client.patch(path, json={"agent_id": None})).json()["agent_id"] is None
    assert (await client.patch(path, json={"agent_id": agent["id"]})).json()["agent_id"] == agent["id"]

    # An agent who stopped working is kept on old bookings and off the active list.
    stopped = await client.patch(f"/api/v1/agents/{agent['id']}", json={"is_active": False})
    assert stopped.json()["is_active"] is False
    assert (await client.get("/api/v1/agents")).json() == []
    assert len((await client.get("/api/v1/agents", params={"include_inactive": True})).json()) == 1


@pytest.mark.integration
async def test_another_companys_agent_cannot_be_named_or_changed(flat):  # noqa: F811  (the imported fixture)
    from datetime import datetime

    from app.infrastructure.models.agents import AgentModel
    from app.infrastructure.models.auth import CompanyModel
    from tests.test_property_tag_filter import _seed

    client, prop, use = flat
    theirs, their_agent = uuid.uuid4(), uuid.uuid4()
    await _seed(
        CompanyModel(id=theirs, name=f"Agents other {theirs.hex[:6]}"),
        AgentModel(id=their_agent, company_id=theirs, name="Чужой", created_at=datetime.utcnow()),
    )
    use(Permission.BOOKINGS_READ, Permission.BOOKINGS_WRITE, Permission.PROPERTIES_READ)

    assert (await client.get("/api/v1/agents", params={"include_inactive": True})).json() == []
    assert (await client.patch(f"/api/v1/agents/{their_agent}", json={"name": "x"})).status_code == 404
    foreign = {**_STAY, "property_id": str(prop), "agent_id": str(their_agent)}
    refused = await client.post("/api/v1/bookings", json=foreign)
    assert refused.status_code == 422


def test_a_request_without_an_agent_hashes_as_before_agents_existed():
    # A CRM retry of a key saved before this release must find its booking.
    from app.presentation.api.v1.bookings import _request_hash
    from app.presentation.schemas.booking import BookingCreate

    body = BookingCreate(property_id=uuid.uuid4(), **_STAY)
    before = body.model_dump(mode="json", exclude={"override_rules", "agent_id"})
    import hashlib
    import json

    assert _request_hash(body) == hashlib.sha256(json.dumps(before, sort_keys=True).encode()).hexdigest()
    assert _request_hash(body.model_copy(update={"agent_id": uuid.uuid4()})) != _request_hash(body)


@pytest.mark.integration
async def test_the_history_tells_an_agent_change_only_when_it_changes(flat):  # noqa: F811  (the imported fixture)
    client, prop, use = flat
    use(Permission.BOOKINGS_READ, Permission.BOOKINGS_WRITE, Permission.PROPERTIES_READ)
    agent = (await client.post("/api/v1/agents", json={"name": "Ермек"})).json()
    booking = (await client.post("/api/v1/bookings", json={**_STAY, "property_id": str(prop)})).json()
    path = f"/api/v1/bookings/{booking['id']}"

    await client.patch(path, json={"agent_id": agent["id"]})
    await client.patch(path, json={"agent_id": agent["id"], "notes": "тот же агент"})
    log = (await client.get(f"{path}/audit-log")).json()
    changes = [(e["old_value"], e["new_value"]) for e in log if e.get("field_name") == "agent_id"]

    assert changes == [("None", agent["id"])]  # as the history writes every empty value


@pytest.mark.integration
async def test_a_booking_cannot_be_moved_to_another_companys_agent(flat):  # noqa: F811  (the imported fixture)
    from datetime import datetime

    from app.infrastructure.models.agents import AgentModel
    from app.infrastructure.models.auth import CompanyModel
    from tests.test_property_tag_filter import _seed

    client, prop, use = flat
    theirs, their_agent = uuid.uuid4(), uuid.uuid4()
    await _seed(
        CompanyModel(id=theirs, name=f"Agents patch {theirs.hex[:6]}"),
        AgentModel(id=their_agent, company_id=theirs, name="Чужой", created_at=datetime.utcnow()),
    )
    use(Permission.BOOKINGS_READ, Permission.BOOKINGS_WRITE, Permission.PROPERTIES_READ)
    booking = (await client.post("/api/v1/bookings", json={**_STAY, "property_id": str(prop)})).json()

    refused = await client.patch(f"/api/v1/bookings/{booking['id']}", json={"agent_id": str(their_agent)})

    assert refused.status_code == 422


@pytest.mark.integration
async def test_the_bookings_an_agent_brought_are_listed_by_the_agent(flat):  # noqa: F811  (the imported fixture)
    client, prop, use = flat
    use(Permission.BOOKINGS_READ, Permission.BOOKINGS_WRITE, Permission.PROPERTIES_READ)
    agent = (await client.post("/api/v1/agents", json={"name": "Ермек"})).json()
    brought = (await client.post("/api/v1/bookings", json={**_STAY, "property_id": str(prop),
                                                           "agent_id": agent["id"]})).json()
    await client.post("/api/v1/bookings", json={**_STAY, "property_id": str(prop), "guest_phone": "+77079011163",
                                               "check_in": "2030-11-05T14:00:00", "check_out": "2030-11-06T12:00:00"})

    listed = (await client.get("/api/v1/bookings", params={"agent_id": agent["id"]})).json()

    assert [b["id"] for b in listed["items"]] == [brought["id"]]
    assert listed["total"] == 1
