"""Permission catalogue and the role -> permission mapping.

Every protected endpoint declares the permissions it needs. Two kinds of caller
can satisfy them:

* a logged-in **user**, whose permissions come from their role;
* a **service API key**, whose permissions are the explicit scopes stored with
  the key (bots, external integrations).

Keeping both on the same vocabulary means an endpoint never has to care which
kind of caller it is serving.
"""

from __future__ import annotations

from app.domain.auth.value_objects import UserRole


class Permission:
    """Permission identifiers, `resource:action`.

    Plain string constants rather than an enum so they can be stored verbatim in
    an API key's scope list and compared without conversion.
    """

    PROPERTIES_READ = "properties:read"
    PROPERTIES_WRITE = "properties:write"
    # Narrower than properties:write, which also changes prices: what an
    # integration such as the CRM needs to add to an apartment's knowledge base.
    PROPERTY_FACTS_WRITE = "property_facts:write"
    # What only a guest with a stay should hear — the Wi-Fi password and the
    # guest-only facts (door codes, lockbox). properties:read alone (a cleaner,
    # a read-only key) gets the apartment without them.
    PROPERTY_SECRETS_READ = "property_secrets:read"

    BOOKINGS_READ = "bookings:read"
    BOOKINGS_WRITE = "bookings:write"

    CLEANING_READ = "cleaning:read"
    CLEANING_WRITE = "cleaning:write"
    # A cleaner may only see and report on the tasks assigned to them. The
    # narrowing itself happens in the query layer; this permission marks who is
    # subject to it.
    CLEANING_OWN = "cleaning:own"

    ANALYTICS_READ = "analytics:read"

    SETTINGS_READ = "settings:read"
    SETTINGS_WRITE = "settings:write"

    USERS_MANAGE = "users:manage"
    API_KEYS_MANAGE = "api_keys:manage"

    AI_IMPORT_WRITE = "ai_import:write"

    MESSAGING_SEND = "messaging:send"

    # The company's money out: rent, utilities, staff. The owner's by default.
    EXPENSES_MANAGE = "expenses:manage"


ALL_PERMISSIONS: frozenset[str] = frozenset(
    value for name, value in vars(Permission).items() if not name.startswith("_") and isinstance(value, str)
)

_MANAGER_PERMISSIONS: frozenset[str] = frozenset(
    {
        Permission.PROPERTIES_READ,
        Permission.PROPERTIES_WRITE,
        Permission.PROPERTY_FACTS_WRITE,
        Permission.PROPERTY_SECRETS_READ,
        Permission.BOOKINGS_READ,
        Permission.BOOKINGS_WRITE,
        Permission.CLEANING_READ,
        Permission.CLEANING_WRITE,
        Permission.ANALYTICS_READ,
        Permission.SETTINGS_READ,
        Permission.AI_IMPORT_WRITE,
        Permission.MESSAGING_SEND,
    }
)

# A cleaner reaches the property record because a task shows the address, but
# never writes anything outside their own report. How a guest gets in
# (check-in instructions, codes) needs property_secrets:read, which a cleaner lacks.
_CLEANER_PERMISSIONS: frozenset[str] = frozenset(
    {
        Permission.PROPERTIES_READ,
        Permission.CLEANING_READ,
        Permission.CLEANING_OWN,
    }
)

ROLE_PERMISSIONS: dict[UserRole, frozenset[str]] = {
    UserRole.OWNER: ALL_PERMISSIONS,
    UserRole.MANAGER: _MANAGER_PERMISSIONS,
    UserRole.CLEANER: _CLEANER_PERMISSIONS,
}


def permissions_for_role(role: UserRole) -> frozenset[str]:
    return ROLE_PERMISSIONS.get(role, frozenset())


def is_valid_scope(scope: str) -> bool:
    return scope in ALL_PERMISSIONS
