"""The booking feed: what an integration polls to learn about every change.

The CRM keeps a cursor and asks "what changed after it?". A change it never
sees is a deal stuck in the wrong stage, so the cases below pin the order, the
paging, the settle window and the company scope.
"""

import contextlib
import uuid
from datetime import datetime, timedelta
from decimal import Decimal

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.application.booking.booking_feed import (
    FEED_SETTLE,
    BookingFeedService,
    FeedPosition,
)
from app.config import settings
from app.domain.auth.permissions import Permission
from app.domain.booking.entities import Booking, Guest
from app.domain.booking.value_objects import BookingStatus
from app.main import app
from app.presentation.api.deps import Principal, get_principal

COMPANY_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")
OTHER_COMPANY_ID = uuid.UUID("00000000-0000-0000-0000-000000000099")
NOW = datetime(2026, 10, 11, 12, 0, 0)


def _booking(updated_at: datetime, *, company_id=COMPANY_ID, status=BookingStatus.CONFIRMED, **kw) -> Booking:
    return Booking(
        company_id=company_id,
        check_in=datetime(2026, 11, 1, 14),
        check_out=datetime(2026, 11, 3, 12),
        status=status,
        created_at=updated_at,
        updated_at=updated_at,
        **kw,
    )


class FakeFeedRepository:
    """Implements only what the feed reads, with the SQL semantics spelled out."""

    def __init__(self, bookings: list[Booking]) -> None:
        self.bookings = bookings

    async def list_changed(self, company_id, *, after, until, limit):
        rows = [
            b
            for b in self.bookings
            if b.company_id == company_id
            and (b.updated_at, b.id) > after
            and b.updated_at <= until
        ]
        rows.sort(key=lambda b: (b.updated_at, b.id))
        return rows[:limit]


# ---------- cursor ----------


def test_cursor_round_trips():
    pos = FeedPosition(datetime(2026, 10, 11, 4, 42, 29, 123456), uuid.uuid4())
    assert FeedPosition.decode(pos.encode()) == pos


@pytest.mark.parametrize("raw", ["", "not-base64!", "Zm9v", "MjAyNi0xMC0xMXxub3QtYS11dWlk"])
def test_a_broken_cursor_is_refused(raw):
    with pytest.raises(ValueError):
        FeedPosition.decode(raw)


# ---------- service ----------


async def test_changes_come_oldest_first_and_include_cancelled():
    late = _booking(NOW - timedelta(minutes=5), status=BookingStatus.CANCELLED)
    early = _booking(NOW - timedelta(minutes=10))
    page = await BookingFeedService(FakeFeedRepository([late, early])).execute(
        COMPANY_ID, after=None, limit=10, now=NOW
    )
    assert [b.id for b in page.items] == [early.id, late.id]
    assert page.has_more is False


async def test_a_tie_on_updated_at_is_broken_by_id_and_no_row_is_lost_between_pages():
    same = NOW - timedelta(minutes=5)
    rows = [_booking(same) for _ in range(5)]
    svc = BookingFeedService(FakeFeedRepository(rows))

    seen, after = [], None
    for _ in range(5):
        page = await svc.execute(COMPANY_ID, after=after, limit=2, now=NOW)
        seen += [b.id for b in page.items]
        after = page.next_position
        if not page.has_more:
            break

    assert seen == sorted(b.id for b in rows)


async def test_a_change_younger_than_the_settle_window_waits_for_the_next_poll():
    # A transaction that stamped updated_at but has not committed yet would
    # land behind a cursor that already moved past it.
    fresh = _booking(NOW - FEED_SETTLE + timedelta(seconds=1))
    settled = _booking(NOW - FEED_SETTLE)
    page = await BookingFeedService(FakeFeedRepository([fresh, settled])).execute(
        COMPANY_ID, after=None, limit=10, now=NOW
    )
    assert [b.id for b in page.items] == [settled.id]


async def test_an_empty_page_keeps_the_position_so_the_poller_can_resume():
    pos = FeedPosition(NOW - timedelta(hours=1), uuid.uuid4())
    page = await BookingFeedService(FakeFeedRepository([])).execute(COMPANY_ID, after=pos, limit=10, now=NOW)
    assert page.items == []
    assert page.next_position == pos
    assert page.has_more is False


async def test_an_empty_feed_from_the_start_still_gives_a_position():
    page = await BookingFeedService(FakeFeedRepository([])).execute(COMPANY_ID, after=None, limit=10, now=NOW)
    assert page.next_position is not None


