"""The booking screen: how often the guest stayed, and whose changes the history shows."""

import uuid
from datetime import datetime, timedelta
from decimal import Decimal
from types import SimpleNamespace as Obj

import pytest

from app.application.booking.get_booking import GetBookingService
from app.domain.auth.entities import User
from app.domain.booking.entities import Booking, BookingAuditLog, BookingComment, Guest
from app.domain.booking.value_objects import BookingStatus

COMPANY = uuid.uuid4()


def _booking(guest_id, status=BookingStatus.CONFIRMED) -> Booking:
    now = datetime(2026, 11, 3, 14)
    return Booking(
        company_id=COMPANY,
        guest_id=guest_id,
        property_id=uuid.uuid4(),
        check_in=now,
        check_out=now + timedelta(days=2),
        status=status,
        total_price=Decimal("100"),
    )


class _Bookings:
    def __init__(self, booking, others=()):
        self.booking, self.others = booking, list(others)

    async def get_by_id(self, booking_id):
        return self.booking if booking_id == self.booking.id else None

    async def list_by_guest(self, company_id, guest_id):
        return [self.booking, *self.others] if company_id == COMPANY else []


class _Found:
    def __init__(self, found):
        self.found = found

    async def get_by_id(self, _id):
        return self.found


class _Listed:
    def __init__(self, items=()):
        self.items = list(items)

    async def list_by_booking(self, _booking_id):
        return self.items

    async def get_by_booking(self, _booking_id):
        return self.items


class _Users:
    def __init__(self, *users):
        self.users = {user.id: user for user in users}

    async def get_by_id(self, user_id):
        return self.users.get(user_id)


def _service(bookings, users=None, audit=(), comments=()):
    empty = _Listed()
    return GetBookingService(
        bookings,
        _Found(Guest(company_id=COMPANY, name="Anna")),
        _Found(Obj(name="Flat", internal_name="Kv 15")),
        empty,
        empty,
        empty,
        _Listed(comments),
        empty,
        _Listed(audit),
        users or _Users(),
    )


@pytest.mark.asyncio
async def test_cancelled_stays_do_not_count_for_the_guest():
    guest_id = uuid.uuid4()
    booking = _booking(guest_id)
    others = [_booking(guest_id, BookingStatus.COMPLETED), _booking(guest_id, BookingStatus.CANCELLED)]
    detail = await _service(_Bookings(booking, others)).execute(booking.id, COMPANY)
    assert detail.guest_stays == 2


@pytest.mark.asyncio
async def test_the_history_names_who_changed_and_who_commented():
    booking = _booking(uuid.uuid4())
    anna = User(company_id=COMPANY, full_name="Anna Manager", email="a@day.test")
    unnamed = User(company_id=COMPANY, full_name="", email="b@day.test")
    audit = [BookingAuditLog(booking_id=booking.id, changed_by=anna.id), BookingAuditLog(booking_id=booking.id)]
    comments = [BookingComment(booking_id=booking.id, author_id=unnamed.id, content="Late arrival")]
    detail = await _service(_Bookings(booking), _Users(anna, unnamed), audit, comments).execute(booking.id, COMPANY)
    assert detail.people == {anna.id: "Anna Manager", unnamed.id: "b@day.test"}


@pytest.mark.asyncio
async def test_a_user_of_another_company_is_not_named():
    booking = _booking(uuid.uuid4())
    stranger = User(company_id=uuid.uuid4(), full_name="Stranger")
    audit = [BookingAuditLog(booking_id=booking.id, changed_by=stranger.id)]
    detail = await _service(_Bookings(booking), _Users(stranger), audit).execute(booking.id, COMPANY)
    assert detail.people == {}
