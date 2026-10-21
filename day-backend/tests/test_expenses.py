"""The company's expenses: what the owner paid, on which flat, for what.

Analytics knew only cost norms per flat; what was actually paid lived in the
owner's notes. An expense has a category, an amount, a day and, for rent, the
flat it was paid for. A wrong one is voided, never deleted.
"""

import uuid
from datetime import date
from decimal import Decimal

import pytest

from app.application.expenses.manage_expenses import ManageExpensesService, NewExpense
from app.domain.auth.permissions import Permission, permissions_for_role
from app.domain.auth.value_objects import UserRole
from app.domain.expenses.entities import ExpenseCategory
from app.domain.property.value_objects import PropertyStatus
from tests.test_property_facts import flat  # noqa: F401  (a fixture)
from tests.test_property_services import COMPANY_ID, FakePropertyRepository, _make_property

OWNER = uuid.uuid4()


class FakeExpenseRepository:
    def __init__(self):
        self.rows = {}

    async def add(self, expense):
        self.rows[expense.id] = expense
        return expense

    async def get(self, company_id, expense_id):
        found = self.rows.get(expense_id)
        return found if found is not None and found.company_id == company_id else None

    async def list(self, company_id, *, date_from=None, date_to=None, property_id=None, category=None,
                   include_voided=False):
        return [
            e for e in self.rows.values()
            if e.company_id == company_id
            and (include_voided or e.voided_at is None)
            and (date_from is None or e.spent_on >= date_from)
            and (date_to is None or e.spent_on <= date_to)
            and (property_id is None or e.property_id == property_id)
            and (category is None or e.category == category)
        ]

    async def void(self, company_id, expense_id, voided_by, at):
        found = await self.get(company_id, expense_id)
        if found is None or found.voided_at is not None:
            return None
        found.voided_at, found.voided_by = at, voided_by
        return found


class _ByCompany:
    """Agents and bookings, found only within their company."""

    def __init__(self, *rows):
        self.rows = {r.id: r for r in rows}

    async def get(self, company_id, row_id):
        found = self.rows.get(row_id)
        return found if found is not None and found.company_id == company_id else None

    async def get_by_id(self, row_id):
        return self.rows.get(row_id)


async def _service(*flats, agents=(), bookings=()):
    props = FakePropertyRepository()
    for unit in flats:
        await props.save(unit)
    return ManageExpensesService(FakeExpenseRepository(), props, _ByCompany(*agents), _ByCompany(*bookings))


def _new(**kw):
    base = dict(company_id=COMPANY_ID, category=ExpenseCategory.UTILITIES, amount=Decimal("12000"),
                spent_on=date(2026, 10, 10), created_by=OWNER)
    return NewExpense(**{**base, **kw})


async def test_rent_is_paid_for_a_flat_of_the_company_that_is_on_sale():
    mine, archived, theirs = _make_property(), _make_property(status=PropertyStatus.ARCHIVED), _make_property()
    theirs.company_id = uuid.uuid4()
    svc = await _service(mine, archived, theirs)

    with pytest.raises(ValueError, match="flat"):
        await svc.add(_new(category=ExpenseCategory.RENT))
    for wrong in (archived, theirs):
        with pytest.raises(ValueError, match="flat"):
            await svc.add(_new(category=ExpenseCategory.RENT, property_id=wrong.id))

    rent = await svc.add(_new(category=ExpenseCategory.RENT, property_id=mine.id, amount=Decimal("150000")))
    assert (rent.property_id, rent.amount) == (mine.id, Decimal("150000"))


async def test_other_expenses_may_belong_to_the_whole_company():
    svc = await _service()
    internet = await svc.add(_new(category=ExpenseCategory.INTERNET, payee="Kazakhtelecom"))
    assert internet.property_id is None


async def test_an_amount_is_positive():
    svc = await _service()
    for amount in (Decimal("0"), Decimal("-5")):
        with pytest.raises(ValueError, match="amount"):
            await svc.add(_new(amount=amount))


async def test_a_voided_expense_leaves_the_list_but_is_kept():
    svc = await _service()
    kept = await svc.add(_new())
    wrong = await svc.add(_new(amount=Decimal("1200")))

    await svc.void(COMPANY_ID, wrong.id, OWNER)

    assert [e.id for e in await svc.list(COMPANY_ID)] == [kept.id]
    voided = await svc.list(COMPANY_ID, include_voided=True)
    assert {e.id for e in voided} == {kept.id, wrong.id}
    with pytest.raises(ValueError, match="voided"):
        await svc.void(COMPANY_ID, wrong.id, OWNER)


