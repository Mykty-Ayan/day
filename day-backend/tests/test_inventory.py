"""The minibar's catalogue and stock: one for the whole company.

A product is archived, never deleted: guests' orders and the stock's log point
at it. The stock is the sum of a product's movements; a purchase also lands in
the expenses as «minibar». Seeing goes with bookings:read, changing needs
inventory:manage.
"""

import io
import uuid
from datetime import date
from decimal import Decimal

import pytest

from app.application.inventory.manage_stock import ManageStockService, NewMovement
from app.domain.auth.permissions import Permission, permissions_for_role
from app.domain.auth.value_objects import UserRole
from app.domain.expenses.entities import ExpenseCategory
from app.domain.inventory.entities import MovementKind
from tests.test_expenses import FakeExpenseRepository
from tests.test_property_facts import flat  # noqa: F401  (a fixture)

COMPANY = uuid.uuid4()
OWNER = uuid.uuid4()


class FakeProducts:
    def __init__(self, movements):
        self.rows = {}
        self._movements = movements

    def _with_stock(self, product):
        product.stock = sum(m.quantity for m in self._movements.rows if m.product_id == product.id)
        return product

    async def add(self, product):
        self.rows[product.id] = product
        return product

    async def get(self, company_id, product_id):
        found = self.rows.get(product_id)
        return self._with_stock(found) if found is not None and found.company_id == company_id else None

    async def list(self, company_id, *, include_archived=False):
        return [
            self._with_stock(p) for p in self.rows.values()
            if p.company_id == company_id and (include_archived or p.archived_at is None)
        ]

    async def save(self, product):
        self.rows[product.id] = product
        return product


class FakeMovements:
    def __init__(self):
        self.rows = []

    async def add(self, movement):
        self.rows.append(movement)
        return movement

    async def list_for_product(self, company_id, product_id, *, limit=200):
        return [m for m in reversed(self.rows) if m.company_id == company_id and m.product_id == product_id]


def _service():
    movements = FakeMovements()
    expenses = FakeExpenseRepository()
    return ManageStockService(FakeProducts(movements), movements, expenses), expenses


def _move(product, kind, quantity, **kw):
    return NewMovement(company_id=COMPANY, product_id=product.id, kind=kind, quantity=quantity, created_by=OWNER,
                       **kw)


async def test_a_product_has_a_name_and_a_price_within_the_money_bounds():
    svc, _ = _service()
    cola = await svc.add_product(COMPANY, name="  Кола 0,5 ", category="Напитки", price=Decimal("800"))
    assert (cola.name, cola.category, cola.price, cola.is_active) == ("Кола 0,5", "Напитки", Decimal("800"), True)

    for price in (Decimal("-1"), Decimal("10000000000")):
        with pytest.raises(ValueError, match="price"):
            await svc.add_product(COMPANY, name="Чай", price=price)
    with pytest.raises(ValueError, match="name"):
        await svc.add_product(COMPANY, name="  ", price=Decimal("1"))
    for par in (-1, 100_001):
        with pytest.raises(ValueError, match="threshold"):
            await svc.add_product(COMPANY, name="Чай", price=Decimal("1"), par_level=par)
    with pytest.raises(ValueError, match="cannot be changed"):
        await svc.update_product(COMPANY, cola.id, archived_at=None)


async def test_an_archived_product_leaves_the_list_and_the_menu():
    svc, _ = _service()
    old = await svc.add_product(COMPANY, name="Старый сок", price=Decimal("700"))
    await svc.archive_product(COMPANY, old.id)

    assert await svc.list(COMPANY) == []
    assert [p.id for p in await svc.list(COMPANY, include_archived=True)] == [old.id]
    assert (old.is_active, old.archived_at is not None) == (False, True)


async def test_another_companys_product_is_not_found():
    svc, _ = _service()
    theirs = await svc.add_product(uuid.uuid4(), name="Чужое", price=Decimal("1"))
    for call in (svc.get(COMPANY, theirs.id), svc.update_product(COMPANY, theirs.id, price=Decimal("2")),
                 svc.archive_product(COMPANY, theirs.id), svc.set_photo(COMPANY, theirs.id, "https://x/y.jpg")):
        with pytest.raises(LookupError):
            await call
    assert await svc.list(COMPANY) == []


