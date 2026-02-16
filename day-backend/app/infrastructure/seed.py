"""Seed script for development database.

Run with: uv run python -m app.infrastructure.seed
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import date, datetime, time, timedelta

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.database import async_session
from app.infrastructure.models.booking import (
    BookingAuditLogModel,
    BookingCommentModel,
    BookingContractModel,
    BookingDepositModel,
    BookingFileModel,
    BookingModel,
    BookingPaymentModel,
    GroupBookingModel,
    GuestModel,
)
from app.infrastructure.models.cleaning import (
    CleanerRatingModel,
    CleanerRouteModel,
    CleaningChecklistItemModel,
    CleaningChecklistTemplateModel,
    CleaningReportChecklistModel,
    CleaningReportModel,
    CleaningReportPhotoModel,
    CleaningTaskModel,
)
from app.infrastructure.models.property import (
    AmenityModel,
    DiscountRuleModel,
    PricingConfigModel,
    PropertyAmenityModel,
    PropertyAuditLogModel,
    PropertyModel,
    PropertyPhotoModel,
    SeasonalPriceModel,
)

# ---------- Constants ----------

COMPANY_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")

TODAY = date.today()
CURRENT_MONTH_START = TODAY.replace(day=1)
NEXT_MONTH_START = (CURRENT_MONTH_START + timedelta(days=32)).replace(day=1)

GANTT_COLORS = [
    "#3B82F6",  # blue
    "#10B981",  # green
    "#F59E0B",  # amber
    "#EF4444",  # red
    "#8B5CF6",  # violet
    "#EC4899",  # pink
    "#06B6D4",  # cyan
]

TEST_USER_ID = uuid.UUID("00000000-0000-0000-0000-00000000a001")
CLEANER_IDS = [
    uuid.UUID("00000000-0000-0000-0000-00000000c101"),
    uuid.UUID("00000000-0000-0000-0000-00000000c102"),
    uuid.UUID("00000000-0000-0000-0000-00000000c103"),
]

PHOTO_URLS = [
    "https://placehold.co/1200x800?text=Property+Photo+1",
    "https://placehold.co/1200x800?text=Property+Photo+2",
    "https://placehold.co/1200x800?text=Property+Photo+3",
]
FILE_URLS = [
    "https://placehold.co/800x600?text=Booking+File+1",
    "https://placehold.co/800x600?text=Booking+File+2",
]


# ---------- Seed data definitions ----------

AMENITIES = [
    {"name": "Wi-Fi", "icon": "wifi", "category": "comfort"},
    {"name": "Air Conditioning", "icon": "snowflake", "category": "comfort"},
    {"name": "Parking", "icon": "car", "category": "outdoor"},
    {"name": "Kitchen", "icon": "cooking-pot", "category": "kitchen"},
    {"name": "Pool", "icon": "waves", "category": "outdoor"},
]

PROPERTIES = [
    {
        "name": "Alatau Apartment",
        "internal_name": "alatau-apt",
        "type": "apartment",
        "status": "active",
        "address_full": "Dostyk Ave 120, Almaty, Kazakhstan",
        "rooms": 2,
        "beds": 4,
        "area_total": 85.0,
        "area_living": 65.0,
        "description": "Modern apartment near Kok Tobe with city and mountain views.",
        "pricing": {
            "base_price": 25000,
            "weekend_markup": 5000,
            "default_deposit": 10000,
            "extra_adult_price": 3000,
            "extra_child_price": 1500,
            "base_guests": 2,
        },
        "amenities": ["Wi-Fi", "Air Conditioning", "Kitchen"],
    },
    {
        "name": "Medeu Chalet",
        "internal_name": "medeu-chalet",
        "type": "house",
        "status": "active",
        "address_full": "Gornaya St 45, Almaty Region, Kazakhstan",
        "rooms": 4,
        "beds": 8,
        "area_total": 200.0,
        "area_living": 150.0,
        "description": "Spacious mountain retreat close to Medeu and Shymbulak.",
        "pricing": {
            "base_price": 50000,
            "weekend_markup": 10000,
            "default_deposit": 25000,
            "extra_adult_price": 5000,
            "extra_child_price": 2500,
            "base_guests": 4,
        },
        "amenities": ["Wi-Fi", "Air Conditioning", "Parking", "Kitchen", "Pool"],
    },
    {
        "name": "Astana City Studio",
        "internal_name": "city-studio",
        "type": "room",
        "status": "active",
        "address_full": "Kabanbay Batyr Ave 17, Astana, Kazakhstan",
        "rooms": 1,
        "beds": 2,
        "area_total": 35.0,
        "area_living": 28.0,
        "description": "Compact studio in the city center near EXPO area.",
        "pricing": {
            "base_price": 15000,
            "weekend_markup": 3000,
            "default_deposit": 5000,
            "extra_adult_price": 2000,
            "extra_child_price": 1000,
            "base_guests": 1,
        },
        "amenities": ["Wi-Fi", "Air Conditioning"],
    },
    {
        "name": "Aktau Caspian Villa",
        "internal_name": "aktau-caspian-villa",
        "type": "house",
        "status": "active",
        "address_full": "Microdistrict 15, Aktau, Kazakhstan",
        "rooms": 3,
        "beds": 6,
        "area_total": 160.0,
        "area_living": 120.0,
        "description": "Large villa near the Caspian seafront promenade.",
        "pricing": {
            "base_price": 45000,
            "weekend_markup": 8000,
            "default_deposit": 20000,
            "extra_adult_price": 4000,
            "extra_child_price": 2000,
            "base_guests": 3,
        },
        "amenities": ["Wi-Fi", "Air Conditioning", "Parking", "Pool"],
    },
    {
        "name": "Shymkent Downtown Loft",
        "internal_name": "shymkent-downtown-loft",
        "type": "apartment",
        "status": "active",
        "address_full": "Tauke Khan Ave 56, Shymkent, Kazakhstan",
        "rooms": 2,
        "beds": 3,
        "area_total": 75.0,
        "area_living": 55.0,
        "description": "Bright loft in downtown Shymkent near major cafes.",
        "pricing": {
            "base_price": 30000,
            "weekend_markup": 6000,
            "default_deposit": 12000,
            "extra_adult_price": 3500,
            "extra_child_price": 1500,
            "base_guests": 2,
        },
        "amenities": ["Wi-Fi", "Air Conditioning", "Kitchen"],
    },
]

GUESTS = [
    {"name": "Aruzhan Sarsenova", "phone": "+7-701-555-0101", "email": "aruzhan.sarsenova@example.com"},
    {"name": "Nurlan Abdrakhmanov", "phone": "+7-702-555-0102", "email": "nurlan.abdrakhmanov@example.com"},
    {"name": "Dana Tolegen", "phone": "+7-705-555-0103", "email": "dana.tolegen@example.com"},
    {"name": "Alibek Mukhanov", "phone": "+7-707-555-0104", "email": "alibek.mukhanov@example.com"},
    {"name": "Aigerim Kenzhebek", "phone": "+7-708-555-0105", "email": "aigerim.kenzhebek@example.com"},
    {"name": "Madiyar Orazbay", "phone": "+7-747-555-0106", "email": "madiyar.orazbay@example.com"},
    {"name": "Kamila Seitzhan", "phone": "+7-771-555-0107", "email": "kamila.seitzhan@example.com"},
    {"name": "Yerlan Nurgaliyev", "phone": "+7-775-555-0108", "email": "yerlan.nurgaliyev@example.com"},
    {"name": "Sabina Akhmetova", "phone": "+7-776-555-0109", "email": "sabina.akhmetova@example.com"},
    {"name": "Dias Rakhimzhan", "phone": "+7-778-555-0110", "email": "dias.rakhimzhan@example.com"},
]


# ---------- Helper ----------

async def _exists(session: AsyncSession, model, **filters) -> bool:
    stmt = select(model)
    for k, v in filters.items():
        stmt = stmt.where(getattr(model, k) == v)
    result = await session.scalar(stmt)
    return result is not None


# ---------- Seed functions ----------

async def seed_amenities(session: AsyncSession) -> dict[str, uuid.UUID]:
    """Create amenities and return name->id mapping."""
    amenity_map: dict[str, uuid.UUID] = {}
    for data in AMENITIES:
        if await _exists(session, AmenityModel, name=data["name"]):
            result = await session.scalar(
                select(AmenityModel).where(AmenityModel.name == data["name"])
            )
            amenity_map[data["name"]] = result.id
            print(f"  [skip] Amenity '{data['name']}' already exists")
            continue
        amenity = AmenityModel(
            id=uuid.uuid4(),
            name=data["name"],
            icon=data["icon"],
            category=data["category"],
        )
        session.add(amenity)
        amenity_map[data["name"]] = amenity.id
        print(f"  [+] Created amenity: {data['name']}")
    await session.flush()
    return amenity_map


async def seed_properties(
    session: AsyncSession, amenity_map: dict[str, uuid.UUID]
) -> list[uuid.UUID]:
    """Create properties with pricing and return list of property IDs."""
    property_ids: list[uuid.UUID] = []

    for prop_data in PROPERTIES:
        if await _exists(
            session, PropertyModel,
            company_id=COMPANY_ID, internal_name=prop_data["internal_name"],
        ):
            result = await session.scalar(
                select(PropertyModel).where(
                    PropertyModel.company_id == COMPANY_ID,
                    PropertyModel.internal_name == prop_data["internal_name"],
                )
            )
            property_ids.append(result.id)
            print(f"  [skip] Property '{prop_data['name']}' already exists")
            continue

        prop_id = uuid.uuid4()
        prop = PropertyModel(
            id=prop_id,
            company_id=COMPANY_ID,
            name=prop_data["name"],
            internal_name=prop_data["internal_name"],
            type=prop_data["type"],
            status=prop_data["status"],
            address_full=prop_data["address_full"],
            rooms=prop_data["rooms"],
            beds=prop_data["beds"],
            area_total=prop_data["area_total"],
            area_living=prop_data["area_living"],
            description=prop_data["description"],
        )
        session.add(prop)
        property_ids.append(prop_id)

        # Pricing config
        pricing_data = prop_data["pricing"]
        pricing_id = uuid.uuid4()
        session.add(PricingConfigModel(
            id=pricing_id,
            property_id=prop_id,
            base_price=pricing_data["base_price"],
            weekend_markup=pricing_data["weekend_markup"],
            default_deposit=pricing_data["default_deposit"],
            extra_adult_price=pricing_data["extra_adult_price"],
            extra_child_price=pricing_data["extra_child_price"],
            base_guests=pricing_data["base_guests"],
        ))

        # Seasonal price (summer season for each property)
        session.add(SeasonalPriceModel(
            id=uuid.uuid4(),
            pricing_config_id=pricing_id,
            name="Summer Peak",
            start_date=date(TODAY.year, 6, 1),
            end_date=date(TODAY.year, 8, 31),
            price_per_night=float(pricing_data["base_price"] * 1.3),
        ))

        # Second seasonal price (holiday season)
        session.add(SeasonalPriceModel(
            id=uuid.uuid4(),
            pricing_config_id=pricing_id,
            name="Holiday Season",
            start_date=date(TODAY.year, 12, 20),
            end_date=date(TODAY.year + 1, 1, 5),
            price_per_night=float(pricing_data["base_price"] * 1.5),
        ))

        # Discount rule (7+ nights = 10% off)
        session.add(DiscountRuleModel(
            id=uuid.uuid4(),
            pricing_config_id=pricing_id,
            min_nights=7,
            discount_percent=10.0,
            discount_fixed=0,
        ))

        # Link amenities
        for amenity_name in prop_data["amenities"]:
            if amenity_name in amenity_map:
                session.add(PropertyAmenityModel(
                    property_id=prop_id,
                    amenity_id=amenity_map[amenity_name],
                ))

        print(f"  [+] Created property: {prop_data['name']} with pricing + amenities")

    await session.flush()
    return property_ids


async def seed_property_extras(
    session: AsyncSession, property_ids: list[uuid.UUID]
) -> None:
    if not property_ids:
        return

    print("\n--- Property Photos & Audit Logs ---")
    for idx, prop_id in enumerate(property_ids):
        existing_photo = await session.scalar(
            select(PropertyPhotoModel).where(PropertyPhotoModel.property_id == prop_id).limit(1)
        )
        if not existing_photo:
            for photo_idx, url in enumerate(PHOTO_URLS):
                session.add(PropertyPhotoModel(
                    id=uuid.uuid4(),
                    property_id=prop_id,
                    url=url,
                    sort_order=photo_idx,
                    is_cover=photo_idx == 0,
                ))
            print(f"  [+] Added photos for property #{idx + 1}")
        else:
            print(f"  [skip] Property photos already exist for property #{idx + 1}")

        existing_log = await session.scalar(
            select(PropertyAuditLogModel).where(PropertyAuditLogModel.property_id == prop_id).limit(1)
        )
        if not existing_log:
            session.add(PropertyAuditLogModel(
                id=uuid.uuid4(),
                property_id=prop_id,
                changed_by=TEST_USER_ID,
                field_name="*",
                old_value=None,
                new_value=None,
                action="create",
            ))
            session.add(PropertyAuditLogModel(
                id=uuid.uuid4(),
                property_id=prop_id,
                changed_by=TEST_USER_ID,
                field_name="description",
                old_value=None,
                new_value="Updated description for demo purposes",
                action="update",
            ))
            print(f"  [+] Added audit logs for property #{idx + 1}")
        else:
            print(f"  [skip] Property audit logs already exist for property #{idx + 1}")

    await session.flush()


async def seed_guests(session: AsyncSession) -> list[uuid.UUID]:
    """Create guests and return list of guest IDs."""
    guest_ids: list[uuid.UUID] = []

    for data in GUESTS:
        if await _exists(session, GuestModel, company_id=COMPANY_ID, phone=data["phone"]):
            result = await session.scalar(
                select(GuestModel).where(
                    GuestModel.company_id == COMPANY_ID,
                    GuestModel.phone == data["phone"],
                )
            )
            guest_ids.append(result.id)
            print(f"  [skip] Guest '{data['name']}' already exists")
            continue

        guest_id = uuid.uuid4()
        session.add(GuestModel(
            id=guest_id,
            company_id=COMPANY_ID,
            name=data["name"],
            phone=data["phone"],
            email=data["email"],
        ))
        guest_ids.append(guest_id)
        print(f"  [+] Created guest: {data['name']}")

    await session.flush()
    return guest_ids


async def seed_bookings(
    session: AsyncSession,
    property_ids: list[uuid.UUID],
    guest_ids: list[uuid.UUID],
) -> list[dict]:
    """Create bookings with various statuses, payments, and deposits."""

    # Check if bookings already exist for this company
    existing = await session.scalar(
        select(BookingModel).where(BookingModel.company_id == COMPANY_ID).limit(1)
    )
    if existing:
        rows = await session.execute(
            select(
                BookingModel.id,
                BookingModel.property_id,
                BookingModel.status,
                BookingModel.check_in,
                BookingModel.check_out,
            ).where(BookingModel.company_id == COMPANY_ID)
        )
        bookings_out = [
            {
                "id": row.id,
                "property_id": row.property_id,
                "status": row.status,
                "check_in": row.check_in,
                "check_out": row.check_out,
            }
            for row in rows
        ]
        print("  [skip] Bookings already exist, skipping...")
        return bookings_out

    bookings_data = [
        # Property 0 (Sunset Apartment) - 4 bookings
        {
            "property_idx": 0, "guest_idx": 0,
            "check_in": TODAY - timedelta(days=5), "check_out": TODAY - timedelta(days=1),
            "status": "completed", "source": "direct",
            "adults": 2, "children": 0, "price": 100000,
            "color": GANTT_COLORS[0],
        },
        {
            "property_idx": 0, "guest_idx": 1,
            "check_in": TODAY, "check_out": TODAY + timedelta(days=4),
            "status": "checked_in", "source": "booking",
            "adults": 2, "children": 1, "price": 106000,
            "color": GANTT_COLORS[1],
        },
        {
            "property_idx": 0, "guest_idx": 2,
            "check_in": TODAY + timedelta(days=6), "check_out": TODAY + timedelta(days=10),
            "status": "confirmed", "source": "airbnb",
            "adults": 1, "children": 0, "price": 100000,
            "color": GANTT_COLORS[2],
        },
        {
            "property_idx": 0, "guest_idx": 3,
            "check_in": TODAY + timedelta(days=15), "check_out": TODAY + timedelta(days=20),
            "status": "pending", "source": "direct",
            "adults": 2, "children": 2, "price": 128000,
            "color": GANTT_COLORS[3],
        },
        # Property 1 (Mountain House) - 4 bookings
        {
            "property_idx": 1, "guest_idx": 4,
            "check_in": TODAY - timedelta(days=3), "check_out": TODAY + timedelta(days=2),
            "status": "checked_in", "source": "direct",
            "adults": 4, "children": 2, "price": 260000,
            "color": GANTT_COLORS[4],
        },
        {
            "property_idx": 1, "guest_idx": 5,
            "check_in": TODAY + timedelta(days=5), "check_out": TODAY + timedelta(days=12),
            "status": "confirmed", "source": "booking",
            "adults": 3, "children": 1, "price": 350000,
            "color": GANTT_COLORS[5],
        },
        {
            "property_idx": 1, "guest_idx": 6,
            "check_in": TODAY + timedelta(days=18), "check_out": TODAY + timedelta(days=25),
            "status": "pending", "source": "airbnb",
            "adults": 6, "children": 0, "price": 410000,
            "color": GANTT_COLORS[6],
        },
        {
            "property_idx": 1, "guest_idx": 7,
            "check_in": TODAY - timedelta(days=10), "check_out": TODAY - timedelta(days=5),
            "status": "completed", "source": "direct",
            "adults": 2, "children": 0, "price": 250000,
            "color": GANTT_COLORS[0],
        },
        # Property 2 (City Studio) - 3 bookings
        {
            "property_idx": 2, "guest_idx": 8,
            "check_in": TODAY - timedelta(days=2), "check_out": TODAY + timedelta(days=1),
            "status": "checked_in", "source": "direct",
            "adults": 1, "children": 0, "price": 45000,
            "color": GANTT_COLORS[1],
        },
        {
            "property_idx": 2, "guest_idx": 9,
            "check_in": TODAY + timedelta(days=3), "check_out": TODAY + timedelta(days=7),
            "status": "confirmed", "source": "airbnb",
            "adults": 2, "children": 0, "price": 68000,
            "color": GANTT_COLORS[2],
        },
        {
            "property_idx": 2, "guest_idx": 0,
            "check_in": TODAY + timedelta(days=10), "check_out": TODAY + timedelta(days=14),
            "status": "pending", "source": "booking",
            "adults": 1, "children": 0, "price": 60000,
            "color": GANTT_COLORS[3],
        },
        # Property 3 (Beach Villa) - 4 bookings
        {
            "property_idx": 3, "guest_idx": 1,
            "check_in": TODAY - timedelta(days=7), "check_out": TODAY - timedelta(days=2),
            "status": "checked_out", "source": "direct",
            "adults": 3, "children": 2, "price": 229000,
            "color": GANTT_COLORS[4],
        },
        {
            "property_idx": 3, "guest_idx": 2,
            "check_in": TODAY + timedelta(days=1), "check_out": TODAY + timedelta(days=5),
            "status": "confirmed", "source": "booking",
            "adults": 2, "children": 1, "price": 184000,
            "color": GANTT_COLORS[5],
        },
        {
            "property_idx": 3, "guest_idx": 3,
            "check_in": TODAY + timedelta(days=8), "check_out": TODAY + timedelta(days=15),
            "status": "confirmed", "source": "airbnb",
            "adults": 4, "children": 0, "price": 365000,
            "color": GANTT_COLORS[6],
        },
        {
            "property_idx": 3, "guest_idx": 4,
            "check_in": TODAY + timedelta(days=20), "check_out": TODAY + timedelta(days=27),
            "status": "pending", "source": "direct",
            "adults": 3, "children": 3, "price": 380000,
            "color": GANTT_COLORS[0],
        },
        # Property 4 (Downtown Loft) - 3 bookings
        {
            "property_idx": 4, "guest_idx": 5,
            "check_in": TODAY - timedelta(days=1), "check_out": TODAY + timedelta(days=3),
            "status": "checked_in", "source": "booking",
            "adults": 2, "children": 0, "price": 126000,
            "color": GANTT_COLORS[1],
        },
        {
            "property_idx": 4, "guest_idx": 6,
            "check_in": TODAY + timedelta(days=5), "check_out": TODAY + timedelta(days=9),
            "status": "confirmed", "source": "direct",
            "adults": 1, "children": 0, "price": 120000,
            "color": GANTT_COLORS[2],
        },
        {
            "property_idx": 4, "guest_idx": 7,
            "check_in": TODAY + timedelta(days=12), "check_out": TODAY + timedelta(days=18),
            "status": "pending", "source": "airbnb",
            "adults": 2, "children": 1, "price": 189000,
            "color": GANTT_COLORS[3],
        },
    ]

    booking_ids: list[uuid.UUID] = []
    bookings_out: list[dict] = []
    for i, b in enumerate(bookings_data):
        booking_id = uuid.uuid4()
        session.add(BookingModel(
            id=booking_id,
            company_id=COMPANY_ID,
            property_id=property_ids[b["property_idx"]],
            guest_id=guest_ids[b["guest_idx"]],
            check_in=b["check_in"],
            check_out=b["check_out"],
            source=b["source"],
            status=b["status"],
            gantt_color=b["color"],
            total_price=b["price"],
            calculated_price=b["price"],
            adults_count=b["adults"],
            children_count=b["children"],
        ))
        booking_ids.append(booking_id)
        bookings_out.append({
            "id": booking_id,
            "property_id": property_ids[b["property_idx"]],
            "status": b["status"],
            "check_in": b["check_in"],
            "check_out": b["check_out"],
        })

        # Audit log for creation
        session.add(BookingAuditLogModel(
            id=uuid.uuid4(),
            booking_id=booking_id,
            field_name="*",
            action="create",
        ))

        print(f"  [+] Booking #{i+1}: {b['status']} ({b['source']}) "
              f"[{b['check_in']} → {b['check_out']}]")

    await session.flush()

    # Add payments to completed/checked_in/checked_out bookings
    print("\n--- Payments & Deposits ---")
    for i, b in enumerate(bookings_data):
        bid = booking_ids[i]
        if b["status"] in ("completed", "checked_in", "checked_out"):
            # Full payment
            session.add(BookingPaymentModel(
                id=uuid.uuid4(),
                booking_id=bid,
                amount=b["price"],
                type="payment",
                method="card" if i % 2 == 0 else "cash",
                status="completed",
                paid_at=datetime.utcnow() - timedelta(days=3),
            ))
            print(f"  [+] Payment for booking #{i+1}: {b['price']}")

        if b["status"] in ("confirmed", "checked_in"):
            # Deposit
            deposit_amount = b["price"] * 0.2
            deposit_status = "paid" if b["status"] == "checked_in" else "pending"
            session.add(BookingDepositModel(
                id=uuid.uuid4(),
                booking_id=bid,
                amount=deposit_amount,
                status=deposit_status,
            ))
            print(f"  [+] Deposit for booking #{i+1}: {deposit_amount} ({deposit_status})")

    await session.flush()
    print(f"\n  Total bookings created: {len(bookings_data)}")
    return bookings_out


async def seed_group_bookings(
    session: AsyncSession,
    bookings_out: list[dict],
) -> None:
    if not bookings_out:
        return

    existing = await session.scalar(
        select(GroupBookingModel).where(GroupBookingModel.company_id == COMPANY_ID).limit(1)
    )
    if existing:
        print("\n--- Group Bookings ---")
        print("  [skip] Group bookings already exist")
        return

    print("\n--- Group Bookings ---")
    group_id = uuid.uuid4()
    session.add(GroupBookingModel(
        id=group_id,
        company_id=COMPANY_ID,
        adults_count=4,
        children_count=2,
        status="confirmed",
        notes="Demo group booking",
    ))

    assign_ids = [b["id"] for b in bookings_out[:2]]
    for bid in assign_ids:
        await session.execute(
            update(BookingModel)
            .where(BookingModel.id == bid)
            .values(group_booking_id=group_id)
        )
        session.add(BookingAuditLogModel(
            id=uuid.uuid4(),
            booking_id=bid,
            changed_by=TEST_USER_ID,
            field_name="group_booking_id",
            old_value=None,
            new_value=str(group_id),
            action="update",
        ))

    print(f"  [+] Group booking created and linked to {len(assign_ids)} bookings")
    await session.flush()


async def seed_booking_extras(
    session: AsyncSession,
    bookings_out: list[dict],
) -> None:
    if not bookings_out:
        return

    print("\n--- Booking Files / Comments / Contracts ---")
    for idx, b in enumerate(bookings_out):
        booking_id = b["id"]

        if not await _exists(session, BookingFileModel, booking_id=booking_id):
            session.add(BookingFileModel(
                id=uuid.uuid4(),
                booking_id=booking_id,
                file_url=FILE_URLS[0],
                file_name=f"booking-{idx + 1}-passport.jpg",
                file_type="image/jpeg",
            ))
            session.add(BookingFileModel(
                id=uuid.uuid4(),
                booking_id=booking_id,
                file_url=FILE_URLS[1],
                file_name=f"booking-{idx + 1}-contract.pdf",
                file_type="application/pdf",
            ))
            print(f"  [+] Files for booking #{idx + 1}")
        else:
            print(f"  [skip] Files already exist for booking #{idx + 1}")

        if not await _exists(session, BookingCommentModel, booking_id=booking_id):
            session.add(BookingCommentModel(
                id=uuid.uuid4(),
                booking_id=booking_id,
                author_id=TEST_USER_ID,
                content="Demo comment: guest prefers late check-in.",
            ))
            print(f"  [+] Comment for booking #{idx + 1}")
        else:
            print(f"  [skip] Comments already exist for booking #{idx + 1}")

        if not await _exists(session, BookingContractModel, booking_id=booking_id):
            session.add(BookingContractModel(
                id=uuid.uuid4(),
                booking_id=booking_id,
                template_url="https://placehold.co/800x600?text=Contract+Template",
                generated_url="https://placehold.co/800x600?text=Generated+Contract",
                status="generated",
                signed_at=None,
            ))
            print(f"  [+] Contract for booking #{idx + 1}")
        else:
            print(f"  [skip] Contracts already exist for booking #{idx + 1}")

    await session.flush()


async def seed_cleaning_checklists(session: AsyncSession) -> list[uuid.UUID]:
    existing = await session.scalar(
        select(CleaningChecklistTemplateModel)
        .where(CleaningChecklistTemplateModel.company_id == COMPANY_ID)
        .limit(1)
    )
    if existing:
        rows = await session.execute(
            select(CleaningChecklistItemModel.id)
            .join(CleaningChecklistTemplateModel)
            .where(CleaningChecklistTemplateModel.company_id == COMPANY_ID)
        )
        return [row.id for row in rows]

    print("\n--- Cleaning Checklists ---")
    template_id = uuid.uuid4()
    session.add(CleaningChecklistTemplateModel(
        id=template_id,
        company_id=COMPANY_ID,
        name="Standard Turnover",
    ))

    items = [
        "Vacuum and mop floors",
        "Replace linens and towels",
        "Clean bathroom and mirrors",
        "Wipe kitchen surfaces",
        "Empty trash bins",
        "Check amenities & supplies",
    ]

    item_ids: list[uuid.UUID] = []
    for order, title in enumerate(items):
        item_id = uuid.uuid4()
        session.add(CleaningChecklistItemModel(
            id=item_id,
            template_id=template_id,
            title=title,
            sort_order=order,
        ))
        item_ids.append(item_id)

    deep_id = uuid.uuid4()
    session.add(CleaningChecklistTemplateModel(
        id=deep_id,
        company_id=COMPANY_ID,
        name="Deep Clean",
    ))
    for order, title in enumerate([
        "Clean inside appliances",
        "Wash windows",
        "Steam clean upholstery",
    ]):
        session.add(CleaningChecklistItemModel(
            id=uuid.uuid4(),
            template_id=deep_id,
            title=title,
            sort_order=order,
        ))

    print("  [+] Cleaning checklist templates and items created")
    await session.flush()
    return item_ids


async def seed_cleaning_tasks(
    session: AsyncSession,
    property_ids: list[uuid.UUID],
    bookings_out: list[dict],
) -> list[dict]:
    existing = await session.scalar(
        select(CleaningTaskModel).where(CleaningTaskModel.company_id == COMPANY_ID).limit(1)
    )
    if existing:
        rows = await session.execute(
            select(
                CleaningTaskModel.id,
                CleaningTaskModel.status,
                CleaningTaskModel.cleaner_id,
                CleaningTaskModel.scheduled_date,
            ).where(CleaningTaskModel.company_id == COMPANY_ID)
        )
        return [
            {
                "id": row.id,
                "status": row.status,
                "cleaner_id": row.cleaner_id,
                "scheduled_date": row.scheduled_date,
            }
            for row in rows
        ]

    if not property_ids:
        return []

    print("\n--- Cleaning Tasks ---")
    tasks_data = []

    def _safe_prop(idx: int) -> uuid.UUID:
        return property_ids[idx % len(property_ids)]

    if bookings_out:
        b0 = bookings_out[0]
        tasks_data.append({
            "property_id": b0["property_id"],
            "booking_id": b0["id"],
            "type": "post_checkout",
            "status": "done",
            "cleaner_id": CLEANER_IDS[0],
            "scheduled_date": b0["check_out"],
            "scheduled_time": time(11, 0),
            "started_at": datetime.utcnow() - timedelta(hours=3),
            "completed_at": datetime.utcnow() - timedelta(hours=1),
        })

    if len(bookings_out) > 1:
        b1 = bookings_out[1]
        tasks_data.append({
            "property_id": b1["property_id"],
            "booking_id": b1["id"],
            "type": "mid_stay",
            "status": "assigned",
            "cleaner_id": CLEANER_IDS[1],
            "scheduled_date": TODAY + timedelta(days=1),
            "scheduled_time": time(12, 0),
            "started_at": None,
            "completed_at": None,
        })

    tasks_data.extend([
        {
            "property_id": _safe_prop(2),
            "booking_id": None,
            "type": "on_demand",
            "status": "pending",
            "cleaner_id": None,
            "scheduled_date": TODAY + timedelta(days=2),
            "scheduled_time": time(14, 30),
            "started_at": None,
            "completed_at": None,
        },
        {
            "property_id": _safe_prop(3),
            "booking_id": None,
            "type": "post_checkout",
            "status": "in_progress",
            "cleaner_id": CLEANER_IDS[2],
            "scheduled_date": TODAY,
            "scheduled_time": time(10, 0),
            "started_at": datetime.utcnow() - timedelta(hours=1),
            "completed_at": None,
        },
    ])

    tasks_out: list[dict] = []
    for i, t in enumerate(tasks_data):
        task_id = uuid.uuid4()
        session.add(CleaningTaskModel(
            id=task_id,
            company_id=COMPANY_ID,
            property_id=t["property_id"],
            booking_id=t["booking_id"],
            cleaner_id=t["cleaner_id"],
            type=t["type"],
            status=t["status"],
            scheduled_date=t["scheduled_date"],
            scheduled_time=t["scheduled_time"],
            notes="Auto-generated test task",
            started_at=t["started_at"],
            completed_at=t["completed_at"],
        ))
        tasks_out.append({
            "id": task_id,
            "status": t["status"],
            "cleaner_id": t["cleaner_id"],
            "scheduled_date": t["scheduled_date"],
        })
        print(f"  [+] Cleaning task #{i + 1} ({t['status']})")

    await session.flush()
    return tasks_out


async def seed_cleaning_reports(
    session: AsyncSession,
    tasks_out: list[dict],
    checklist_item_ids: list[uuid.UUID],
) -> None:
    if not tasks_out:
        return

    print("\n--- Cleaning Reports ---")
    for idx, task in enumerate(tasks_out):
        if task["status"] != "done":
            continue

        existing = await session.scalar(
            select(CleaningReportModel).where(CleaningReportModel.task_id == task["id"]).limit(1)
        )
        if existing:
            print(f"  [skip] Report already exists for task #{idx + 1}")
            continue

        report_id = uuid.uuid4()
        cleaner_id = task["cleaner_id"] or CLEANER_IDS[0]
        session.add(CleaningReportModel(
            id=report_id,
            task_id=task["id"],
            cleaner_id=cleaner_id,
            status="submitted",
            notes="Demo report: all key areas cleaned.",
            submitted_at=datetime.utcnow(),
        ))

        for photo_idx in range(3):
            session.add(CleaningReportPhotoModel(
                id=uuid.uuid4(),
                report_id=report_id,
                url=f"https://placehold.co/800x600?text=Report+Photo+{photo_idx + 1}",
                room_type=["kitchen", "bathroom", "bedroom"][photo_idx],
                metadata_json={
                    "lat": 43.2389,
                    "lng": 76.8897,
                    "taken_at": datetime.utcnow().isoformat(),
                },
                metadata_verified=photo_idx == 0,
            ))

        for item_id in checklist_item_ids[:5]:
            session.add(CleaningReportChecklistModel(
                id=uuid.uuid4(),
                report_id=report_id,
                checklist_item_id=item_id,
                is_done=True,
                note=None,
            ))

        print(f"  [+] Report for task #{idx + 1}")

    await session.flush()


async def seed_cleaner_routes(
    session: AsyncSession,
    tasks_out: list[dict],
) -> None:
    if not tasks_out:
        return

    existing = await session.scalar(
        select(CleanerRouteModel).where(CleanerRouteModel.company_id == COMPANY_ID).limit(1)
    )
    if existing:
        print("\n--- Cleaner Routes ---")
        print("  [skip] Cleaner routes already exist")
        return

    task_ids = [str(t["id"]) for t in tasks_out[:3]]
    session.add(CleanerRouteModel(
        id=uuid.uuid4(),
        company_id=COMPANY_ID,
        cleaner_id=CLEANER_IDS[0],
        route_date=TODAY,
        ordered_task_ids=task_ids,
        route_polyline={"polyline": "abcd1234"},
    ))
    print("\n--- Cleaner Routes ---")
    print("  [+] Cleaner route created")
    await session.flush()


async def seed_cleaner_ratings(
    session: AsyncSession,
    tasks_out: list[dict],
) -> None:
    if not tasks_out:
        return

    existing = await session.scalar(
        select(CleanerRatingModel).where(CleanerRatingModel.company_id == COMPANY_ID).limit(1)
    )
    if existing:
        print("\n--- Cleaner Ratings ---")
        print("  [skip] Cleaner ratings already exist")
        return

    print("\n--- Cleaner Ratings ---")
    for task in tasks_out:
        if task["status"] != "done":
            continue
        session.add(CleanerRatingModel(
            id=uuid.uuid4(),
            company_id=COMPANY_ID,
            cleaner_id=task["cleaner_id"] or CLEANER_IDS[0],
            task_id=task["id"],
            rated_by=TEST_USER_ID,
            score=5,
            review="Great job, spotless and on time.",
            kpi_metrics={"speed": 5, "quality": 5, "attention_to_detail": 5},
        ))
    print("  [+] Ratings created for done tasks")
    await session.flush()


# ---------- Main ----------

async def main() -> None:
    print("=" * 50)
    print("  Day PMS - Seed Data Script")
    print("=" * 50)

    async with async_session() as session:
        try:
            print("\n--- Amenities ---")
            amenity_map = await seed_amenities(session)

            print("\n--- Properties ---")
            property_ids = await seed_properties(session, amenity_map)
            await seed_property_extras(session, property_ids)

            print("\n--- Guests ---")
            guest_ids = await seed_guests(session)

            print("\n--- Bookings ---")
            bookings_out = await seed_bookings(session, property_ids, guest_ids)
            await seed_group_bookings(session, bookings_out)
            await seed_booking_extras(session, bookings_out)

            checklist_item_ids = await seed_cleaning_checklists(session)
            tasks_out = await seed_cleaning_tasks(session, property_ids, bookings_out)
            await seed_cleaning_reports(session, tasks_out, checklist_item_ids)
            await seed_cleaner_routes(session, tasks_out)
            await seed_cleaner_ratings(session, tasks_out)

            await session.commit()
            print("\n" + "=" * 50)
            print("  Seed data created successfully!")
            print("=" * 50)
        except Exception as e:
            await session.rollback()
            print(f"\n[ERROR] Failed to seed: {e}")
            raise


if __name__ == "__main__":
    asyncio.run(main())
