"""Unit tests for booking application services."""

import uuid
from datetime import date, datetime
from decimal import Decimal

import pytest

from app.application.booking.change_booking_status import ChangeBookingStatusService
from app.application.booking.create_booking import CreateBookingInput, CreateBookingService
from app.application.booking.manage_deposits import ManageDepositsService
from app.application.booking.manage_payments import ManagePaymentsService
from app.application.booking.move_booking import MoveBookingService
from app.application.booking.price_calculator import PriceCalculatorService
from app.application.booking.update_booking import UpdateBookingInput, UpdateBookingService
from app.domain.booking.entities import (
    Booking,
    BookingAuditLog,
    BookingComment,
    BookingContract,
    BookingDeposit,
    BookingFile,
    BookingPayment,
    Guest,
)
from app.domain.booking.repositories import (
    BookingAuditLogRepository,
    BookingCommentRepository,
    BookingContractRepository,
    BookingDepositRepository,
    BookingFileRepository,
    BookingPaymentRepository,
    BookingRepository,
    GuestRepository,
)
from app.domain.booking.value_objects import (
    BookingAuditAction,
    BookingSource,
    BookingStatus,
    DepositStatus,
    PaymentMethod,
    PaymentStatus,
    PaymentType,
)
from app.domain.property.entities import DiscountRule, PricingConfig, Property, SeasonalPrice
from app.domain.property.repositories import (
    DiscountRuleRepository,
    PricingConfigRepository,
    PropertyRepository,
    SeasonalPriceRepository,
)
from app.domain.property.value_objects import PropertyStatus, PropertyType

# ---------- Constants ----------

COMPANY_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")
OTHER_COMPANY_ID = uuid.UUID("00000000-0000-0000-0000-000000000099")
USER_ID = uuid.UUID("00000000-0000-0000-0000-000000000002")


# ---------- Fake repositories ----------


class FakePropertyRepository(PropertyRepository):
    def __init__(self) -> None:
        self._properties: dict[uuid.UUID, Property] = {}

    async def get_by_id(self, property_id: uuid.UUID) -> Property | None:
        return self._properties.get(property_id)

    async def list_by_company(self, company_id, *, offset=0, limit=50, status=None, search=None):
        return [p for p in self._properties.values() if p.company_id == company_id]

    async def count_by_company(self, company_id):
        return sum(1 for p in self._properties.values() if p.company_id == company_id)

    async def save(self, prop):
        self._properties[prop.id] = prop
        return prop

    async def update(self, prop):
        self._properties[prop.id] = prop
        return prop

    async def exists_internal_name(self, company_id, internal_name, *, exclude_id=None):
        return any(
            p.company_id == company_id and p.internal_name == internal_name and p.id != exclude_id
            for p in self._properties.values()
        )

    async def find_next_clone_name(self, company_id, base_name):
        return f"{base_name}-1"


class FakeBookingRepository(BookingRepository):
    def __init__(self) -> None:
        self._bookings: dict[uuid.UUID, Booking] = {}

    async def create(self, booking: Booking) -> Booking:
        self._bookings[booking.id] = booking
        return booking

    async def get_by_id(self, booking_id: uuid.UUID) -> Booking | None:
        return self._bookings.get(booking_id)

    async def get_by_property_and_dates(self, property_id, check_in, check_out, *, exclude_id=None) -> list[Booking]:
        result = []
        for b in self._bookings.values():
            if b.property_id != property_id:
                continue
            if exclude_id and b.id == exclude_id:
                continue
            if b.status == BookingStatus.CANCELLED:
                continue
            # Overlap: check_in < b.check_out and check_out > b.check_in
            if b.check_in and b.check_out and check_in < b.check_out and check_out > b.check_in:
                result.append(b)
        return result

    async def list_by_company(
        self,
        company_id,
        *,
        offset=0,
        limit=50,
        status=None,
        property_id=None,
        source=None,
        search=None,
        date_from=None,
        date_to=None,
    ):
        result = [b for b in self._bookings.values() if b.company_id == company_id]
        if status is not None:
            result = [b for b in result if b.status == status]
        return result[offset : offset + limit]

    async def count_by_company(
        self, company_id, *, status=None, property_id=None, source=None, search=None, date_from=None, date_to=None
    ):
        result = [b for b in self._bookings.values() if b.company_id == company_id]
        if status is not None:
            result = [b for b in result if b.status == status]
        return len(result)

    async def list_by_property_date_range(self, property_id, start_date, end_date, *, company_id=None):
        return [
            b
            for b in self._bookings.values()
            if b.property_id == property_id
            and b.check_in
            and b.check_out
            and b.check_in < end_date
            and b.check_out > start_date
        ]

    async def list_by_company_date_range(self, company_id, start_date, end_date):
        return [
            b
            for b in self._bookings.values()
            if b.company_id == company_id
            and b.check_in
            and b.check_out
            and b.check_in < end_date
            and b.check_out > start_date
        ]

    async def update(self, booking: Booking) -> Booking:
        self._bookings[booking.id] = booking
        return booking


class FakeGuestRepository(GuestRepository):
    def __init__(self) -> None:
        self._guests: dict[uuid.UUID, Guest] = {}

    async def create(self, guest: Guest) -> Guest:
        self._guests[guest.id] = guest
        return guest

    async def get_by_id(self, guest_id: uuid.UUID) -> Guest | None:
        return self._guests.get(guest_id)

    async def get_by_company(self, company_id, *, offset=0, limit=50, search=None):
        return [g for g in self._guests.values() if g.company_id == company_id]

    async def count_by_company(self, company_id, *, search=None):
        return sum(1 for g in self._guests.values() if g.company_id == company_id)

    async def search_by_name_or_phone(self, company_id, query):
        return [
            g
            for g in self._guests.values()
            if g.company_id == company_id and (query.lower() in g.name.lower() or (g.phone and query in g.phone))
        ]

    async def find_by_phone(self, company_id: uuid.UUID, phone: str) -> Guest | None:
        for g in self._guests.values():
            if g.company_id == company_id and g.phone == phone:
                return g
        return None


class FakeBookingAuditLogRepository(BookingAuditLogRepository):
    def __init__(self) -> None:
        self._logs: list[BookingAuditLog] = []

    async def create(self, log: BookingAuditLog) -> BookingAuditLog:
        self._logs.append(log)
        return log

    async def list_by_booking(self, booking_id, *, offset=0, limit=50):
        return [log for log in self._logs if log.booking_id == booking_id][offset : offset + limit]


class FakeBookingPaymentRepository(BookingPaymentRepository):
    def __init__(self) -> None:
        self._payments: dict[uuid.UUID, BookingPayment] = {}

    async def create(self, payment: BookingPayment) -> BookingPayment:
        self._payments[payment.id] = payment
        return payment

    async def list_by_booking(self, booking_id: uuid.UUID) -> list[BookingPayment]:
        return [p for p in self._payments.values() if p.booking_id == booking_id]

    async def get_by_id(self, payment_id: uuid.UUID) -> BookingPayment | None:
        return self._payments.get(payment_id)