async def test_has_more_when_the_page_is_full():
    rows = [_booking(NOW - timedelta(minutes=m)) for m in (3, 2, 1)]
    page = await BookingFeedService(FakeFeedRepository(rows)).execute(COMPANY_ID, after=None, limit=2, now=NOW)
    assert len(page.items) == 2
    assert page.has_more is True
    assert page.next_position == FeedPosition(page.items[-1].updated_at, page.items[-1].id)


async def test_since_is_inclusive():
    at = NOW - timedelta(minutes=5)
    row = _booking(at)
    page = await BookingFeedService(FakeFeedRepository([row])).execute(
        COMPANY_ID, after=FeedPosition.since(at), limit=10, now=NOW
    )
    assert [b.id for b in page.items] == [row.id]


# ---------- HTTP ----------


def _principal(*scopes: str) -> Principal:
    return Principal(
        company_id=COMPANY_ID,
        permissions=frozenset(scopes),
        kind="api_key",
        api_key_id=uuid.uuid4(),
        actor_id=uuid.uuid4(),
    )


class _Session:
    async def commit(self):
        pass

    async def rollback(self):
        pass


class _ById:
    def __init__(self, rows):
        self._rows = {r.id: r for r in rows}

    async def get_by_id(self, _id):
        return self._rows.get(_id)


class _Payments:
    def __init__(self, paid):
        self._paid = paid

    async def sum_paid_by_bookings(self, ids):
        return {i: self._paid[i] for i in ids if i in self._paid}


class _Settings:
    async def get_by_company(self, company_id):
        return None


@pytest.fixture
def feed_api(monkeypatch):
    from app.presentation.api import deps
    from app.presentation.api.v1 import bookings

    def install(bookings_rows, *, guests=(), properties=(), paid=None, now=NOW):
        repos = {
            "booking": FakeFeedRepository(bookings_rows),
            "guest": _ById(guests),
            "property": _ById(properties),
            "payment": _Payments(paid or {}),
            "settings": _Settings(),
        }
        monkeypatch.setattr(bookings, "_repos", lambda session: repos)
        monkeypatch.setattr(bookings, "_utcnow", lambda: now)
        app.dependency_overrides[deps.get_session] = lambda: _Session()

    yield install
    app.dependency_overrides.pop(deps.get_session, None)


async def _get(path: str, principal: Principal, **params):
    app.dependency_overrides[get_principal] = lambda: principal
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            return await client.get(path, params=params)
    finally:
        app.dependency_overrides.pop(get_principal, None)


async def test_the_feed_needs_bookings_read():
    response = await _get("/api/v1/bookings/feed", _principal(Permission.PROPERTIES_READ))
    assert response.status_code == 403


async def test_since_and_cursor_together_are_refused(feed_api):
    feed_api([])
    cursor = FeedPosition(NOW, uuid.uuid4()).encode()
    response = await _get(
        "/api/v1/bookings/feed",
        _principal(Permission.BOOKINGS_READ),
        updated_since="2026-10-01T00:00:00Z",
        cursor=cursor,
    )
    assert response.status_code == 400


async def test_a_broken_cursor_is_a_400(feed_api):
    feed_api([])
    response = await _get("/api/v1/bookings/feed", _principal(Permission.BOOKINGS_READ), cursor="garbage")
    assert response.status_code == 400


@pytest.mark.parametrize("limit", [0, 201])
async def test_limit_is_bounded(feed_api, limit):
    feed_api([])
    response = await _get("/api/v1/bookings/feed", _principal(Permission.BOOKINGS_READ), limit=limit)
    assert response.status_code == 422


async def test_an_item_carries_what_the_crm_matches_on(feed_api):
    from app.domain.property.entities import Property

    guest = Guest(company_id=COMPANY_ID, name="Айгерим", phone="8 (778) 682-31-84")
    prop = Property(company_id=COMPANY_ID, name="Т13", internal_name="t13")
    row = _booking(
        NOW - timedelta(minutes=5),
        guest_id=guest.id,
        property_id=prop.id,
        total_price=Decimal("20000"),
    )
    feed_api([row], guests=[guest], properties=[prop], paid={row.id: Decimal("5000")})

    response = await _get("/api/v1/bookings/feed", _principal(Permission.BOOKINGS_READ))

    assert response.status_code == 200
    body = response.json()
    assert body["has_more"] is False
    assert body["currency"] == "KZT"
    assert FeedPosition.decode(body["next_cursor"]) == FeedPosition(row.updated_at, row.id)
    item = body["items"][0]
    assert item["id"] == str(row.id)
    assert item["property_id"] == str(prop.id)
    assert item["property_name"] == "Т13"
    assert item["status"] == "confirmed"
    assert item["guest_name"] == "Айгерим"
    assert item["guest_phone"] == "8 (778) 682-31-84"
    assert item["guest_phone_e164"] == "77786823184"
    # Local time of the company, as everywhere else in Day.
    assert item["check_in"] == "2026-11-01T14:00:00"
    assert item["check_out"] == "2026-11-03T12:00:00"
    # Instants carry their zone.
    assert item["updated_at"] == "2026-10-11T11:55:00Z"
    assert item["created_at"] == "2026-10-11T11:55:00Z"
    # Money as calculate-price writes it: a decimal string with two places.
    assert item["total_price"] == "20000.00"
    assert item["paid_amount"] == "5000.00"


