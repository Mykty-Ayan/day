"""GET /gantt: each bar carries what the guest has paid, so the chessboard marks a debt."""

import uuid
from datetime import datetime
from decimal import Decimal

from app.application.booking.get_gantt_data import GanttBooking, GanttData, GanttProperty
from app.domain.auth.permissions import Permission
from app.main import app
from tests.test_booking_feed import _get, _NoTab, _Payments, _principal, _Session


def _bar(total: float) -> GanttBooking:
    return GanttBooking(
        id=uuid.uuid4(), guest_name="Айгерим", check_in=datetime(2026, 11, 6, 14), check_out=datetime(2026, 11, 9, 12),
        rental_mode="daily", status="confirmed", source="direct", gantt_color="#3B82F6", gantt_icon=None,
        adults_count=1, children_count=0, total_price=total,
    )


async def test_a_bar_carries_the_sum_paid_and_zero_with_no_payment(monkeypatch):
    from app.presentation.api import deps
    from app.presentation.api.v1 import bookings

    paid, unpaid = _bar(69000), _bar(40000)
    flat = GanttProperty(id=uuid.uuid4(), name="Кв. 15", internal_name="Кв. 15", type="apartment", status="active",
                         bookings=[paid, unpaid])

    class _Service:
        def __init__(self, *repos):
            pass

        async def execute(self, company_id, start, end):
            return GanttData(properties=[flat])

    repos = {"property": None, "booking": None, "guest": None, "day_price": None,
             "payment": _Payments({paid.id: Decimal("20000")}), "orders": _NoTab()}
    monkeypatch.setattr(bookings, "_repos", lambda session: repos)
    monkeypatch.setattr(bookings, "GetGanttDataService", _Service)
    app.dependency_overrides[deps.get_session] = lambda: _Session()
    try:
        response = await _get("/api/v1/gantt", _principal(Permission.BOOKINGS_READ),
                              start_date="2026-11-01", end_date="2026-12-01")
    finally:
        app.dependency_overrides.pop(deps.get_session, None)

    assert response.status_code == 200
    bars = {b["id"]: b for b in response.json()["properties"][0]["bookings"]}
    assert bars[str(paid.id)]["paid_amount"] == 20000
    assert bars[str(unpaid.id)]["paid_amount"] == 0
