"""The minibar's catalogue: one for the whole company.

A product is archived, never deleted: guests' orders and the stock's log point
at it. Seeing the catalogue goes with bookings:read, changing it needs
inventory:manage.
"""

import io
import uuid
from decimal import Decimal

import pytest

from app.application.inventory.manage_stock import ManageStockService
from app.domain.auth.permissions import Permission, permissions_for_role
from app.domain.auth.value_objects import UserRole
from tests.test_property_facts import flat  # noqa: F401  (a fixture)

COMPANY = uuid.uuid4()


class FakeProducts:
    def __init__(self):
        self.rows = {}

    async def add(self, product):
        self.rows[product.id] = product
        return product

    async def get(self, company_id, product_id):
        found = self.rows.get(product_id)
        return found if found is not None and found.company_id == company_id else None

    async def list(self, company_id, *, include_archived=False):
        return [
            p for p in self.rows.values()
            if p.company_id == company_id and (include_archived or p.archived_at is None)
        ]

    async def save(self, product):
        self.rows[product.id] = product
        return product


def _service():
    return ManageStockService(FakeProducts())


async def test_a_product_has_a_name_and_a_price_within_the_money_bounds():
    svc = _service()
    cola = await svc.add_product(COMPANY, name="  Кола 0,5 ", category="Напитки", price=Decimal("800"))
    assert (cola.name, cola.category, cola.price, cola.is_active) == ("Кола 0,5", "Напитки", Decimal("800"), True)

    for price in (Decimal("-1"), Decimal("10000000000")):
        with pytest.raises(ValueError, match="price"):
            await svc.add_product(COMPANY, name="Чай", price=price)
    with pytest.raises(ValueError, match="name"):
        await svc.add_product(COMPANY, name="  ", price=Decimal("1"))
    with pytest.raises(ValueError, match="cannot be changed"):
        await svc.update_product(COMPANY, cola.id, archived_at=None)


async def test_an_archived_product_leaves_the_list_and_the_menu():
    svc = _service()
    old = await svc.add_product(COMPANY, name="Старый сок", price=Decimal("700"))
    await svc.archive_product(COMPANY, old.id)

    assert await svc.list(COMPANY) == []
    assert [p.id for p in await svc.list(COMPANY, include_archived=True)] == [old.id]
    assert (old.is_active, old.archived_at is not None) == (False, True)


async def test_another_companys_product_is_not_found():
    svc = _service()
    theirs = await svc.add_product(uuid.uuid4(), name="Чужое", price=Decimal("1"))
    for call in (svc.get(COMPANY, theirs.id), svc.update_product(COMPANY, theirs.id, price=Decimal("2")),
                 svc.archive_product(COMPANY, theirs.id), svc.set_photo(COMPANY, theirs.id, "https://x/y.jpg")):
        with pytest.raises(LookupError):
            await call
    assert await svc.list(COMPANY) == []


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

    patched = await client.patch(f"/api/v1/inventory/products/{cola}", json={"price": 900, "is_active": False})
    assert (patched.json()["price"], patched.json()["is_active"]) == (900, False)
    assert (await client.patch(f"/api/v1/inventory/products/{cola}", json={"name": None})).status_code == 422
    assert (await client.post(f"/api/v1/inventory/products/{cola}/archive")).status_code == 200
    assert [p["name"] for p in (await client.get("/api/v1/inventory/products")).json()] == ["Арахис"]


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
    from app.infrastructure.models.inventory import ProductModel
    from tests.test_property_tag_filter import _seed

    client, _, use = flat
    theirs, product = uuid.uuid4(), uuid.uuid4()
    await _seed(
        CompanyModel(id=theirs, name=f"Stock other {theirs.hex[:6]}"),
        ProductModel(id=product, company_id=theirs, name="Чужая кола", price=800),
    )
    use(Permission.BOOKINGS_READ, Permission.INVENTORY_MANAGE)

    assert (await client.get("/api/v1/inventory/products", params={"include_archived": True})).json() == []
    path = f"/api/v1/inventory/products/{product}"
    assert (await client.patch(path, json={"price": 1})).status_code == 404
    assert (await client.post(f"{path}/archive")).status_code == 404