async def test_a_phone_we_cannot_normalise_gives_null(feed_api):
    guest = Guest(company_id=COMPANY_ID, name="Guest", phone="+44 20 7946 0958")
    row = _booking(NOW - timedelta(minutes=5), guest_id=guest.id)
    feed_api([row], guests=[guest])

    item = (await _get("/api/v1/bookings/feed", _principal(Permission.BOOKINGS_READ))).json()["items"][0]

    assert item["guest_phone"] == "+44 20 7946 0958"
    assert item["guest_phone_e164"] is None
    assert item["paid_amount"] == "0.00"


async def test_an_aware_since_is_compared_in_utc(feed_api):
    row = _booking(datetime(2026, 10, 11, 6, 0))  # 11:00 in Almaty (+05:00)
    feed_api([row])
    principal = _principal(Permission.BOOKINGS_READ)

    after = await _get("/api/v1/bookings/feed", principal, updated_since="2026-10-11T11:00:01+05:00")
    before = await _get("/api/v1/bookings/feed", principal, updated_since="2026-10-11T11:00:00+05:00")

    assert after.json()["items"] == []
    assert [i["id"] for i in before.json()["items"]] == [str(row.id)]


async def test_the_feed_only_shows_the_callers_company(feed_api):
    mine = _booking(NOW - timedelta(minutes=5))
    theirs = _booking(NOW - timedelta(minutes=5), company_id=OTHER_COMPANY_ID)
    feed_api([mine, theirs])

    body = (await _get("/api/v1/bookings/feed", _principal(Permission.BOOKINGS_READ))).json()

    assert [i["id"] for i in body["items"]] == [str(mine.id)]


# ---------- SQL (needs PostgreSQL) ----------


@contextlib.asynccontextmanager
async def _fresh_session():
    engine = create_async_engine(settings.DATABASE_URL, poolclass=NullPool)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with maker() as session:
            yield session
    finally:
        await engine.dispose()


@pytest.mark.integration
async def test_sql_feed_orders_by_updated_at_then_id_and_scopes_by_company():
    from app.infrastructure.models.booking import BookingModel, GuestModel
    from app.infrastructure.models.property import PropertyModel
    from app.infrastructure.repositories.booking import SqlBookingRepository

    company, other = uuid.uuid4(), uuid.uuid4()
    async with _fresh_session() as session:
        try:
            props, guests = {}, {}
            for c in (company, other):
                props[c] = PropertyModel(
                    id=uuid.uuid4(), company_id=c, name="P", internal_name=f"p-{c}",
                    type="apartment", status="active", rental_mode="daily",
                )
                guests[c] = GuestModel(id=uuid.uuid4(), company_id=c, name="G")
                session.add_all([props[c], guests[c]])
            await session.flush()

            t = datetime(2026, 10, 11, 4, 0, 0)
            ids = sorted(uuid.uuid4() for _ in range(3))

            def row(i, c, updated_at, week, status="confirmed"):
                # Each row gets its own week, so no two stays overlap.
                check_in = datetime(2026, 11, 1, 14) + timedelta(weeks=week)
                return BookingModel(
                    id=i, company_id=c, property_id=props[c].id, guest_id=guests[c].id,
                    check_in=check_in, check_out=check_in + timedelta(days=2),
                    status=status, updated_at=updated_at, created_at=updated_at,
                )

            # Two rows share one updated_at; the id decides their order.
            session.add(row(ids[2], company, t, 0))
            session.add(row(ids[0], company, t, 1, status="cancelled"))
            session.add(row(ids[1], company, t - timedelta(minutes=1), 2))
            session.add(row(uuid.uuid4(), other, t, 0))
            session.add(row(uuid.uuid4(), company, t + timedelta(hours=1), 3))  # not settled yet
            await session.flush()

            repo = SqlBookingRepository(session)
            start = (datetime(1970, 1, 1), uuid.UUID(int=0))
            first = await repo.list_changed(company, after=start, until=t, limit=2)
            assert [b.id for b in first] == [ids[1], ids[0]]

            rest = await repo.list_changed(company, after=(first[-1].updated_at, first[-1].id), until=t, limit=10)
            assert [b.id for b in rest] == [ids[2]]
        finally:
            await session.rollback()
