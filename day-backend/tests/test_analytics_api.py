"""Integration tests for analytics API endpoints."""

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app

pytestmark = pytest.mark.integration


@pytest.mark.asyncio
async def test_get_metrics_default_period():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/analytics/metrics")
    assert response.status_code == 200
    body = response.json()
    assert "summary" in body
    assert "properties" in body
    assert "date_from" in body
    assert "date_to" in body


@pytest.mark.asyncio
async def test_get_metrics_period_week():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/analytics/metrics?period=week")
    assert response.status_code == 200
    body = response.json()
    assert body["summary"]["total_revenue"] is not None


@pytest.mark.asyncio
async def test_get_metrics_period_month():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/analytics/metrics?period=month")
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_get_metrics_period_quarter():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/analytics/metrics?period=quarter")
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_get_metrics_period_year():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/analytics/metrics?period=year")
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_get_metrics_custom_date_range():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(
            "/api/v1/analytics/metrics?date_from=2025-01-01&date_to=2025-12-31"
        )
    assert response.status_code == 200
    body = response.json()
    assert body["date_from"] == "2025-01-01"
    assert body["date_to"] == "2025-12-31"


@pytest.mark.asyncio
async def test_get_metrics_summary_fields():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
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
async def test_get_metrics_filter_by_source():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/analytics/metrics?source=direct")
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_get_metrics_filter_by_property_id():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(
            "/api/v1/analytics/metrics?property_id=00000000-0000-0000-0000-000000000099"
        )
    assert response.status_code == 200
    body = response.json()
    assert body["properties"] == []


@pytest.mark.asyncio
async def test_get_time_series_default():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/analytics/time-series?period=week")
    assert response.status_code == 200
    body = response.json()
    assert "data" in body
    assert "granularity" in body
    assert body["granularity"] == "day"


@pytest.mark.asyncio
async def test_get_time_series_granularity_day():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(
            "/api/v1/analytics/time-series?period=month&granularity=day"
        )
    assert response.status_code == 200
    body = response.json()
    assert body["granularity"] == "day"
    assert len(body["data"]) >= 28


@pytest.mark.asyncio
async def test_get_time_series_granularity_week():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(
            "/api/v1/analytics/time-series?period=month&granularity=week"
        )
    assert response.status_code == 200
    body = response.json()
    assert body["granularity"] == "week"
    assert len(body["data"]) >= 4


@pytest.mark.asyncio
async def test_get_time_series_granularity_month():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(
            "/api/v1/analytics/time-series?period=year&granularity=month"
        )
    assert response.status_code == 200
    body = response.json()
    assert body["granularity"] == "month"
    assert len(body["data"]) >= 12


@pytest.mark.asyncio
async def test_get_time_series_data_point_fields():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
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
async def test_get_time_series_custom_date_range():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(
            "/api/v1/analytics/time-series?date_from=2025-01-01&date_to=2025-01-31&granularity=day"
        )
    assert response.status_code == 200
    body = response.json()
    assert body["date_from"] == "2025-01-01"
    assert body["date_to"] == "2025-01-31"
    assert len(body["data"]) == 30


@pytest.mark.asyncio
async def test_export_csv():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/analytics/export?period=month")
    assert response.status_code == 200
    assert "text/csv" in response.headers["content-type"]
    assert "attachment" in response.headers["content-disposition"]
    assert ".csv" in response.headers["content-disposition"]


@pytest.mark.asyncio
async def test_export_csv_has_header_row():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/analytics/export?period=month")
    text = response.text
    lines = text.strip().split("\n")
    assert len(lines) >= 1
    header = lines[0]
    assert "Property" in header
    assert "Revenue" in header
    assert "ADR" in header


@pytest.mark.asyncio
async def test_export_csv_has_total_row():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/analytics/export?period=month")
    assert "TOTAL" in response.text


@pytest.mark.asyncio
async def test_export_csv_custom_date_range():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(
            "/api/v1/analytics/export?date_from=2025-01-01&date_to=2025-12-31"
        )
    assert response.status_code == 200
    disposition = response.headers["content-disposition"]
    assert "2025-01-01" in disposition
    assert "2025-12-31" in disposition
