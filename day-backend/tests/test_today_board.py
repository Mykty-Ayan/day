"""GET /bookings/today: the Mini App opens these rows as full bookings.

A row from "Arrivals" is where the operator takes the prepayment, sends the
address and books the cleaning, so it needs what a booking card needs: the
flat, the money and the guest's phone. A guest who has already checked out
today still needs a cleaning, so they stay under "Departures".
"""

from datetime import datetime
from decimal import Decimal

from app.domain.auth.permissions import Permission
from app.domain.booking.entities import Booking, Guest
from app.domain.booking.value_objects import BookingStatus
from app.domain.property.entities import Property
from app.main import app
from tests.test_booking_feed import COMPANY_ID, NOW, _ById, _get, _NoTab, _Payments, _principal, _Session


def _booking(check_in, check_out, status=BookingStatus.CONFIRMED, **kw):
    return Booking(company_id=COMPANY_ID, check_in=check_in, check_out=check_out, status=status,
                   created_at=NOW, updated_at=NOW, **kw)


class _Range:
    def __init__(self, rows):
        self._rows = rows

    async def list_by_company_date_range(self, company_id, start, end):
        return [b for b in self._rows if b.company_id == company_id]


async def _today(monkeypatch, rows, guests, props, paid):
    from app.presentation.api import deps
    from app.presentation.api.v1 import bookings

    repos = {"booking": _Range(rows), "guest": _ById(guests), "property": _ById(props), "payment": _Payments(paid),
             "orders": _NoTab()}
    monkeypatch.setattr(bookings, "_repos", lambda session: repos)
    app.dependency_overrides[deps.get_session] = lambda: _Session()
    try:
        response = await _get("/api/v1/bookings/today", _principal(Permission.BOOKINGS_READ), date="2026-11-03")
    finally:
        app.dependency_overrides.pop(deps.get_session, None)
    assert response.status_code == 200
    return response.json()


async def test_an_arrival_carries_what_its_booking_card_needs(monkeypatch):
    guest = Guest(company_id=COMPANY_ID, name="Айгерим", phone="+77011112233")
    flat = Property(company_id=COMPANY_ID, name="Т13", internal_name="t13")
    arrival = _booking(datetime(2026, 11, 3, 14), datetime(2026, 11, 5, 12), guest_id=guest.id, property_id=flat.id,
                       total_price=Decimal("40000"))

    body = await _today(monkeypatch, [arrival], [guest], [flat], {arrival.id: Decimal("10000")})

    (item,) = body["check_ins"]
    assert item["property_id"] == str(flat.id)
    assert item["guest_id"] == str(guest.id)
    assert item["guest_phone"] == "+77011112233"
    assert float(item["total_price"]) == 40000
    assert float(item["paid_amount"]) == 10000
    assert item["property_internal_name"] == "t13"


async def test_a_guest_who_already_left_today_stays_under_departures(monkeypatch):
    guest = Guest(company_id=COMPANY_ID, name="Ерлан")
    flat = Property(company_id=COMPANY_ID, name="Т13", internal_name="t13")
    left = _booking(datetime(2026, 11, 1, 14), datetime(2026, 11, 3, 12), BookingStatus.CHECKED_OUT,
                    guest_id=guest.id, property_id=flat.id)
    staying = _booking(datetime(2026, 11, 1, 14), datetime(2026, 11, 3, 12), BookingStatus.CHECKED_IN,
                       guest_id=guest.id, property_id=flat.id)

    body = await _today(monkeypatch, [left, staying], [guest], [flat], {})

    # Its "Cleaning" button is needed exactly after the guest has gone.
    assert sorted(i["status"] for i in body["check_outs"]) == ["checked_in", "checked_out"]