async def test_a_purchase_adds_to_the_stock_and_is_an_expense():
    svc, expenses = _service()
    cola = await svc.add_product(COMPANY, name="Кола 0,5", category="Напитки", price=Decimal("800"))

    bought = await svc.record(_move(cola, MovementKind.PURCHASE, 24, unit_cost=Decimal("350"),
                                    spent_on=date(2026, 10, 20)))

    assert (await svc.get(COMPANY, cola.id)).stock == 24
    [expense] = expenses.rows.values()
    assert (expense.category, expense.amount, expense.spent_on) == (
        ExpenseCategory.MINIBAR, Decimal("8400"), date(2026, 10, 20)
    )
    assert bought.expense_id == expense.id and "Кола 0,5 × 24" in expense.note


async def test_a_free_delivery_moves_the_stock_and_costs_nothing():
    svc, expenses = _service()
    water = await svc.add_product(COMPANY, name="Вода", price=Decimal("300"))
    moved = await svc.record(_move(water, MovementKind.PURCHASE, 6, unit_cost=Decimal("0")))
    assert (moved.expense_id, expenses.rows) == (None, {})


async def test_a_writeoff_and_a_count_need_a_reason_and_change_the_stock():
    svc, _ = _service()
    nuts = await svc.add_product(COMPANY, name="Орешки", price=Decimal("600"))
    await svc.record(_move(nuts, MovementKind.PURCHASE, 10, unit_cost=Decimal("200")))

    for kind, qty in ((MovementKind.WRITEOFF, 2), (MovementKind.ADJUST, -1)):
        with pytest.raises(ValueError, match="why"):
            await svc.record(_move(nuts, kind, qty))
    await svc.record(_move(nuts, MovementKind.WRITEOFF, 2, note="Просрочены"))
    await svc.record(_move(nuts, MovementKind.ADJUST, -1, note="Пересчёт"))

    assert (await svc.get(COMPANY, nuts.id)).stock == 7
    assert [m.quantity for m in await svc.history(COMPANY, nuts.id)] == [-1, -2, 10]


async def test_wrong_quantities_and_prices_are_refused():
    svc, _ = _service()
    tea = await svc.add_product(COMPANY, name="Чай", price=Decimal("500"))
    for qty in (0, -3, 100_001):
        with pytest.raises(ValueError, match="quantity"):
            await svc.record(_move(tea, MovementKind.PURCHASE, qty, unit_cost=Decimal("1")))
    with pytest.raises(ValueError, match="count"):
        await svc.record(_move(tea, MovementKind.ADJUST, 0, note="?"))
    with pytest.raises(ValueError, match="price"):
        await svc.record(_move(tea, MovementKind.PURCHASE, 1))
    with pytest.raises(ValueError, match="too large"):
        await svc.record(_move(tea, MovementKind.PURCHASE, 2, unit_cost=Decimal("9999999999.99")))
    with pytest.raises(ValueError, match="sale"):
        await svc.record(_move(tea, MovementKind.SALE, 1))


async def test_an_archived_product_is_not_bought_again_but_its_rest_is_written_off():
    svc, _ = _service()
    old = await svc.add_product(COMPANY, name="Старый сок", price=Decimal("700"))
    await svc.archive_product(COMPANY, old.id)
    with pytest.raises(ValueError, match="archived"):
        await svc.record(_move(old, MovementKind.PURCHASE, 1, unit_cost=Decimal("1")))
    await svc.record(_move(old, MovementKind.WRITEOFF, 1, note="Выбросили"))


async def test_another_companys_product_has_no_movements_here():
    svc, _ = _service()
    theirs = await svc.add_product(uuid.uuid4(), name="Чужое", price=Decimal("1"))
    with pytest.raises(LookupError):
        await svc.history(COMPANY, theirs.id)
    with pytest.raises(LookupError):
        await svc.record(_move(theirs, MovementKind.PURCHASE, 1, unit_cost=Decimal("1")))