class FakeBookingDepositRepository(BookingDepositRepository):
    def __init__(self) -> None:
        self._deposits: dict[uuid.UUID, BookingDeposit] = {}

    async def create(self, deposit: BookingDeposit) -> BookingDeposit:
        self._deposits[deposit.id] = deposit
        return deposit

    async def get_by_booking(self, booking_id: uuid.UUID) -> list[BookingDeposit]:
        return [d for d in self._deposits.values() if d.booking_id == booking_id]

    async def get_by_id(self, deposit_id: uuid.UUID) -> BookingDeposit | None:
        return self._deposits.get(deposit_id)

    async def update(self, deposit: BookingDeposit) -> BookingDeposit:
        self._deposits[deposit.id] = deposit
        return deposit


class FakeBookingFileRepository(BookingFileRepository):
    def __init__(self) -> None:
        self._files: dict[uuid.UUID, BookingFile] = {}

    async def create(self, file: BookingFile) -> BookingFile:
        self._files[file.id] = file
        return file

    async def get_by_id(self, file_id: uuid.UUID) -> BookingFile | None:
        return self._files.get(file_id)

    async def list_by_booking(self, booking_id: uuid.UUID) -> list[BookingFile]:
        return [f for f in self._files.values() if f.booking_id == booking_id]

    async def delete(self, file_id: uuid.UUID) -> None:
        self._files.pop(file_id, None)


class FakeBookingCommentRepository(BookingCommentRepository):
    def __init__(self) -> None:
        self._comments: list[BookingComment] = []

    async def create(self, comment: BookingComment) -> BookingComment:
        self._comments.append(comment)
        return comment

    async def list_by_booking(self, booking_id: uuid.UUID) -> list[BookingComment]:
        return [c for c in self._comments if c.booking_id == booking_id]


class FakeBookingContractRepository(BookingContractRepository):
    def __init__(self) -> None:
        self._contracts: dict[uuid.UUID, BookingContract] = {}

    async def create(self, contract: BookingContract) -> BookingContract:
        self._contracts[contract.id] = contract
        return contract

    async def get_by_booking(self, booking_id: uuid.UUID) -> BookingContract | None:
        for c in self._contracts.values():
            if c.booking_id == booking_id:
                return c
        return None

    async def update(self, contract: BookingContract) -> BookingContract:
        self._contracts[contract.id] = contract
        return contract


class FakePricingConfigRepository(PricingConfigRepository):
    def __init__(self) -> None:
        self._configs: dict[uuid.UUID, PricingConfig] = {}

    async def get_by_property(self, property_id: uuid.UUID) -> PricingConfig | None:
        for c in self._configs.values():
            if c.property_id == property_id:
                return c
        return None

    async def save(self, config: PricingConfig) -> PricingConfig:
        self._configs[config.id] = config
        return config

    async def update(self, config: PricingConfig) -> PricingConfig:
        self._configs[config.id] = config
        return config


class FakeSeasonalPriceRepository(SeasonalPriceRepository):
    def __init__(self) -> None:
        self._prices: dict[uuid.UUID, SeasonalPrice] = {}

    async def list_by_pricing_config(self, pricing_config_id: uuid.UUID) -> list[SeasonalPrice]:
        return [p for p in self._prices.values() if p.pricing_config_id == pricing_config_id]

    async def save(self, price: SeasonalPrice) -> SeasonalPrice:
        self._prices[price.id] = price
        return price

    async def delete(self, price_id: uuid.UUID) -> None:
        self._prices.pop(price_id, None)


class FakeDiscountRuleRepository(DiscountRuleRepository):
    def __init__(self) -> None:
        self._rules: dict[uuid.UUID, DiscountRule] = {}

    async def list_by_pricing_config(self, pricing_config_id: uuid.UUID) -> list[DiscountRule]:
        return [r for r in self._rules.values() if r.pricing_config_id == pricing_config_id]

    async def save(self, rule: DiscountRule) -> DiscountRule:
        self._rules[rule.id] = rule
        return rule

    async def delete(self, rule_id: uuid.UUID) -> None:
        self._rules.pop(rule_id, None)


# ---------- Helpers ----------


def _make_property(
    company_id: uuid.UUID = COMPANY_ID,
    status: PropertyStatus = PropertyStatus.ACTIVE,
    name: str = "Test Prop",
    internal_name: str = "test-prop",
) -> Property:
    return Property(
        id=uuid.uuid4(),
        company_id=company_id,
        name=name,
        internal_name=internal_name,
        status=status,
        type=PropertyType.APARTMENT,
    )


def _to_checkin_dt(value: date | datetime) -> datetime:
    if isinstance(value, datetime):
        return value
    return datetime(value.year, value.month, value.day, 14, 0)


def _to_checkout_dt(value: date | datetime) -> datetime:
    if isinstance(value, datetime):
        return value
    return datetime(value.year, value.month, value.day, 12, 0)


def _make_booking(
    property_id: uuid.UUID,
    company_id: uuid.UUID = COMPANY_ID,
    check_in: date | None = None,
    check_out: date | None = None,
    status: BookingStatus = BookingStatus.PENDING,
    guest_id: uuid.UUID | None = None,
    **kwargs,
) -> Booking:
    # Daily bookings now store datetimes with default 14:00 / 12:00 clock times.
    return Booking(
        id=uuid.uuid4(),
        company_id=company_id,
        property_id=property_id,
        guest_id=guest_id or uuid.uuid4(),
        check_in=_to_checkin_dt(check_in or date(2025, 6, 1)),
        check_out=_to_checkout_dt(check_out or date(2025, 6, 5)),
        status=status,
        **kwargs,
    )


def _make_pricing_config(property_id: uuid.UUID, base_price: Decimal = Decimal("100")) -> PricingConfig:
    return PricingConfig(property_id=property_id, base_price=base_price)


def _build_price_calculator(pricing_repo=None, seasonal_repo=None, discount_repo=None) -> PriceCalculatorService:
    return PriceCalculatorService(
        pricing_repo or FakePricingConfigRepository(),
        seasonal_repo or FakeSeasonalPriceRepository(),
        discount_repo or FakeDiscountRuleRepository(),
    )


# ---------- TestPriceCalculatorService ----------


