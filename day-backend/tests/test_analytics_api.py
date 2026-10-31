"""Integration tests for analytics API endpoints."""

import uuid
from datetime import datetime

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.config import settings
from app.infrastructure.database import get_session
from app.infrastructure.models.auth import CompanyModel, UserModel
from app.infrastructure.security import create_access_token, hash_password
from app.main import app

pytestmark = pytest.mark.integration


@pytest.fixture
async def client():
    """An authenticated client for a company that exists only for this test.

    Analytics is company-scoped and permission-gated, so an anonymous call
    answers 401 — which is what these tests asserted 200 against ever since
    permissions landed.

    The company is inserted directly and the token minted, rather than going
    through /auth/register: registration is a mutating request, the rate limiter
    allows thirty of those per window, and it counts in Redis — so nineteen
    registrations poisoned not just this file but whatever ran next, in a
    different process, until the window expired.

    The session is overridden with a NullPool engine because the app's is pooled
    at module level while pytest-asyncio gives every test its own loop; sharing
    it raises "attached to a different loop" from asyncpg.
    """
    engine = create_async_engine(settings.DATABASE_URL, poolclass=NullPool)
    maker = async_sessionmaker(engine, expire_on_commit=False)

    async with maker() as session:
        company = CompanyModel(id=uuid.uuid4(), name=f"Analytics Test {uuid.uuid4().hex[:6]}")
        user = UserModel(
            id=uuid.uuid4(),
            email=f"analytics-{uuid.uuid4().hex[:10]}@example.com",
            hashed_password=hash_password("Passw0rd!23"),
            company_id=company.id,
            role="owner",
        )
        session.add_all([company, user])
        await session.commit()
        token = create_access_token(user.id, company.id, user.role)

    async def _session():
        async with maker() as session:
            yield session

    app.dependency_overrides[get_session] = _session
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
            headers={"Authorization": f"Bearer {token}"},
        ) as authenticated:
            yield authenticated
    finally:
        app.dependency_overrides.pop(get_session, None)
        await engine.dispose()


@pytest.mark.asyncio
async def test_get_metrics_default_period(client):
    response = await client.get("/api/v1/analytics/metrics")
    assert response.status_code == 200
    body = response.json()
    assert "summary" in body
    assert "properties" in body
    assert "date_from" in body
    assert "date_to" in body


@pytest.mark.asyncio
async def test_a_period_ends_on_the_companys_today(client, monkeypatch):
    # 00:30 in Almaty on 31 October: the server's clock in UTC is still on the 30th.
    async def company_now(_settings_repo, _company_id):
        return datetime(2026, 10, 31, 0, 30)

    monkeypatch.setattr("app.presentation.api.v1.analytics.company_now", company_now)

    resp = await client.get("/api/v1/analytics/metrics", params={"period": "month"})

    assert resp.status_code == 200
    assert resp.json()["date_to"] == "2026-10-31"


async def test_get_metrics_period_week(client):
    response = await client.get("/api/v1/analytics/metrics?period=week")
    assert response.status_code == 200
    body = response.json()
    assert body["summary"]["total_revenue"] is not None


@pytest.mark.asyncio
async def test_get_metrics_period_month(client):
    response = await client.get("/api/v1/analytics/metrics?period=month")
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_get_metrics_period_quarter(client):
    response = await client.get("/api/v1/analytics/metrics?period=quarter")
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_get_metrics_period_year(client):
    response = await client.get("/api/v1/analytics/metrics?period=year")
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_get_metrics_custom_date_range(client):
    response = await client.get(
        "/api/v1/analytics/metrics?date_from=2025-01-01&date_to=2025-12-31"
    )
    assert response.status_code == 200
    body = response.json()
    assert body["date_from"] == "2025-01-01"
    assert body["date_to"] == "2025-12-31"


@pytest.mark.asyncio
async def test_get_metrics_summary_fields(client):
    response = await client.get("/api/v1/analytics/metrics")
    body = response.json()
    summary = body["summary"]
    expected_fields = [
        "total_revenue",
        "total_expenses",
        "total_profit",
        "total_commission",
        "overall_adr",
        "overall_revpar",
        "overall_occupancy_rate",
        "avg_stay_duration",
        "total_bookings",
        "total_booked_nights",
        "total_vacancy_days",
        "properties_count",
    ]
    for field in expected_fields:
        assert field in summary, f"Missing field: {field}"


