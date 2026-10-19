"""The Wi-Fi password and guest-only facts reach only those who hand them to guests."""

import uuid
from types import SimpleNamespace

import pytest

from app.application.property.update_property import UpdatePropertyInput
from app.domain.auth.permissions import Permission, permissions_for_role
from app.domain.auth.value_objects import UserRole
from app.domain.property.value_objects import FactAudience
from app.presentation.api.deps import Principal
from app.presentation.api.v1.properties import _sees_secrets, _visible_facts
from tests.test_property_facts import flat  # noqa: F401  (a fixture)
from tests.test_property_services import COMPANY_ID, TestUpdatePropertyService


def _principal(permissions) -> Principal:
    return Principal(company_id=COMPANY_ID, permissions=frozenset(permissions), kind="user", user_id=uuid.uuid4())


@pytest.mark.parametrize(
    ("role", "sees"), [(UserRole.OWNER, True), (UserRole.MANAGER, True), (UserRole.CLEANER, False)]
)
def test_who_sees_secrets_by_role(role, sees):
    assert _sees_secrets(_principal(permissions_for_role(role))) is sees


def test_a_read_only_key_does_not_see_secrets_unless_granted():
    assert not _sees_secrets(_principal({Permission.PROPERTIES_READ}))
    assert _sees_secrets(_principal({Permission.PROPERTIES_READ, Permission.PROPERTY_SECRETS_READ}))


def test_guest_facts_are_dropped_for_those_without_secrets():
    facts = [SimpleNamespace(audience=FactAudience.PUBLIC), SimpleNamespace(audience=FactAudience.GUEST)]
    assert [f.audience for f in _visible_facts(facts, sees_secrets=False)] == [FactAudience.PUBLIC]
    assert len(_visible_facts(facts, sees_secrets=True)) == 2


@pytest.mark.asyncio
async def test_the_password_never_lands_in_the_audit_log():
    _, audit_repo, svc, prop = await TestUpdatePropertyService()._setup()
    await svc.execute(UpdatePropertyInput(property_id=prop.id, company_id=COMPANY_ID, wifi_password="secret-2"))
    logs = await audit_repo.list_by_property(prop.id)
    assert [(log.field_name, log.new_value) for log in logs] == [("wifi_password", "***")]
    assert all("secret" not in (log.old_value or "") + (log.new_value or "") for log in logs)


class _Properties:
    async def list_by_company(self, company_id, offset=0, limit=50, status=None, search=None):
        return [
            SimpleNamespace(
                name="Апартаменты",
                internal_name="62auc",
                address_full="Райымбека 210/6",
                block="8",
                floor=8,
                apartment_number="62",
                wifi_name="Home 62",
                wifi_password="1234554321",
                check_in_instructions="Ключница на двери, код придёт в день заезда",
                check_in_hour=None,
                check_out_hour=None,
                check_in_method=None,
            )
        ]


def _tool_context(sees_secrets: bool):
    from app.application.assistant.tools import ToolContext

    return ToolContext(
        COMPANY_ID,
        availability_service=None,
        booking_repo=None,
        guest_repo=None,
        property_repo=_Properties(),
        create_booking_service=None,
        update_booking_service=None,
        payment_service=None,
        cleaning_service=None,
        metrics_service=None,
        sees_secrets=sees_secrets,
    )


@pytest.mark.asyncio
@pytest.mark.parametrize(("sees", "password"), [(False, None), (True, "1234554321")])
async def test_the_assistant_says_the_password_only_to_those_who_may_hear_it(sees, password):
    info = await _tool_context(sees).property_info("62auc")
    assert info["wifi_name"] == "Home 62"
    assert info["wifi_password"] == password
    # The way in may hold a code: it goes with the password.
    assert (info["check_in_instructions"] is not None) is sees


@pytest.mark.integration
async def test_a_write_key_without_secrets_never_gets_the_password_back(flat):  # noqa: F811  (the imported fixture)
    client, prop, use = flat
    path = f"/api/v1/properties/{prop}"

    use(Permission.PROPERTIES_READ, Permission.PROPERTIES_WRITE, Permission.PROPERTY_SECRETS_READ)
    assert (await client.patch(path, json={"wifi_password": "1234554321"})).json()["wifi_password"] == "1234554321"

    use(Permission.PROPERTIES_READ, Permission.PROPERTIES_WRITE)
    assert (await client.patch(path, json={})).json()["wifi_password"] is None
    assert (await client.get(path)).json()["wifi_password"] is None
    listed = (await client.get("/api/v1/properties")).json()["items"]
    assert [p["wifi_password"] for p in listed] == [None]

    use(Permission.PROPERTIES_READ, Permission.PROPERTY_SECRETS_READ)
    assert (await client.get(path)).json()["wifi_password"] == "1234554321"


@pytest.mark.integration
async def test_the_way_in_is_shown_only_to_those_who_see_secrets(flat):  # noqa: F811  (the imported fixture)
    # A cleaner or a read-only key reads the flat but not how a guest gets in: it may hold a code.
    client, prop, use = flat
    path = f"/api/v1/properties/{prop}"
    way_in = "Ключница на двери, код придёт в день заезда"

    use(Permission.PROPERTIES_READ, Permission.PROPERTIES_WRITE, Permission.PROPERTY_SECRETS_READ)
    assert (await client.patch(path, json={"check_in_instructions": way_in})).json()["check_in_instructions"] == way_in

    use(Permission.PROPERTIES_READ)
    assert (await client.get(path)).json()["check_in_instructions"] is None
    listed = (await client.get("/api/v1/properties")).json()["items"]
    assert [p["check_in_instructions"] for p in listed] == [None]

    use(Permission.PROPERTIES_READ, Permission.PROPERTY_SECRETS_READ)
    assert (await client.get(path)).json()["check_in_instructions"] == way_in