class TestPriceCalculatorService:
    @pytest.mark.asyncio
    async def test_base_price_simple(self):
        pricing_repo = FakePricingConfigRepository()
        prop_id = uuid.uuid4()
        pricing = PricingConfig(property_id=prop_id, base_price=Decimal("100"))
        await pricing_repo.save(pricing)
        svc = _build_price_calculator(pricing_repo=pricing_repo)

        result = await svc.calculate(prop_id, date(2025, 6, 2), date(2025, 6, 5), 1, 0)  # Mon-Thu

        assert result.nights == 3
        assert result.base_total == Decimal("300")
        assert result.total == Decimal("300")

    @pytest.mark.asyncio
    async def test_no_pricing_raises(self):
        svc = _build_price_calculator()

        with pytest.raises(ValueError, match="no pricing configuration"):
            await svc.calculate(uuid.uuid4(), date(2025, 6, 1), date(2025, 6, 3), 1, 0)

    @pytest.mark.asyncio
    async def test_invalid_dates_raises(self):
        pricing_repo = FakePricingConfigRepository()
        prop_id = uuid.uuid4()
        pricing = PricingConfig(property_id=prop_id, base_price=Decimal("100"))
        await pricing_repo.save(pricing)
        svc = _build_price_calculator(pricing_repo=pricing_repo)

        with pytest.raises(ValueError, match="Check-out must be after check-in"):
            await svc.calculate(prop_id, date(2025, 6, 5), date(2025, 6, 3), 1, 0)

    @pytest.mark.asyncio
    async def test_same_date_raises(self):
        pricing_repo = FakePricingConfigRepository()
        prop_id = uuid.uuid4()
        pricing = PricingConfig(property_id=prop_id, base_price=Decimal("100"))
        await pricing_repo.save(pricing)
        svc = _build_price_calculator(pricing_repo=pricing_repo)

        with pytest.raises(ValueError, match="Check-out must be after check-in"):
            await svc.calculate(prop_id, date(2025, 6, 5), date(2025, 6, 5), 1, 0)

    @pytest.mark.asyncio
    async def test_weekend_markup(self):
        pricing_repo = FakePricingConfigRepository()
        prop_id = uuid.uuid4()
        pricing = PricingConfig(
            property_id=prop_id,
            base_price=Decimal("100"),
            weekend_markup=Decimal("30"),
        )
        await pricing_repo.save(pricing)
        svc = _build_price_calculator(pricing_repo=pricing_repo)

        # 2025-06-06 is Friday, 2025-06-07 is Saturday
        result = await svc.calculate(prop_id, date(2025, 6, 6), date(2025, 6, 8), 1, 0)

        assert result.nights == 2
        assert result.weekend_surcharge == Decimal("60")  # 30 * 2
        assert result.total == Decimal("260")  # 200 + 60

    @pytest.mark.asyncio
    async def test_seasonal_price(self):
        pricing_repo = FakePricingConfigRepository()
        seasonal_repo = FakeSeasonalPriceRepository()
        prop_id = uuid.uuid4()
        pricing = PricingConfig(property_id=prop_id, base_price=Decimal("100"))
        await pricing_repo.save(pricing)
        seasonal = SeasonalPrice(
            pricing_config_id=pricing.id,
            name="Summer",
            start_date=date(2025, 6, 1),
            end_date=date(2025, 8, 31),
            price_per_night=Decimal("150"),
        )
        await seasonal_repo.save(seasonal)
        svc = _build_price_calculator(pricing_repo=pricing_repo, seasonal_repo=seasonal_repo)

        # Mon 2025-06-02 to Thu 2025-06-05 (3 nights, all in summer season)
        result = await svc.calculate(prop_id, date(2025, 6, 2), date(2025, 6, 5), 1, 0)

        assert result.nights == 3
        # seasonal_adjustment = (150-100) * 3 = 150
        assert result.seasonal_adjustment == Decimal("150")
        assert result.base_total == Decimal("300")  # base_price * 3
        assert result.total == Decimal("450")  # 300 + 150

    @pytest.mark.asyncio
    async def test_extra_guests_surcharge(self):
        pricing_repo = FakePricingConfigRepository()
        prop_id = uuid.uuid4()
        pricing = PricingConfig(
            property_id=prop_id,
            base_price=Decimal("100"),
            base_guests=2,
            extra_adult_price=Decimal("20"),
            extra_child_price=Decimal("10"),
        )
        await pricing_repo.save(pricing)
        svc = _build_price_calculator(pricing_repo=pricing_repo)

        # 3 adults (1 extra), 2 children, 2 nights (Mon-Wed)
        result = await svc.calculate(prop_id, date(2025, 6, 2), date(2025, 6, 4), 3, 2)

        assert result.nights == 2
        # extra adults: (3-2) * 20 * 2 = 40
        # extra children: 2 * 10 * 2 = 40
        assert result.extra_guest_surcharge == Decimal("80")
        assert result.total == Decimal("280")

    @pytest.mark.asyncio
    async def test_discount_percent(self):
        pricing_repo = FakePricingConfigRepository()
        discount_repo = FakeDiscountRuleRepository()
        prop_id = uuid.uuid4()
        pricing = PricingConfig(property_id=prop_id, base_price=Decimal("100"))
        await pricing_repo.save(pricing)
        discount = DiscountRule(
            pricing_config_id=pricing.id,
            min_nights=3,
            discount_percent=Decimal("10"),
        )
        await discount_repo.save(discount)
        svc = _build_price_calculator(pricing_repo=pricing_repo, discount_repo=discount_repo)

        # 5 nights Mon 2025-06-02 to Sat 2025-06-07 (includes Fri so 1 weekend night with 0 markup)
        result = await svc.calculate(prop_id, date(2025, 6, 2), date(2025, 6, 7), 1, 0)

        assert result.nights == 5
        assert result.discount_amount == Decimal("50")  # 10% of 500
        assert result.total == Decimal("450")

    @pytest.mark.asyncio
    async def test_discount_fixed(self):
        pricing_repo = FakePricingConfigRepository()
        discount_repo = FakeDiscountRuleRepository()
        prop_id = uuid.uuid4()
        pricing = PricingConfig(property_id=prop_id, base_price=Decimal("100"))
        await pricing_repo.save(pricing)
        discount = DiscountRule(
            pricing_config_id=pricing.id,
            min_nights=3,
            discount_fixed=Decimal("200"),
        )
        await discount_repo.save(discount)
        svc = _build_price_calculator(pricing_repo=pricing_repo, discount_repo=discount_repo)

        # 3 nights Mon-Thu
        result = await svc.calculate(prop_id, date(2025, 6, 2), date(2025, 6, 5), 1, 0)

        assert result.discount_amount == Decimal("200")
        assert result.total == Decimal("100")  # 300 - 200

    @pytest.mark.asyncio
    async def test_best_discount_chosen(self):
        """When multiple discounts apply, the one with highest min_nights is selected."""
        pricing_repo = FakePricingConfigRepository()
        discount_repo = FakeDiscountRuleRepository()
        prop_id = uuid.uuid4()
        pricing = PricingConfig(property_id=prop_id, base_price=Decimal("100"))
        await pricing_repo.save(pricing)
        await discount_repo.save(
            DiscountRule(pricing_config_id=pricing.id, min_nights=3, discount_percent=Decimal("5"))
        )
        await discount_repo.save(
            DiscountRule(pricing_config_id=pricing.id, min_nights=7, discount_percent=Decimal("15"))
        )
        svc = _build_price_calculator(pricing_repo=pricing_repo, discount_repo=discount_repo)

        # 10 nights Mon-Thu+
        result = await svc.calculate(prop_id, date(2025, 6, 2), date(2025, 6, 12), 1, 0)

        # Both apply (min_nights <= 10), but 7-night discount is best
        assert result.nights == 10
        # Some weekend surcharge would be 0 since markup is 0
        # base_total = 1000, discount = 15% of 1000 = 150
        assert result.discount_amount == Decimal("150")

    @pytest.mark.asyncio
    async def test_no_extra_guest_when_under_base(self):
        pricing_repo = FakePricingConfigRepository()
        prop_id = uuid.uuid4()
        pricing = PricingConfig(
            property_id=prop_id,
            base_price=Decimal("100"),
            base_guests=4,
            extra_adult_price=Decimal("20"),
        )
        await pricing_repo.save(pricing)
        svc = _build_price_calculator(pricing_repo=pricing_repo)

        result = await svc.calculate(prop_id, date(2025, 6, 2), date(2025, 6, 4), 2, 0)

        assert result.extra_guest_surcharge == Decimal("0")