@pytest.mark.asyncio
async def test_get_metrics_filter_by_source(client):
    response = await client.get("/api/v1/analytics/metrics?source=direct")
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_get_metrics_filter_by_property_id(client):
    response = await client.get(
        "/api/v1/analytics/metrics?property_id=00000000-0000-0000-0000-000000000099"
    )
    assert response.status_code == 200
    body = response.json()
    assert body["properties"] == []


@pytest.mark.asyncio
async def test_get_time_series_default(client):
    response = await client.get("/api/v1/analytics/time-series?period=week")
    assert response.status_code == 200
    body = response.json()
    assert "data" in body
    assert "granularity" in body
    assert body["granularity"] == "day"


@pytest.mark.asyncio
async def test_get_time_series_granularity_day(client):
    response = await client.get(
        "/api/v1/analytics/time-series?period=month&granularity=day"
    )
    assert response.status_code == 200
    body = response.json()
    assert body["granularity"] == "day"
    assert len(body["data"]) >= 28


@pytest.mark.asyncio
async def test_get_time_series_granularity_week(client):
    response = await client.get(
        "/api/v1/analytics/time-series?period=month&granularity=week"
    )
    assert response.status_code == 200
    body = response.json()
    assert body["granularity"] == "week"
    assert len(body["data"]) >= 4


@pytest.mark.asyncio
async def test_get_time_series_granularity_month(client):
    response = await client.get(
        "/api/v1/analytics/time-series?period=year&granularity=month"
    )
    assert response.status_code == 200
    body = response.json()
    assert body["granularity"] == "month"
    assert len(body["data"]) >= 12


@pytest.mark.asyncio
async def test_get_time_series_data_point_fields(client):
    response = await client.get("/api/v1/analytics/time-series?period=week")
    body = response.json()
    if body["data"]:
        point = body["data"][0]
        assert "period_start" in point
        assert "period_label" in point
        assert "revenue" in point
        assert "bookings_count" in point
        assert "booked_nights" in point
        assert "occupancy_rate" in point


@pytest.mark.asyncio
async def test_get_time_series_custom_date_range(client):
    response = await client.get(
        "/api/v1/analytics/time-series?date_from=2025-01-01&date_to=2025-01-31&granularity=day"
    )
    assert response.status_code == 200
    body = response.json()
    assert body["date_from"] == "2025-01-01"
    assert body["date_to"] == "2025-01-31"
    assert len(body["data"]) == 30


@pytest.mark.asyncio
async def test_export_csv(client):
    response = await client.get("/api/v1/analytics/export?period=month")
    assert response.status_code == 200
    assert "text/csv" in response.headers["content-type"]
    assert "attachment" in response.headers["content-disposition"]
    assert ".csv" in response.headers["content-disposition"]


@pytest.mark.asyncio
async def test_export_csv_has_header_row(client):
    response = await client.get("/api/v1/analytics/export?period=month")
    text = response.text
    lines = text.strip().split("\n")
    assert len(lines) >= 1
    header = lines[0]
    assert "Property" in header
    assert "Revenue" in header
    assert "ADR" in header


@pytest.mark.asyncio
async def test_export_csv_has_total_row(client):
    response = await client.get("/api/v1/analytics/export?period=month")
    assert "TOTAL" in response.text


@pytest.mark.asyncio
async def test_export_csv_custom_date_range(client):
    response = await client.get(
        "/api/v1/analytics/export?date_from=2025-01-01&date_to=2025-12-31"
    )
    assert response.status_code == 200
    disposition = response.headers["content-disposition"]
    assert "2025-01-01" in disposition
    assert "2025-12-31" in disposition


@pytest.mark.asyncio
async def test_the_expense_journal_comes_off_the_profit_until_voided(client):
    period = "/api/v1/analytics/metrics?date_from=2026-10-01&date_to=2026-11-01"
    created = await client.post(
        "/api/v1/expenses", json={"category": "internet", "amount": "9000", "spent_on": "2026-10-15"}
    )
    assert created.status_code == 201, created.text

    summary = (await client.get(period)).json()["summary"]
    assert float(summary["total_recorded_expenses"]) == 9000
    assert float(summary["total_expenses"]) == 9000
    assert float(summary["total_profit"]) == -9000

    assert (await client.post(f"/api/v1/expenses/{created.json()['id']}/void")).status_code == 200
    summary = (await client.get(period)).json()["summary"]
    assert float(summary["total_recorded_expenses"]) == 0
    assert float(summary["total_profit"]) == 0
