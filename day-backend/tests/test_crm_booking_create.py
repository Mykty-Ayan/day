"""Creating a booking from the CRM: a retry must never make a second booking.

The CRM's AI books at night over a network that drops answers. It sends an
Idempotency-Key with every create: the same key with the same request gives the
same booking, the same key with another request is a client bug and is refused.
"""

import asyncio
import uuid
from datetime import date
from decimal import Decimal

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.application.booking.create_booking import CreateBookingInput, CreateBookingService
from app.config import settings
from app.domain.booking.exceptions import IdempotencyKeyReusedError
from app.domain.booking.value_objects import BookingSource, BookingStatus
from tests.test_booking_services import (
    COMPANY_ID,
    OTHER_COMPANY_ID,
    FakeBookingAuditLogRepository,
    FakeBookingRepository,
    FakeGuestRepository,
    FakePricingConfigRepository,
    FakePropertyRepository,
    _build_price_calculator,
    _make_pricing_config,
    _make_property,
)

# ---------- service ----------


async def _service():
    bookings = FakeBookingRepository()
    props = FakePropertyRepository()
    pricing = FakePricingConfigRepository()
    prop = _make_property()
    await props.save(prop)
    await pricing.save(_make_pricing_config(prop.id))
    svc = CreateBookingService(
        bookings, FakeGuestRepository(), props, FakeBookingAuditLogRepository(),
        _build_price_calculator(pricing_repo=pricing),
    )
    return svc, prop


def _input(prop_id, **kw) -> CreateBookingInput:
    return CreateBookingInput(
        company_id=kw.pop("company_id", COMPANY_ID),
        property_id=prop_id,
        guest_name="Айгерим",
        guest_phone="+77786823184",
        check_in=date(2026, 11, 1),
        check_out=date(2026, 11, 3),
        **kw,
    )


async def test_a_crm_booking_keeps_its_deal_id_and_starts_pending():
    svc, prop = await _service()
    booking = await svc.execute(
        _input(prop.id, source=BookingSource.CRM, external_id="deal-42", idempotency_key="k1", idempotency_hash="h1")
    )
    assert booking.source == BookingSource.CRM
    assert booking.external_id == "deal-42"
    assert booking.status == BookingStatus.PENDING
    assert (booking.idempotency_key, booking.idempotency_hash) == ("k1", "h1")


async def test_an_unknown_key_has_nothing_to_replay():
    svc, _ = await _service()
    assert await svc.replay(COMPANY_ID, "k1", "h1") is None


async def test_the_same_key_and_request_replay_the_booking():
    svc, prop = await _service()
    first = await svc.execute(_input(prop.id, idempotency_key="k1", idempotency_hash="h1"))
    assert (await svc.replay(COMPANY_ID, "k1", "h1")).id == first.id


async def test_the_same_key_with_another_request_is_refused():
    svc, prop = await _service()
    await svc.execute(_input(prop.id, idempotency_key="k1", idempotency_hash="h1"))
    with pytest.raises(IdempotencyKeyReusedError):
        await svc.replay(COMPANY_ID, "k1", "h2")


async def test_a_key_belongs_to_one_company():
    svc, prop = await _service()
    await svc.execute(_input(prop.id, idempotency_key="k1", idempotency_hash="h1"))
    assert await svc.replay(OTHER_COMPANY_ID, "k1", "h1") is None


# ---------- HTTP against PostgreSQL ----------


@pytest.fixture
async def crm():
    """A client holding a CRM-like key for a company with one active flat."""
    from app.domain.auth.permissions import Permission
    from app.infrastructure.database import get_session
    from app.infrastructure.models.auth import CompanyModel
    from app.infrastructure.models.property import PricingConfigModel, PropertyModel
    from app.main import app
    from app.presentation.api.deps import Principal, get_principal

    engine = create_async_engine(settings.DATABASE_URL, poolclass=NullPool)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    company_id, prop_id = uuid.uuid4(), uuid.uuid4()
    async with maker() as session:
        session.add(CompanyModel(id=company_id, name=f"CRM test {company_id.hex[:6]}"))
        await session.flush()
        session.add(
            PropertyModel(
                id=prop_id, company_id=company_id, name="Т13", internal_name="t13",
                type="apartment", status="active", rental_mode="daily",
            )
        )
        await session.flush()
        session.add(PricingConfigModel(property_id=prop_id, base_price=Decimal("20000")))
        await session.commit()

    async def _session():
        async with maker() as session:
            yield session

    principal = Principal(
        company_id=company_id,
        permissions=frozenset({Permission.BOOKINGS_READ, Permission.BOOKINGS_WRITE}),
        kind="api_key",
        api_key_id=uuid.uuid4(),
        actor_id=uuid.uuid4(),  # the owner who issued the key
    )
    app.dependency_overrides[get_session] = _session
    app.dependency_overrides[get_principal] = lambda: principal
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            yield client, prop_id
    finally:
        app.dependency_overrides.pop(get_session, None)
        app.dependency_overrides.pop(get_principal, None)
        await engine.dispose()


def _body(prop_id, **kw):
    return {
        "property_id": str(prop_id),
        "guest_name": "Айгерим",
        "guest_phone": "+77786823184",
        "check_in": "2026-11-01T14:00:00",
        "check_out": "2026-11-03T12:00:00",
        "source": "crm",
        "external_id": "deal-42",
        **kw,
    }


@pytest.mark.integration
async def test_a_retry_returns_the_same_booking(crm):
    client, prop = crm
    headers = {"Idempotency-Key": "deal-42-create"}

    first = await client.post("/api/v1/bookings", json=_body(prop), headers=headers)
    again = await client.post("/api/v1/bookings", json=_body(prop), headers=headers)

    assert first.status_code == 201, first.text
    assert "Idempotent-Replayed" not in first.headers
    body = first.json()
    assert (body["source"], body["external_id"], body["status"]) == ("crm", "deal-42", "pending")
    assert again.status_code == 200
    assert again.headers["Idempotent-Replayed"] == "true"
    assert again.json()["id"] == body["id"]


@pytest.mark.integration
async def test_a_key_reused_for_another_request_is_a_422(crm):
    client, prop = crm
    headers = {"Idempotency-Key": "deal-42-create"}
    await client.post("/api/v1/bookings", json=_body(prop), headers=headers)

    other = await client.post(
        "/api/v1/bookings",
        json=_body(prop, check_in="2026-12-01T14:00:00", check_out="2026-12-03T12:00:00"),
        headers=headers,
    )

    assert other.status_code == 422
    assert other.json()["detail"] == "Idempotency-Key was already used with a different request"


@pytest.mark.integration
async def test_two_identical_requests_at_once_make_one_booking(crm):
    client, prop = crm
    headers = {"Idempotency-Key": "deal-7-create"}

    a, b = await asyncio.gather(
        client.post("/api/v1/bookings", json=_body(prop), headers=headers),
        client.post("/api/v1/bookings", json=_body(prop), headers=headers),
    )

    assert sorted([a.status_code, b.status_code]) == [200, 201], (a.text, b.text)
    assert a.json()["id"] == b.json()["id"]


@pytest.mark.integration
async def test_without_a_key_a_second_create_is_an_overlap(crm):
    client, prop = crm
    assert (await client.post("/api/v1/bookings", json=_body(prop))).status_code == 201
    assert (await client.post("/api/v1/bookings", json=_body(prop))).status_code == 409


@pytest.mark.integration
async def test_an_over_long_key_is_refused(crm):
    client, prop = crm
    response = await client.post("/api/v1/bookings", json=_body(prop), headers={"Idempotency-Key": "k" * 256})
    assert response.status_code == 422