# ---------- TestCreateBookingService ----------


class TestCreateBookingService:
    async def _setup(self, prop_status=PropertyStatus.ACTIVE, with_pricing=True):
        prop_repo = FakePropertyRepository()
        booking_repo = FakeBookingRepository()
        guest_repo = FakeGuestRepository()
        audit_repo = FakeBookingAuditLogRepository()
        pricing_repo = FakePricingConfigRepository()

        prop = _make_property(status=prop_status)
        await prop_repo.save(prop)

        if with_pricing:
            pricing = _make_pricing_config(prop.id)
            await pricing_repo.save(pricing)

        price_calc = _build_price_calculator(pricing_repo=pricing_repo)
        svc = CreateBookingService(booking_repo, guest_repo, prop_repo, audit_repo, price_calc)
        return booking_repo, guest_repo, audit_repo, svc, prop

    @pytest.mark.asyncio
    async def test_valid_create(self):
        _, _, _, svc, prop = await self._setup()

        result = await svc.execute(
            CreateBookingInput(
                company_id=COMPANY_ID,
                property_id=prop.id,
                guest_name="John Doe",
                guest_phone="+77001112233",
                check_in=date(2025, 6, 2),
                check_out=date(2025, 6, 5),
            )
        )

        assert result.property_id == prop.id
        assert result.status == BookingStatus.PENDING
        # Daily booking defaults to 14:00 check-in / 12:00 check-out.
        assert result.check_in == datetime(2025, 6, 2, 14, 0)
        assert result.check_out == datetime(2025, 6, 5, 12, 0)
        assert result.total_price > Decimal("0")

    @pytest.mark.asyncio
    async def test_auto_creates_guest(self):
        _, guest_repo, _, svc, prop = await self._setup()

        result = await svc.execute(
            CreateBookingInput(
                company_id=COMPANY_ID,
                property_id=prop.id,
                guest_name="Jane Doe",
                guest_email="jane@example.com",
                check_in=date(2025, 6, 2),
                check_out=date(2025, 6, 5),
            )
        )

        guest = await guest_repo.get_by_id(result.guest_id)
        assert guest is not None
        assert guest.name == "Jane Doe"
        assert guest.email == "jane@example.com"

    @pytest.mark.asyncio
    async def test_reuse_existing_guest_by_phone(self):
        _, guest_repo, _, svc, prop = await self._setup()
        existing_guest = Guest(company_id=COMPANY_ID, name="Existing", phone="+77001112233")
        await guest_repo.create(existing_guest)

        result = await svc.execute(
            CreateBookingInput(
                company_id=COMPANY_ID,
                property_id=prop.id,
                guest_name="New Name",
                guest_phone="+77001112233",
                check_in=date(2025, 6, 2),
                check_out=date(2025, 6, 5),
            )
        )

        assert result.guest_id == existing_guest.id

    @pytest.mark.asyncio
    async def test_overlap_raises(self):
        booking_repo, _, _, svc, prop = await self._setup()
        existing = _make_booking(prop.id, check_in=date(2025, 6, 1), check_out=date(2025, 6, 5))
        await booking_repo.create(existing)

        with pytest.raises(ValueError, match="overlaps"):
            await svc.execute(
                CreateBookingInput(
                    company_id=COMPANY_ID,
                    property_id=prop.id,
                    guest_name="Guest",
                    check_in=date(2025, 6, 3),
                    check_out=date(2025, 6, 7),
                )
            )

    @pytest.mark.asyncio
    async def test_adjacent_dates_allowed(self):
        booking_repo, _, _, svc, prop = await self._setup()
        existing = _make_booking(prop.id, check_in=date(2025, 6, 1), check_out=date(2025, 6, 5))
        await booking_repo.create(existing)

        # check_in = existing.check_out, no overlap
        result = await svc.execute(
            CreateBookingInput(
                company_id=COMPANY_ID,
                property_id=prop.id,
                guest_name="Guest",
                check_in=date(2025, 6, 5),
                check_out=date(2025, 6, 8),
            )
        )

        assert result.check_in == datetime(2025, 6, 5, 14, 0)

    @pytest.mark.asyncio
    async def test_property_not_found_raises(self):
        _, _, _, svc, _ = await self._setup()

        with pytest.raises(ValueError, match="Property not found"):
            await svc.execute(
                CreateBookingInput(
                    company_id=COMPANY_ID,
                    property_id=uuid.uuid4(),
                    guest_name="Guest",
                    check_in=date(2025, 6, 1),
                    check_out=date(2025, 6, 3),
                )
            )

    @pytest.mark.asyncio
    async def test_inactive_property_raises(self):
        _, _, _, svc, prop = await self._setup(prop_status=PropertyStatus.NEW)

        with pytest.raises(ValueError, match="not active"):
            await svc.execute(
                CreateBookingInput(
                    company_id=COMPANY_ID,
                    property_id=prop.id,
                    guest_name="Guest",
                    check_in=date(2025, 6, 1),
                    check_out=date(2025, 6, 3),
                )
            )

    @pytest.mark.asyncio
    async def test_paused_property_raises(self):
        _, _, _, svc, prop = await self._setup(prop_status=PropertyStatus.PAUSED)

        with pytest.raises(ValueError, match="not active"):
            await svc.execute(
                CreateBookingInput(
                    company_id=COMPANY_ID,
                    property_id=prop.id,
                    guest_name="Guest",
                    check_in=date(2025, 6, 1),
                    check_out=date(2025, 6, 3),
                )
            )

    @pytest.mark.asyncio
    async def test_wrong_company_raises(self):
        prop_repo = FakePropertyRepository()
        booking_repo = FakeBookingRepository()
        guest_repo = FakeGuestRepository()
        audit_repo = FakeBookingAuditLogRepository()
        pricing_repo = FakePricingConfigRepository()
        prop = _make_property(company_id=OTHER_COMPANY_ID)
        await prop_repo.save(prop)
        price_calc = _build_price_calculator(pricing_repo=pricing_repo)
        svc = CreateBookingService(booking_repo, guest_repo, prop_repo, audit_repo, price_calc)

        with pytest.raises(ValueError, match="does not belong"):
            await svc.execute(
                CreateBookingInput(
                    company_id=COMPANY_ID,
                    property_id=prop.id,
                    guest_name="Guest",
                    check_in=date(2025, 6, 1),
                    check_out=date(2025, 6, 3),
                )
            )

    @pytest.mark.asyncio
    async def test_missing_dates_raises(self):
        _, _, _, svc, prop = await self._setup()

        with pytest.raises(ValueError, match="required"):
            await svc.execute(
                CreateBookingInput(
                    company_id=COMPANY_ID,
                    property_id=prop.id,
                    guest_name="Guest",
                )
            )

    @pytest.mark.asyncio
    async def test_checkout_before_checkin_raises(self):
        _, _, _, svc, prop = await self._setup()

        with pytest.raises(ValueError, match="Check-out must be after check-in"):
            await svc.execute(
                CreateBookingInput(
                    company_id=COMPANY_ID,
                    property_id=prop.id,
                    guest_name="Guest",
                    check_in=date(2025, 6, 5),
                    check_out=date(2025, 6, 2),
                )
            )

    @pytest.mark.asyncio
    async def test_creates_audit_log(self):
        _, _, audit_repo, svc, prop = await self._setup()

        result = await svc.execute(
            CreateBookingInput(
                company_id=COMPANY_ID,
                property_id=prop.id,
                guest_name="Guest",
                check_in=date(2025, 6, 2),
                check_out=date(2025, 6, 5),
                changed_by=USER_ID,
            )
        )

        logs = await audit_repo.list_by_booking(result.id)
        assert len(logs) == 1
        assert logs[0].action == BookingAuditAction.CREATE
        assert logs[0].changed_by == USER_ID

    @pytest.mark.asyncio
    async def test_booking_source(self):
        _, _, _, svc, prop = await self._setup()

        result = await svc.execute(
            CreateBookingInput(
                company_id=COMPANY_ID,
                property_id=prop.id,
                guest_name="Guest",
                check_in=date(2025, 6, 2),
                check_out=date(2025, 6, 5),
                source=BookingSource.AIRBNB,
            )
        )

        assert result.source == BookingSource.AIRBNB

    @pytest.mark.asyncio
    async def test_gantt_color(self):
        _, _, _, svc, prop = await self._setup()

        result = await svc.execute(
            CreateBookingInput(
                company_id=COMPANY_ID,
                property_id=prop.id,
                guest_name="Guest",
                check_in=date(2025, 6, 2),
                check_out=date(2025, 6, 5),
                gantt_color="#FF0000",
            )
        )

        assert result.gantt_color == "#FF0000"


