"""Unit tests for booking list service."""

import uuid
from unittest.mock import AsyncMock

import pytest

from app.application.booking.list_bookings import ListBookingsService


@pytest.mark.asyncio
async def test_list_bookings_passes_search_to_repository():
    company_id = uuid.uuid4()
    repo = AsyncMock()
    repo.list_by_company.return_value = []
    repo.count_by_company.return_value = 0

    svc = ListBookingsService(repo)  # type: ignore[arg-type]
    result = await svc.execute(company_id, offset=20, limit=10, search="aruzhan")

    repo.list_by_company.assert_awaited_once_with(
        company_id,
        offset=20,
        limit=10,
        status=None,
        property_id=None,
        source=None,
        search="aruzhan",
        date_from=None,
        date_to=None,
    )
    repo.count_by_company.assert_awaited_once_with(
        company_id,
        status=None,
        property_id=None,
        source=None,
        search="aruzhan",
        date_from=None,
        date_to=None,
    )
    assert result.items == []
    assert result.total == 0