async def test_what_to_buy_is_what_is_below_the_threshold():
    svc, _ = _service()
    cola = await svc.add_product(COMPANY, name="Кола", price=Decimal("800"), par_level=10)
    water = await svc.add_product(COMPANY, name="Вода", price=Decimal("300"), par_level=4)
    await svc.add_product(COMPANY, name="Чай", price=Decimal("500"))  # no threshold
    full = await svc.add_product(COMPANY, name="Сок", price=Decimal("700"), par_level=2)
    await svc.record(_move(cola, MovementKind.PURCHASE, 7, unit_cost=Decimal("1")))
    await svc.record(_move(full, MovementKind.PURCHASE, 2, unit_cost=Decimal("1")))

    assert [(p.name, p.to_buy) for p in await svc.to_buy(COMPANY)] == [("Вода", 4), ("Кола", 3)]
    assert water.id in {p.id for p in await svc.to_buy(COMPANY)}
    assert await svc.to_buy(uuid.uuid4()) == []


def test_the_owner_and_the_manager_manage_the_catalogue_a_cleaner_does_not():
    assert Permission.INVENTORY_MANAGE in permissions_for_role(UserRole.OWNER)
    assert Permission.INVENTORY_MANAGE in permissions_for_role(UserRole.MANAGER)
    assert Permission.INVENTORY_MANAGE not in permissions_for_role(UserRole.CLEANER)


# ---------- HTTP ----------


@pytest.mark.integration
async def test_the_owner_keeps_the_catalogue_through_the_api(flat):  # noqa: F811  (the imported fixture)
    client, _, use = flat

    use(Permission.BOOKINGS_READ)
    assert (await client.get("/api/v1/inventory/products")).json() == []
    assert (await client.post("/api/v1/inventory/products", json={"name": "Кола", "price": 800})).status_code == 403

    use(Permission.BOOKINGS_READ, Permission.INVENTORY_MANAGE)
    for wrong in ({"name": "Кола", "price": -1}, {"name": "Кола", "price": 10_000_000_000}, {"name": "", "price": 1},
                  {"name": "Кола", "price": "1.001"}):
        assert (await client.post("/api/v1/inventory/products", json=wrong)).status_code == 422
    made = await client.post("/api/v1/inventory/products", json={"name": "Кола", "category": "Напитки", "price": 800})
    assert made.status_code == 201, made.text
    cola = made.json()["id"]
    await client.post("/api/v1/inventory/products", json={"name": "Арахис", "price": 600, "sort_order": 1})

    listed = (await client.get("/api/v1/inventory/products")).json()
    assert [(p["name"], p["price"]) for p in listed] == [("Кола", 800), ("Арахис", 600)]

    patched = await client.patch(f"/api/v1/inventory/products/{cola}",
                                 json={"price": 900, "is_active": False, "par_level": 6})
    assert (patched.json()["price"], patched.json()["is_active"], patched.json()["par_level"]) == (900, False, 6)
    # null takes the threshold away.
    cleared = await client.patch(f"/api/v1/inventory/products/{cola}", json={"par_level": None})
    assert cleared.json()["par_level"] is None
    assert (await client.patch(f"/api/v1/inventory/products/{cola}", json={"par_level": -1})).status_code == 422
    assert (await client.patch(f"/api/v1/inventory/products/{cola}", json={"name": None})).status_code == 422
    assert (await client.post(f"/api/v1/inventory/products/{cola}/archive")).status_code == 200
    assert [p["name"] for p in (await client.get("/api/v1/inventory/products")).json()] == ["Арахис"]