# ---------- TestUpdateBookingService ----------


class TestUpdateBookingService:
    async def _setup(self):
        booking_repo = FakeBookingRepository()
        audit_repo = FakeBookingAuditLogRepository()
        pricing_repo = FakePricingConfigRepository()
        prop_id = uuid.uuid4()
        pricing = _make_pricing_config(prop_id)
        await pricing_repo.save(pricing)
        price_calc = _build_price_calculator(pricing_repo=pricing_repo)
        svc = UpdateBookingService(booking_repo, audit_repo, price_calc)
        booking = _make_booking(prop_id, total_price=Decimal("300"), calculated_price=Decimal("300"))
        await booking_repo.create(booking)
        return booking_repo, audit_repo, svc, booking, prop_id

    @pytest.mark.asyncio
    async def test_update_notes(self):
        _, _, svc, booking, _ = await self._setup()

        result = await svc.execute(
            UpdateBookingInput(
                booking_id=booking.id,
                company_id=COMPANY_ID,
                notes="Updated notes",
            )
        )

        assert result.notes == "Updated notes"

    @pytest.mark.asyncio
    async def test_update_creates_audit_log(self):
        _, audit_repo, svc, booking, _ = await self._setup()

        await svc.execute(
            UpdateBookingInput(
                booking_id=booking.id,
                company_id=COMPANY_ID,
                notes="New notes",
                changed_by=USER_ID,
            )
        )

        logs = await audit_repo.list_by_booking(booking.id)
        assert len(logs) == 1
        assert logs[0].action == BookingAuditAction.UPDATE
        assert logs[0].field_name == "notes"
        assert logs[0].changed_by == USER_ID

    @pytest.mark.asyncio
    async def test_not_found_raises(self):
        _, _, svc, _, _ = await self._setup()

        with pytest.raises(ValueError, match="Booking not found"):
            await svc.execute(
                UpdateBookingInput(
                    booking_id=uuid.uuid4(),
                    company_id=COMPANY_ID,
                    notes="X",
                )
            )

    @pytest.mark.asyncio
    async def test_wrong_company_raises(self):
        _, _, svc, booking, _ = await self._setup()

        with pytest.raises(ValueError, match="does not belong"):
            await svc.execute(
                UpdateBookingInput(
                    booking_id=booking.id,
                    company_id=OTHER_COMPANY_ID,
                    notes="X",
                )
            )

    @pytest.mark.asyncio
    async def test_overlap_check_on_date_change(self):
        booking_repo, _, svc, booking, prop_id = await self._setup()
        # Add another booking that would overlap
        other = _make_booking(prop_id, check_in=date(2025, 6, 10), check_out=date(2025, 6, 15))
        await booking_repo.create(other)

        with pytest.raises(ValueError, match="overlaps"):
            await svc.execute(
                UpdateBookingInput(
                    booking_id=booking.id,
                    company_id=COMPANY_ID,
                    check_in=date(2025, 6, 12),
                    check_out=date(2025, 6, 17),
                )
            )

    @pytest.mark.asyncio
    async def test_update_dates_recalculates_price(self):
        _, _, svc, booking, _ = await self._setup()
        old_calc_price = booking.calculated_price

        result = await svc.execute(
            UpdateBookingInput(
                booking_id=booking.id,
                company_id=COMPANY_ID,
                check_in=date(2025, 7, 1),
                check_out=date(2025, 7, 10),
            )
        )

        # Price should be recalculated because dates changed
        assert result.check_in == datetime(2025, 7, 1, 14, 0)
        assert result.check_out == datetime(2025, 7, 10, 12, 0)
        # calculated_price should have changed (9 nights * 100 = 900)
        assert result.calculated_price == Decimal("900")
        assert result.calculated_price != old_calc_price

    @pytest.mark.asyncio
    async def test_update_checkout_before_checkin_raises(self):
        _, _, svc, booking, _ = await self._setup()

        with pytest.raises(ValueError, match="Check-out must be after check-in"):
            await svc.execute(
                UpdateBookingInput(
                    booking_id=booking.id,
                    company_id=COMPANY_ID,
                    check_in=date(2025, 6, 10),
                    check_out=date(2025, 6, 5),
                )
            )

    @pytest.mark.asyncio
    async def test_update_gantt_color(self):
        _, _, svc, booking, _ = await self._setup()

        result = await svc.execute(
            UpdateBookingInput(
                booking_id=booking.id,
                company_id=COMPANY_ID,
                gantt_color="#00FF00",
            )
        )

        assert result.gantt_color == "#00FF00"

    @pytest.mark.asyncio
    async def test_update_total_price_override(self):
        _, _, svc, booking, _ = await self._setup()

        result = await svc.execute(
            UpdateBookingInput(
                booking_id=booking.id,
                company_id=COMPANY_ID,
                total_price=Decimal("999"),
            )
        )

        assert result.total_price == Decimal("999")

    @pytest.mark.asyncio
    async def test_update_source(self):
        _, _, svc, booking, _ = await self._setup()

        result = await svc.execute(
            UpdateBookingInput(
                booking_id=booking.id,
                company_id=COMPANY_ID,
                source="airbnb",
            )
        )

        assert result.source == BookingSource.AIRBNB

    @pytest.mark.asyncio
    async def test_multiple_audit_logs_for_multiple_fields(self):
        _, audit_repo, svc, booking, _ = await self._setup()

        await svc.execute(
            UpdateBookingInput(
                booking_id=booking.id,
                company_id=COMPANY_ID,
                notes="New",
                gantt_color="#FF0000",
                changed_by=USER_ID,
            )
        )

        logs = await audit_repo.list_by_booking(booking.id)
        fields = {log.field_name for log in logs}
        assert "notes" in fields
        assert "gantt_color" in fields


# ---------- TestChangeBookingStatusService ----------