def test_only_the_owner_manages_expenses_by_default():
    assert Permission.EXPENSES_MANAGE in permissions_for_role(UserRole.OWNER)
    assert Permission.EXPENSES_MANAGE not in permissions_for_role(UserRole.MANAGER)
    assert Permission.EXPENSES_MANAGE not in permissions_for_role(UserRole.CLEANER)


@pytest.mark.integration
async def test_the_owner_records_and_voids_an_expense_through_the_api(flat):  # noqa: F811  (the imported fixture)
    client, prop, use = flat

    use(Permission.PROPERTIES_READ)
    assert (await client.get("/api/v1/expenses")).status_code == 403

    use(Permission.EXPENSES_MANAGE)
    rent = {"category": "rent", "amount": 150000, "spent_on": "2026-10-10", "property_id": str(prop),
            "payee": "Собственник 28", "note": "Аренда за октябрь"}
    assert (await client.post("/api/v1/expenses", json={**rent, "property_id": None})).status_code == 422
    assert (await client.post("/api/v1/expenses", json={**rent, "property_id": str(uuid.uuid4())})).status_code == 422
    created = await client.post("/api/v1/expenses", json=rent)
    assert created.status_code == 201, created.text
    body = created.json()
    assert (body["category"], body["amount"], body["property_id"]) == ("rent", 150000, str(prop))

    listed = (await client.get("/api/v1/expenses", params={"date_from": "2026-10-01", "date_to": "2026-10-31"})).json()
    assert [e["id"] for e in listed] == [body["id"]]

    assert (await client.post(f"/api/v1/expenses/{body['id']}/void")).status_code == 200
    assert (await client.get("/api/v1/expenses")).json() == []
    assert (await client.post(f"/api/v1/expenses/{uuid.uuid4()}/void")).status_code == 404


@pytest.mark.integration
async def test_another_companys_expense_is_neither_seen_nor_voided(flat):  # noqa: F811  (the imported fixture)
    from app.infrastructure.models.auth import CompanyModel
    from app.infrastructure.models.expenses import ExpenseModel
    from tests.test_property_tag_filter import _seed

    client, _, use = flat
    theirs, their_expense = uuid.uuid4(), uuid.uuid4()
    await _seed(
        CompanyModel(id=theirs, name=f"Expenses other {theirs.hex[:6]}"),
        ExpenseModel(id=their_expense, company_id=theirs, category="utilities", amount=5000,
                     spent_on=date(2026, 10, 10)),
    )
    use(Permission.EXPENSES_MANAGE)

    assert (await client.get("/api/v1/expenses", params={"include_voided": True})).json() == []
    assert (await client.post(f"/api/v1/expenses/{their_expense}/void")).status_code == 404


async def test_any_expense_with_a_flat_needs_a_flat_of_the_company():
    archived, theirs = _make_property(status=PropertyStatus.ARCHIVED), _make_property()
    theirs.company_id = uuid.uuid4()
    svc = await _service(archived, theirs)
    for wrong in (archived.id, theirs.id, uuid.uuid4()):
        with pytest.raises(ValueError, match="flat"):
            await svc.add(_new(category=ExpenseCategory.REPAIRS, property_id=wrong))


async def test_two_voids_at_once_leave_the_first():
    # The second finds the expense voided already and is refused, not written over.
    svc = await _service()
    expense = await svc.add(_new())
    first, second = uuid.uuid4(), uuid.uuid4()
    await svc.void(COMPANY_ID, expense.id, first)
    with pytest.raises(ValueError, match="voided"):
        await svc.void(COMPANY_ID, expense.id, second)
    assert (await svc.list(COMPANY_ID, include_voided=True))[0].voided_by == first


def test_a_day_far_from_today_is_a_typo():
    from datetime import timedelta

    from pydantic import ValidationError

    from app.presentation.schemas.expenses import ExpenseCreate

    today = date.today()
    for wrong in (date(1, 1, 1), today + timedelta(days=400), today - timedelta(days=3 * 366)):
        with pytest.raises(ValidationError):
            ExpenseCreate(category="utilities", amount=1000, spent_on=wrong)
    assert ExpenseCreate(category="utilities", amount=1000, spent_on=today).spent_on == today