@pytest.mark.integration
async def test_purchases_and_writeoffs_make_the_stock_through_the_api(flat):  # noqa: F811  (the imported fixture)
    client, _, use = flat
    use(Permission.BOOKINGS_READ, Permission.INVENTORY_MANAGE, Permission.EXPENSES_MANAGE)
    cola = (await client.post("/api/v1/inventory/products", json={"name": "Кола", "price": 800})).json()["id"]
    moves = f"/api/v1/inventory/products/{cola}/movements"

    use(Permission.BOOKINGS_READ)
    assert (await client.post(moves, json={"kind": "writeoff", "quantity": 1, "note": "?"})).status_code == 403
    use(Permission.BOOKINGS_READ, Permission.INVENTORY_MANAGE, Permission.EXPENSES_MANAGE)
    bought = await client.post(moves, json={"kind": "purchase", "quantity": 24, "unit_cost": 350,
                                            "spent_on": date.today().isoformat()})
    assert bought.status_code == 201, bought.text
    assert (await client.post(moves, json={"kind": "writeoff", "quantity": 2})).status_code == 422
    assert (await client.post(moves, json={"kind": "sale", "quantity": 1})).status_code == 422
    assert (await client.post(moves, json={"kind": "purchase", "quantity": 1, "unit_cost": -1})).status_code == 422
    assert (await client.post(moves, json={"kind": "writeoff", "quantity": 2, "note": "Разбили"})).status_code == 201

    [listed] = (await client.get("/api/v1/inventory/products")).json()
    assert listed["stock"] == 22
    await client.patch(f"/api/v1/inventory/products/{cola}", json={"par_level": 30})
    [short] = (await client.get("/api/v1/inventory/to-buy")).json()
    assert (short["name"], short["stock"], short["to_buy"]) == ("Кола", 22, 8)
    assert [m["quantity"] for m in (await client.get(moves)).json()] == [-2, 24]
    [expense] = (await client.get("/api/v1/expenses", params={"category": "minibar"})).json()
    assert (expense["amount"], expense["id"]) == (8400, bought.json()["expense_id"])


@pytest.mark.integration
async def test_a_photo_is_a_picture_and_lands_in_the_public_prefix(flat, monkeypatch):  # noqa: F811
    import app.presentation.api.v1.inventory as api

    client, _, use = flat
    use(Permission.BOOKINGS_READ, Permission.INVENTORY_MANAGE)
    stored = []

    async def _upload(*, company_id, file_obj, content_type):
        stored.append(content_type)
        return f"https://s3.test/day/products/{company_id}/x.png"

    monkeypatch.setattr(api, "upload_product_photo", _upload)
    cola = (await client.post("/api/v1/inventory/products", json={"name": "Кола", "price": 800})).json()["id"]
    path = f"/api/v1/inventory/products/{cola}/photo"

    text = await client.post(path, files={"file": ("a.png", io.BytesIO(b"not a picture"), "image/png")})
    assert text.status_code == 415
    png = b"\x89PNG\r\n\x1a\n" + b"0" * 32
    done = await client.post(path, files={"file": ("a.png", io.BytesIO(png), "image/png")})
    assert done.status_code == 200, done.text
    assert done.json()["photo_url"].endswith("/x.png") and stored == ["image/png"]
    assert (await client.post(f"/api/v1/inventory/products/{uuid.uuid4()}/photo",
                              files={"file": ("a.png", io.BytesIO(png), "image/png")})).status_code == 404


@pytest.mark.integration
async def test_another_companys_product_is_neither_seen_nor_changed(flat):  # noqa: F811  (the imported fixture)
    from app.infrastructure.models.auth import CompanyModel
    from app.infrastructure.models.inventory import ProductModel, StockMovementModel
    from tests.test_property_tag_filter import _seed

    client, _, use = flat
    theirs, product = uuid.uuid4(), uuid.uuid4()
    await _seed(
        CompanyModel(id=theirs, name=f"Stock other {theirs.hex[:6]}"),
        ProductModel(id=product, company_id=theirs, name="Чужая кола", price=800),
        StockMovementModel(company_id=theirs, product_id=product, kind="purchase", quantity=5, unit_cost=1),
    )
    use(Permission.BOOKINGS_READ, Permission.INVENTORY_MANAGE)

    assert (await client.get("/api/v1/inventory/products", params={"include_archived": True})).json() == []
    path = f"/api/v1/inventory/products/{product}"
    assert (await client.patch(path, json={"price": 1})).status_code == 404
    assert (await client.post(f"{path}/archive")).status_code == 404
    assert (await client.get(f"{path}/movements")).status_code == 404
    bought = await client.post(f"{path}/movements", json={"kind": "purchase", "quantity": 1, "unit_cost": 1})
    assert bought.status_code == 404