class TestChangeBookingStatusService:
    async def _setup(self, initial_status=BookingStatus.PENDING):
        booking_repo = FakeBookingRepository()
        audit_repo = FakeBookingAuditLogRepository()
        prop_id = uuid.uuid4()
        booking = _make_booking(prop_id, status=initial_status)
        await booking_repo.create(booking)
        svc = ChangeBookingStatusService(booking_repo, audit_repo)
        return booking_repo, audit_repo, svc, booking

    @pytest.mark.asyncio
    async def test_pending_to_confirmed(self):
        _, _, svc, booking = await self._setup(BookingStatus.PENDING)
        result = await svc.execute(booking.id, COMPANY_ID, BookingStatus.CONFIRMED)
        assert result.status == BookingStatus.CONFIRMED

    @pytest.mark.asyncio
    async def test_confirmed_to_checked_in(self):
        _, _, svc, booking = await self._setup(BookingStatus.CONFIRMED)
        result = await svc.execute(booking.id, COMPANY_ID, BookingStatus.CHECKED_IN)
        assert result.status == BookingStatus.CHECKED_IN

    @pytest.mark.asyncio
    async def test_checked_in_to_checked_out(self):
        _, _, svc, booking = await self._setup(BookingStatus.CHECKED_IN)
        result = await svc.execute(booking.id, COMPANY_ID, BookingStatus.CHECKED_OUT)
        assert result.status == BookingStatus.CHECKED_OUT

    @pytest.mark.asyncio
    async def test_checked_out_to_completed(self):
        _, _, svc, booking = await self._setup(BookingStatus.CHECKED_OUT)
        result = await svc.execute(booking.id, COMPANY_ID, BookingStatus.COMPLETED)
        assert result.status == BookingStatus.COMPLETED

    @pytest.mark.asyncio
    async def test_full_lifecycle(self):
        booking_repo = FakeBookingRepository()
        audit_repo = FakeBookingAuditLogRepository()
        prop_id = uuid.uuid4()
        booking = _make_booking(prop_id, status=BookingStatus.PENDING)
        await booking_repo.create(booking)
        svc = ChangeBookingStatusService(booking_repo, audit_repo)

        b = await svc.execute(booking.id, COMPANY_ID, BookingStatus.CONFIRMED)
        b = await svc.execute(booking.id, COMPANY_ID, BookingStatus.CHECKED_IN)
        b = await svc.execute(booking.id, COMPANY_ID, BookingStatus.CHECKED_OUT)
        b = await svc.execute(booking.id, COMPANY_ID, BookingStatus.COMPLETED)

        assert b.status == BookingStatus.COMPLETED
        logs = await audit_repo.list_by_booking(booking.id)
        assert len(logs) == 4

    @pytest.mark.asyncio
    async def test_pending_to_cancelled(self):
        _, _, svc, booking = await self._setup(BookingStatus.PENDING)
        result = await svc.execute(booking.id, COMPANY_ID, BookingStatus.CANCELLED)
        assert result.status == BookingStatus.CANCELLED

    @pytest.mark.asyncio
    async def test_confirmed_to_cancelled(self):
        _, _, svc, booking = await self._setup(BookingStatus.CONFIRMED)
        result = await svc.execute(booking.id, COMPANY_ID, BookingStatus.CANCELLED)
        assert result.status == BookingStatus.CANCELLED

    @pytest.mark.asyncio
    async def test_checked_in_cannot_cancel(self):
        _, _, svc, booking = await self._setup(BookingStatus.CHECKED_IN)

        with pytest.raises(ValueError, match="Cannot transition"):
            await svc.execute(booking.id, COMPANY_ID, BookingStatus.CANCELLED)

    @pytest.mark.asyncio
    async def test_completed_cannot_transition(self):
        _, _, svc, booking = await self._setup(BookingStatus.COMPLETED)

        with pytest.raises(ValueError, match="Cannot transition"):
            await svc.execute(booking.id, COMPANY_ID, BookingStatus.PENDING)

    @pytest.mark.asyncio
    async def test_invalid_pending_to_checked_in(self):
        _, _, svc, booking = await self._setup(BookingStatus.PENDING)

        with pytest.raises(ValueError, match="Cannot transition"):
            await svc.execute(booking.id, COMPANY_ID, BookingStatus.CHECKED_IN)

    @pytest.mark.asyncio
    async def test_invalid_pending_to_completed(self):
        _, _, svc, booking = await self._setup(BookingStatus.PENDING)

        with pytest.raises(ValueError, match="Cannot transition"):
            await svc.execute(booking.id, COMPANY_ID, BookingStatus.COMPLETED)

    @pytest.mark.asyncio
    async def test_creates_audit_log(self):
        _, audit_repo, svc, booking = await self._setup(BookingStatus.PENDING)
        await svc.execute(booking.id, COMPANY_ID, BookingStatus.CONFIRMED, changed_by=USER_ID)

        logs = await audit_repo.list_by_booking(booking.id)
        assert len(logs) == 1
        assert logs[0].action == BookingAuditAction.STATUS_CHANGE
        assert logs[0].old_value == "pending"
        assert logs[0].new_value == "confirmed"
        assert logs[0].changed_by == USER_ID

    @pytest.mark.asyncio
    async def test_not_found_raises(self):
        booking_repo = FakeBookingRepository()
        audit_repo = FakeBookingAuditLogRepository()
        svc = ChangeBookingStatusService(booking_repo, audit_repo)

        with pytest.raises(ValueError, match="Booking not found"):
            await svc.execute(uuid.uuid4(), COMPANY_ID, BookingStatus.CONFIRMED)

    @pytest.mark.asyncio
    async def test_wrong_company_raises(self):
        _, _, svc, booking = await self._setup()

        with pytest.raises(ValueError, match="does not belong"):
            await svc.execute(booking.id, OTHER_COMPANY_ID, BookingStatus.CONFIRMED)

    @pytest.mark.asyncio
    async def test_cancelled_cannot_transition(self):
        _, _, svc, booking = await self._setup(BookingStatus.CANCELLED)

        with pytest.raises(ValueError, match="Cannot transition"):
            await svc.execute(booking.id, COMPANY_ID, BookingStatus.PENDING)


# ---------- TestMoveBookingService ----------


