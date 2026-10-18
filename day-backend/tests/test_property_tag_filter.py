"""The flat list filtered by a tag: GET /properties?tag_id=..."""

import uuid
from decimal import Decimal

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.config import settings
from app.domain.auth.permissions import Permission
from app.infrastructure.models.auth import CompanyModel
from app.infrastructure.models.property import (
    PricingConfigModel,
    PropertyModel,
    PropertyTagAssociationModel,
    PropertyTagModel,
)
from tests.test_property_facts import flat  # noqa: F401  (a fixture)


async def _seed(*rows) -> None:
    engine = create_async_engine(settings.DATABASE_URL, poolclass=NullPool)
    try:
        async with async_sessionmaker(engine, expire_on_commit=False)() as session:
            for row in rows:
                session.add(row)
                await session.flush()
            await session.commit()
    finally:
        await engine.dispose()


def _flat(company_id: uuid.UUID, name: str) -> PropertyModel:
    return PropertyModel(
        id=uuid.uuid4(),
        company_id=company_id,
        name=name,
        internal_name=f"{name}-{uuid.uuid4().hex[:6]}",
        type="apartment",
        status="active",
        rental_mode="daily",
    )


def _tag(company_id: uuid.UUID, name: str) -> PropertyTagModel:
    return PropertyTagModel(id=uuid.uuid4(), company_id=company_id, name=f"{name}-{uuid.uuid4().hex[:6]}")


async def _company_of(prop: uuid.UUID) -> uuid.UUID:
    engine = create_async_engine(settings.DATABASE_URL, poolclass=NullPool)
    try:
        async with async_sessionmaker(engine)() as session:
            return await session.scalar(select(PropertyModel.company_id).where(PropertyModel.id == prop))
    finally:
        await engine.dispose()


@pytest.mark.integration
async def test_the_list_keeps_only_flats_with_the_tag(flat):  # noqa: F811  (the imported fixture)
    client, tagged, use = flat
    company_id = await _company_of(tagged)
    plain = _flat(company_id, "plain")
    tag, other_tag = _tag(company_id, "sea"), _tag(company_id, "city")
    await _seed(
        plain,
        tag,
        other_tag,
        PricingConfigModel(property_id=plain.id, base_price=Decimal("20000")),
        PropertyTagAssociationModel(property_id=tagged, tag_id=tag.id),
    )
    use(Permission.PROPERTIES_READ)

    everything = await client.get("/api/v1/properties")
    assert everything.json()["total"] == 2

    filtered = await client.get("/api/v1/properties", params={"tag_id": str(tag.id)})
    assert filtered.status_code == 200, filtered.text
    body = filtered.json()
    assert [p["id"] for p in body["items"]] == [str(tagged)]
    # The pager reads total and pages, so they must follow the filter too.
    assert (body["total"], body["pages"]) == (1, 1)

    # A tag nobody wears and a malformed one.
    empty = await client.get("/api/v1/properties", params={"tag_id": str(other_tag.id)})
    assert empty.json()["items"] == [] and empty.json()["total"] == 0
    assert (await client.get("/api/v1/properties", params={"tag_id": "not-a-uuid"})).status_code == 422

    # It combines with the other filters.
    paused = await client.get("/api/v1/properties", params={"tag_id": str(tag.id), "status": "paused"})
    assert paused.json()["items"] == []


@pytest.mark.integration
async def test_another_companys_tag_shows_no_flats(flat):  # noqa: F811  (the imported fixture)
    client, mine, use = flat
    their_company = uuid.uuid4()
    their_flat = _flat(their_company, "theirs")
    their_tag = _tag(their_company, "sea")
    await _seed(
        CompanyModel(id=their_company, name=f"Tag filter other {their_company.hex[:6]}"),
        their_flat,
        their_tag,
        PropertyTagAssociationModel(property_id=their_flat.id, tag_id=their_tag.id),
        # A row that the API itself never writes: the foreign tag on my own flat.
        PropertyTagAssociationModel(property_id=mine, tag_id=their_tag.id),
    )
    use(Permission.PROPERTIES_READ)

    res = await client.get("/api/v1/properties", params={"tag_id": str(their_tag.id)})

    assert res.status_code == 200, res.text
    assert res.json()["items"] == []
    assert res.json()["total"] == 0
