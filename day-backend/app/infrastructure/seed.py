"""Seed script for development database.

Run with: uv run python -m app.infrastructure.seed
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.database import async_session
from app.infrastructure.models.booking import (
    BookingAuditLogModel,
    BookingDepositModel,
    BookingModel,
    BookingPaymentModel,
    GuestModel,
)
from app.infrastructure.models.property import (
    AmenityModel,
    DiscountRuleModel,
    PricingConfigModel,
    PropertyAmenityModel,
    PropertyModel,
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
        "name": "Sunset Apartment",
        "internal_name": "sunset-apt",
        "type": "apartment",
        "status": "active",
        "address_full": "123 Sunset Blvd, Los Angeles, CA",
        "rooms": 2,
        "beds": 4,
        "area_total": 85.0,
        "area_living": 65.0,
        "description": "A beautiful sunset-facing apartment with modern amenities.",
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
        "name": "Mountain House",
        "internal_name": "mountain-house",
        "type": "house",
        "status": "active",
        "address_full": "45 Pine Ridge Rd, Aspen, CO",
        "rooms": 4,
        "beds": 8,
        "area_total": 200.0,
        "area_living": 150.0,
        "description": "Spacious mountain retreat with stunning views.",
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
        "name": "City Studio",
        "internal_name": "city-studio",
        "type": "room",
        "status": "active",
        "address_full": "789 Main St, Apt 3B, New York, NY",
        "rooms": 1,
        "beds": 2,
        "area_total": 35.0,
        "area_living": 28.0,
        "description": "Compact studio in the heart of the city.",
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
        "name": "Beach Villa",
        "internal_name": "beach-villa",
        "type": "house",
        "status": "active",
        "address_full": "12 Ocean Drive, Miami, FL",
        "rooms": 3,
        "beds": 6,
        "area_total": 160.0,
        "area_living": 120.0,
        "description": "Luxurious beachfront villa with private access.",
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
        "name": "Downtown Loft",
        "internal_name": "downtown-loft",
        "type": "apartment",
        "status": "active",
        "address_full": "456 Broadway, San Francisco, CA",
        "rooms": 2,
        "beds": 3,
        "area_total": 75.0,
        "area_living": 55.0,
        "description": "Modern loft with open floor plan downtown.",
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
    {"name": "John Smith", "phone": "+1-555-0101", "email": "john.smith@example.com"},
    {"name": "Maria Garcia", "phone": "+1-555-0102", "email": "maria.garcia@example.com"},
    {"name": "James Wilson", "phone": "+1-555-0103", "email": "james.wilson@example.com"},
    {"name": "Sarah Johnson", "phone": "+1-555-0104", "email": "sarah.johnson@example.com"},
    {"name": "Michael Brown", "phone": "+1-555-0105", "email": "michael.brown@example.com"},
    {"name": "Emily Davis", "phone": "+1-555-0106", "email": "emily.davis@example.com"},
    {"name": "Robert Taylor", "phone": "+1-555-0107", "email": "robert.taylor@example.com"},
    {"name": "Lisa Anderson", "phone": "+1-555-0108", "email": "lisa.anderson@example.com"},
    {"name": "David Martinez", "phone": "+1-555-0109", "email": "david.martinez@example.com"},
    {"name": "Jennifer Thomas", "phone": "+1-555-0110", "email": "jennifer.thomas@example.com"},
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
) -> None:
    """Create bookings with various statuses, payments, and deposits."""

    # Check if bookings already exist for this company
    existing = await session.scalar(
        select(BookingModel).where(BookingModel.company_id == COMPANY_ID).limit(1)
    )
    if existing:
        print("  [skip] Bookings already exist, skipping...")
        return

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

            print("\n--- Guests ---")
            guest_ids = await seed_guests(session)

            print("\n--- Bookings ---")
            await seed_bookings(session, property_ids, guest_ids)

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