class TestMoveBookingService:
    async def _setup(self):
        booking_repo = FakeBookingRepository()
        prop_repo = FakePropertyRepository()
        audit_repo = FakeBookingAuditLogRepository()
        prop_a = _make_property(name="Prop A", internal_name="prop-a")
        prop_b = _make_property(name="Prop B", internal_name="prop-b")
        await prop_repo.save(prop_a)
        await prop_repo.save(prop_b)
        booking = _make_booking(prop_a.id)
        await booking_repo.create(booking)
        svc = MoveBookingService(booking_repo, prop_repo, audit_repo)
        return booking_repo, prop_repo, audit_repo, svc, booking, prop_a, prop_b

    @pytest.mark.asyncio
    async def test_move_booking(self):
        _, _, _, svc, booking, prop_a, prop_b = await self._setup()

        result = await svc.execute(booking.id, COMPANY_ID, prop_b.id)

        assert result.property_id == prop_b.id

    @pytest.mark.asyncio
    async def test_move_creates_audit_log(self):
        _, _, audit_repo, svc, booking, prop_a, prop_b = await self._setup()

        await svc.execute(booking.id, COMPANY_ID, prop_b.id, changed_by=USER_ID)

        logs = await audit_repo.list_by_booking(booking.id)
        assert len(logs) == 1
        assert logs[0].action == BookingAuditAction.MOVE
        assert logs[0].field_name == "property_id"
        assert logs[0].old_value == str(prop_a.id)
        assert logs[0].new_value == str(prop_b.id)
        assert logs[0].changed_by == USER_ID

    @pytest.mark.asyncio
    async def test_move_overlap_on_target_raises(self):
        booking_repo, _, _, svc, booking, _, prop_b = await self._setup()
        # Create conflicting booking on prop_b
        conflicting = _make_booking(
            prop_b.id,
            check_in=booking.check_in,
            check_out=booking.check_out,
        )
        await booking_repo.create(conflicting)

        with pytest.raises(ValueError, match="overlaps"):
            await svc.execute(booking.id, COMPANY_ID, prop_b.id)

    @pytest.mark.asyncio
    async def test_target_not_found_raises(self):
        _, _, _, svc, booking, _, _ = await self._setup()

        with pytest.raises(ValueError, match="Target property not found"):
            await svc.execute(booking.id, COMPANY_ID, uuid.uuid4())

    @pytest.mark.asyncio
    async def test_target_inactive_raises(self):
        _, prop_repo, _, svc, booking, _, _ = await self._setup()
        inactive = _make_property(name="Inactive", internal_name="inactive-1", status=PropertyStatus.PAUSED)
        await prop_repo.save(inactive)

        with pytest.raises(ValueError, match="not active"):
            await svc.execute(booking.id, COMPANY_ID, inactive.id)

    @pytest.mark.asyncio
    async def test_target_wrong_company_raises(self):
        _, prop_repo, _, svc, booking, _, _ = await self._setup()
        other_prop = _make_property(company_id=OTHER_COMPANY_ID, name="Other", internal_name="other-1")
        await prop_repo.save(other_prop)

        with pytest.raises(ValueError, match="does not belong"):
            await svc.execute(booking.id, COMPANY_ID, other_prop.id)

    @pytest.mark.asyncio
    async def test_booking_not_found_raises(self):
        _, prop_repo, _, svc, _, _, prop_b = await self._setup()

        with pytest.raises(ValueError, match="Booking not found"):
            await svc.execute(uuid.uuid4(), COMPANY_ID, prop_b.id)

    @pytest.mark.asyncio
    async def test_booking_wrong_company_raises(self):
        _, _, _, svc, booking, _, prop_b = await self._setup()

        with pytest.raises(ValueError, match="does not belong"):
            await svc.execute(booking.id, OTHER_COMPANY_ID, prop_b.id)


# ---------- TestManagePaymentsService ----------


class TestManagePaymentsService:
    async def _setup(self):
        booking_repo = FakeBookingRepository()
        payment_repo = FakeBookingPaymentRepository()
        prop_id = uuid.uuid4()
        booking = _make_booking(prop_id)
        await booking_repo.create(booking)
        svc = ManagePaymentsService(booking_repo, payment_repo)
        return booking_repo, payment_repo, svc, booking

    @pytest.mark.asyncio
    async def test_add_payment(self):
        _, _, svc, booking = await self._setup()

        result = await svc.add_payment(
            booking.id,
            COMPANY_ID,
            Decimal("500"),
            PaymentType.PAYMENT,
            PaymentMethod.CASH,
        )

        assert result.booking_id == booking.id
        assert result.amount == Decimal("500")
        assert result.type == PaymentType.PAYMENT
        assert result.method == PaymentMethod.CASH
        assert result.status == PaymentStatus.COMPLETED

    @pytest.mark.asyncio
    async def test_add_refund(self):
        _, _, svc, booking = await self._setup()

        result = await svc.add_payment(
            booking.id,
            COMPANY_ID,
            Decimal("100"),
            PaymentType.REFUND,
            PaymentMethod.TRANSFER,
            note="Partial refund",
        )

        assert result.type == PaymentType.REFUND
        assert result.note == "Partial refund"

    @pytest.mark.asyncio
    async def test_list_payments(self):
        _, _, svc, booking = await self._setup()
        await svc.add_payment(booking.id, COMPANY_ID, Decimal("500"), PaymentType.PAYMENT, PaymentMethod.CASH)
        await svc.add_payment(booking.id, COMPANY_ID, Decimal("300"), PaymentType.PAYMENT, PaymentMethod.CARD)

        result = await svc.list_payments(booking.id, COMPANY_ID)
        assert len(result) == 2

    @pytest.mark.asyncio
    async def test_add_payment_booking_not_found(self):
        _, _, svc, _ = await self._setup()

        with pytest.raises(ValueError, match="Booking not found"):
            await svc.add_payment(uuid.uuid4(), COMPANY_ID, Decimal("100"), PaymentType.PAYMENT, PaymentMethod.CASH)

    @pytest.mark.asyncio
    async def test_add_payment_wrong_company(self):
        _, _, svc, booking = await self._setup()

        with pytest.raises(ValueError, match="does not belong"):
            await svc.add_payment(booking.id, OTHER_COMPANY_ID, Decimal("100"), PaymentType.PAYMENT, PaymentMethod.CASH)

    @pytest.mark.asyncio
    async def test_list_payments_wrong_company(self):
        _, _, svc, booking = await self._setup()

        with pytest.raises(ValueError, match="does not belong"):
            await svc.list_payments(booking.id, OTHER_COMPANY_ID)

    @pytest.mark.asyncio
    async def test_list_payments_not_found(self):
        _, _, svc, _ = await self._setup()

        with pytest.raises(ValueError, match="Booking not found"):
            await svc.list_payments(uuid.uuid4(), COMPANY_ID)

    @pytest.mark.asyncio
    async def test_payment_with_note(self):
        _, _, svc, booking = await self._setup()

        result = await svc.add_payment(
            booking.id,
            COMPANY_ID,
            Decimal("100"),
            PaymentType.PAYMENT,
            PaymentMethod.CARD,
            note="First installment",
        )

        assert result.note == "First installment"

    @pytest.mark.asyncio
    async def test_payment_has_paid_at(self):
        _, _, svc, booking = await self._setup()

        result = await svc.add_payment(booking.id, COMPANY_ID, Decimal("100"), PaymentType.PAYMENT, PaymentMethod.CASH)

        assert result.paid_at is not None


# ---------- TestManageDepositsService ----------