@pytest.mark.integration
async def test_a_period_that_ends_before_it_starts_is_refused(flat):  # noqa: F811  (the imported fixture)
    client, _, use = flat
    use(Permission.EXPENSES_MANAGE)
    res = await client.get("/api/v1/expenses", params={"date_from": "2026-10-31", "date_to": "2026-10-01"})
    assert res.status_code == 422


async def test_an_agents_commission_names_an_agent_of_the_company():
    from types import SimpleNamespace

    mine = SimpleNamespace(id=uuid.uuid4(), company_id=COMPANY_ID)
    theirs = SimpleNamespace(id=uuid.uuid4(), company_id=uuid.uuid4())
    svc = await _service(agents=(mine, theirs))

    with pytest.raises(ValueError, match="agent"):
        await svc.add(_new(category=ExpenseCategory.AGENT_COMMISSION))
    for wrong in (theirs.id, uuid.uuid4()):
        with pytest.raises(ValueError, match="agent"):
            await svc.add(_new(category=ExpenseCategory.AGENT_COMMISSION, agent_id=wrong))

    paid = await svc.add(_new(category=ExpenseCategory.AGENT_COMMISSION, agent_id=mine.id, amount=Decimal("3000")))
    assert (paid.agent_id, paid.booking_id) == (mine.id, None)


async def test_an_expense_may_name_a_booking_of_the_company_only():
    from types import SimpleNamespace

    agent = SimpleNamespace(id=uuid.uuid4(), company_id=COMPANY_ID)
    mine = SimpleNamespace(id=uuid.uuid4(), company_id=COMPANY_ID, agent_id=None)
    theirs = SimpleNamespace(id=uuid.uuid4(), company_id=uuid.uuid4(), agent_id=None)
    svc = await _service(agents=(agent,), bookings=(mine, theirs))
    commission = dict(category=ExpenseCategory.AGENT_COMMISSION, agent_id=agent.id)

    for wrong in (theirs.id, uuid.uuid4()):
        with pytest.raises(ValueError, match="booking"):
            await svc.add(_new(**commission, booking_id=wrong))
    paid = await svc.add(_new(**commission, booking_id=mine.id))
    assert paid.booking_id == mine.id


async def test_a_commission_cannot_name_a_booking_another_agent_brought():
    from types import SimpleNamespace

    ermek, other = (SimpleNamespace(id=uuid.uuid4(), company_id=COMPANY_ID) for _ in range(2))
    by_other = SimpleNamespace(id=uuid.uuid4(), company_id=COMPANY_ID, agent_id=other.id)
    svc = await _service(agents=(ermek, other), bookings=(by_other,))

    with pytest.raises(ValueError, match="another agent"):
        await svc.add(_new(category=ExpenseCategory.AGENT_COMMISSION, agent_id=ermek.id, booking_id=by_other.id))
    paid = await svc.add(_new(category=ExpenseCategory.AGENT_COMMISSION, agent_id=other.id, booking_id=by_other.id))
    assert paid.agent_id == other.id


@pytest.mark.integration
async def test_an_agents_commission_is_kept_with_its_agent_and_booking(flat):  # noqa: F811  (the imported fixture)
    client, prop, use = flat
    use(Permission.BOOKINGS_READ, Permission.BOOKINGS_WRITE, Permission.PROPERTIES_READ, Permission.EXPENSES_MANAGE)
    agent = (await client.post("/api/v1/agents", json={"name": "Ермек"})).json()
    stay = {"property_id": str(prop), "guest_name": "Жалгас", "guest_phone": "+77079011161",
            "check_in": "2030-12-01T14:00:00", "check_out": "2030-12-02T12:00:00", "rental_mode": "daily",
            "adults_count": 1, "agent_id": agent["id"]}
    booking = (await client.post("/api/v1/bookings", json=stay)).json()
    paid = {"category": "agent_commission", "amount": 3000, "spent_on": date.today().isoformat()}

    assert (await client.post("/api/v1/expenses", json=paid)).status_code == 422
    made = await client.post("/api/v1/expenses", json={**paid, "agent_id": agent["id"], "booking_id": booking["id"]})
    assert made.status_code == 201, made.text
    assert (made.json()["agent_id"], made.json()["booking_id"]) == (agent["id"], booking["id"])
    listed = (await client.get("/api/v1/expenses", params={"category": "agent_commission"})).json()
    assert [(e["agent_id"], e["booking_id"]) for e in listed] == [(agent["id"], booking["id"])]