class TestManageDepositsService:
    async def _setup(self):
        booking_repo = FakeBookingRepository()
        deposit_repo = FakeBookingDepositRepository()
        prop_id = uuid.uuid4()
        booking = _make_booking(prop_id)
        await booking_repo.create(booking)
        svc = ManageDepositsService(booking_repo, deposit_repo)
        return booking_repo, deposit_repo, svc, booking

    @pytest.mark.asyncio
    async def test_create_deposit(self):
        _, _, svc, booking = await self._setup()

        result = await svc.create_deposit(booking.id, COMPANY_ID, Decimal("500"))

        assert result.booking_id == booking.id
        assert result.amount == Decimal("500")
        assert result.status == DepositStatus.PENDING

    @pytest.mark.asyncio
    async def test_pay_deposit(self):
        _, _, svc, booking = await self._setup()
        deposit = await svc.create_deposit(booking.id, COMPANY_ID, Decimal("500"))

        result = await svc.perform_action(booking.id, deposit.id, COMPANY_ID, "pay")

        assert result.status == DepositStatus.PAID

    @pytest.mark.asyncio
    async def test_return_deposit(self):
        _, _, svc, booking = await self._setup()
        deposit = await svc.create_deposit(booking.id, COMPANY_ID, Decimal("500"))
        await svc.perform_action(booking.id, deposit.id, COMPANY_ID, "pay")

        result = await svc.perform_action(booking.id, deposit.id, COMPANY_ID, "return")

        assert result.status == DepositStatus.RETURNED

    @pytest.mark.asyncio
    async def test_hold_deposit(self):
        _, _, svc, booking = await self._setup()
        deposit = await svc.create_deposit(booking.id, COMPANY_ID, Decimal("500"))
        await svc.perform_action(booking.id, deposit.id, COMPANY_ID, "pay")

        result = await svc.perform_action(booking.id, deposit.id, COMPANY_ID, "hold", reason="Broken lamp")

        assert result.status == DepositStatus.HELD
        assert result.held_amount == Decimal("500")
        assert result.reason == "Broken lamp"

    @pytest.mark.asyncio
    async def test_partial_hold(self):
        _, _, svc, booking = await self._setup()
        deposit = await svc.create_deposit(booking.id, COMPANY_ID, Decimal("500"))
        await svc.perform_action(booking.id, deposit.id, COMPANY_ID, "pay")

        result = await svc.perform_action(
            booking.id, deposit.id, COMPANY_ID, "partial_hold", held_amount=Decimal("200"), reason="Minor damage"
        )

        assert result.status == DepositStatus.PARTIALLY_HELD
        assert result.held_amount == Decimal("200")
        assert result.reason == "Minor damage"

    @pytest.mark.asyncio
    async def test_partial_hold_requires_amount(self):
        _, _, svc, booking = await self._setup()
        deposit = await svc.create_deposit(booking.id, COMPANY_ID, Decimal("500"))
        await svc.perform_action(booking.id, deposit.id, COMPANY_ID, "pay")

        with pytest.raises(ValueError, match="held_amount is required"):
            await svc.perform_action(booking.id, deposit.id, COMPANY_ID, "partial_hold")

    @pytest.mark.asyncio
    async def test_partial_hold_zero_amount_raises(self):
        _, _, svc, booking = await self._setup()
        deposit = await svc.create_deposit(booking.id, COMPANY_ID, Decimal("500"))
        await svc.perform_action(booking.id, deposit.id, COMPANY_ID, "pay")

        with pytest.raises(ValueError, match="held_amount is required"):
            await svc.perform_action(
                booking.id,
                deposit.id,
                COMPANY_ID,
                "partial_hold",
                held_amount=Decimal("0"),
            )

    @pytest.mark.asyncio
    async def test_partial_hold_exceeds_amount_raises(self):
        _, _, svc, booking = await self._setup()
        deposit = await svc.create_deposit(booking.id, COMPANY_ID, Decimal("500"))
        await svc.perform_action(booking.id, deposit.id, COMPANY_ID, "pay")

        with pytest.raises(ValueError, match="cannot exceed"):
            await svc.perform_action(
                booking.id,
                deposit.id,
                COMPANY_ID,
                "partial_hold",
                held_amount=Decimal("600"),
            )

    @pytest.mark.asyncio
    async def test_invalid_transition_pending_to_returned(self):
        _, _, svc, booking = await self._setup()
        deposit = await svc.create_deposit(booking.id, COMPANY_ID, Decimal("500"))

        with pytest.raises(ValueError, match="Cannot transition"):
            await svc.perform_action(booking.id, deposit.id, COMPANY_ID, "return")

    @pytest.mark.asyncio
    async def test_invalid_transition_pending_to_held(self):
        _, _, svc, booking = await self._setup()
        deposit = await svc.create_deposit(booking.id, COMPANY_ID, Decimal("500"))

        with pytest.raises(ValueError, match="Cannot transition"):
            await svc.perform_action(booking.id, deposit.id, COMPANY_ID, "hold")

    @pytest.mark.asyncio
    async def test_unknown_action_raises(self):
        _, _, svc, booking = await self._setup()
        deposit = await svc.create_deposit(booking.id, COMPANY_ID, Decimal("500"))

        with pytest.raises(ValueError, match="Unknown action"):
            await svc.perform_action(booking.id, deposit.id, COMPANY_ID, "freeze")

    @pytest.mark.asyncio
    async def test_booking_not_found_create(self):
        _, _, svc, _ = await self._setup()

        with pytest.raises(ValueError, match="Booking not found"):
            await svc.create_deposit(uuid.uuid4(), COMPANY_ID, Decimal("100"))

    @pytest.mark.asyncio
    async def test_booking_wrong_company_create(self):
        _, _, svc, booking = await self._setup()

        with pytest.raises(ValueError, match="does not belong"):
            await svc.create_deposit(booking.id, OTHER_COMPANY_ID, Decimal("100"))

    @pytest.mark.asyncio
    async def test_deposit_not_found_action(self):
        _, _, svc, booking = await self._setup()

        with pytest.raises(ValueError, match="Deposit not found"):
            await svc.perform_action(booking.id, uuid.uuid4(), COMPANY_ID, "pay")

    @pytest.mark.asyncio
    async def test_deposit_wrong_booking(self):
        booking_repo, _, svc, booking = await self._setup()
        deposit = await svc.create_deposit(booking.id, COMPANY_ID, Decimal("500"))

        other_booking = _make_booking(uuid.uuid4())
        await booking_repo.create(other_booking)

        with pytest.raises(ValueError, match="does not belong to booking"):
            await svc.perform_action(other_booking.id, deposit.id, COMPANY_ID, "pay")

    @pytest.mark.asyncio
    async def test_list_deposits(self):
        _, _, svc, booking = await self._setup()
        await svc.create_deposit(booking.id, COMPANY_ID, Decimal("500"))
        await svc.create_deposit(booking.id, COMPANY_ID, Decimal("300"))

        result = await svc.list_deposits(booking.id, COMPANY_ID)
        assert len(result) == 2

    @pytest.mark.asyncio
    async def test_list_deposits_not_found(self):
        _, _, svc, _ = await self._setup()

        with pytest.raises(ValueError, match="Booking not found"):
            await svc.list_deposits(uuid.uuid4(), COMPANY_ID)

    @pytest.mark.asyncio
    async def test_list_deposits_wrong_company(self):
        _, _, svc, booking = await self._setup()

        with pytest.raises(ValueError, match="does not belong"):
            await svc.list_deposits(booking.id, OTHER_COMPANY_ID)

    @pytest.mark.asyncio
    async def test_full_deposit_lifecycle(self):
        """pending -> paid -> returned"""
        _, _, svc, booking = await self._setup()
        deposit = await svc.create_deposit(booking.id, COMPANY_ID, Decimal("500"))
        assert deposit.status == DepositStatus.PENDING

        deposit = await svc.perform_action(booking.id, deposit.id, COMPANY_ID, "pay")
        assert deposit.status == DepositStatus.PAID

        deposit = await svc.perform_action(booking.id, deposit.id, COMPANY_ID, "return")
        assert deposit.status == DepositStatus.RETURNED
