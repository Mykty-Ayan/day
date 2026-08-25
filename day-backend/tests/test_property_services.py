"""Unit tests for property application services."""

import uuid
from datetime import date
from decimal import Decimal

import pytest

from app.application.property.change_status import ChangePropertyStatusService
from app.application.property.create_property import CreatePropertyInput, CreatePropertyService
from app.application.property.get_property import GetPropertyService, PropertyDetail
from app.application.property.list_properties import ListPropertiesService
from app.application.property.manage_amenities import ManageAmenitiesService
from app.application.property.manage_photos import ManagePhotosService
from app.application.property.manage_pricing import ManagePricingService, PricingConfigInput
from app.application.property.update_property import UpdatePropertyInput, UpdatePropertyService
from app.domain.property.entities import (
    Amenity,
    DiscountRule,
    PricingConfig,
    Property,
    PropertyAuditLog,
    PropertyPhoto,
    SeasonalPrice,
)
from app.domain.property.repositories import (
    AmenityRepository,
    DiscountRuleRepository,
    PricingConfigRepository,
    PropertyAuditLogRepository,
    PropertyPhotoRepository,
    PropertyRepository,
    SeasonalPriceRepository,
)
from app.domain.property.value_objects import AmenityCategory, AuditAction, PropertyStatus, PropertyType

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

    async def list_by_company(
        self,
        company_id: uuid.UUID,
        *,
        offset: int = 0,
        limit: int = 50,
        status: PropertyStatus | None = None,
        search: str | None = None,
    ) -> list[Property]:
        result = [p for p in self._properties.values() if p.company_id == company_id]
        if status is not None:
            result = [p for p in result if p.status == status]
        if search is not None:
            q = search.lower()
            result = [p for p in result if q in p.name.lower() or q in p.internal_name.lower()]
        return result[offset : offset + limit]

    async def count_by_company(self, company_id: uuid.UUID) -> int:
        return sum(1 for p in self._properties.values() if p.company_id == company_id)

    async def save(self, prop: Property) -> Property:
        self._properties[prop.id] = prop
        return prop

    async def update(self, prop: Property) -> Property:
        self._properties[prop.id] = prop
        return prop

    async def exists_internal_name(
        self, company_id: uuid.UUID, internal_name: str, *, exclude_id: uuid.UUID | None = None
    ) -> bool:
        return any(
            p.company_id == company_id and p.internal_name == internal_name and p.id != exclude_id
            for p in self._properties.values()
        )

    async def find_next_clone_name(self, company_id: uuid.UUID, base_name: str) -> str:
        import re

        existing = [
            p.internal_name
            for p in self._properties.values()
            if p.company_id == company_id and p.internal_name.startswith(base_name)
        ]
        max_suffix = 0
        for name in existing:
            m = re.search(r"-(\d+)$", name)
            if m:
                max_suffix = max(max_suffix, int(m.group(1)))
        return f"{base_name}-{max_suffix + 1}"


class FakePropertyAuditLogRepository(PropertyAuditLogRepository):
    def __init__(self) -> None:
        self._logs: list[PropertyAuditLog] = []

    async def list_by_property(
        self,
        property_id: uuid.UUID,
        *,
        offset: int = 0,
        limit: int = 50,
    ) -> list[PropertyAuditLog]:
        return [log for log in self._logs if log.property_id == property_id][offset : offset + limit]

    async def save(self, log: PropertyAuditLog) -> PropertyAuditLog:
        self._logs.append(log)
        return log


class FakePropertyPhotoRepository(PropertyPhotoRepository):
    def __init__(self) -> None:
        self._photos: dict[uuid.UUID, PropertyPhoto] = {}

    async def list_by_property(self, property_id: uuid.UUID) -> list[PropertyPhoto]:
        return sorted(
            [p for p in self._photos.values() if p.property_id == property_id],
            key=lambda p: p.sort_order,
        )

    async def save(self, photo: PropertyPhoto) -> PropertyPhoto:
        self._photos[photo.id] = photo
        return photo

    async def delete(self, photo_id: uuid.UUID) -> None:
        self._photos.pop(photo_id, None)

    async def reorder(self, property_id: uuid.UUID, photo_ids: list[uuid.UUID]) -> None:
        for idx, pid in enumerate(photo_ids):
            if pid in self._photos:
                self._photos[pid].sort_order = idx


class FakeAmenityRepository(AmenityRepository):
    def __init__(self) -> None:
        self._amenities: dict[uuid.UUID, Amenity] = {}
        self._property_amenities: dict[uuid.UUID, list[uuid.UUID]] = {}

    async def list_all(self) -> list[Amenity]:
        return list(self._amenities.values())

    async def get_by_id(self, amenity_id: uuid.UUID) -> Amenity | None:
        return self._amenities.get(amenity_id)

    async def save(self, amenity: Amenity) -> Amenity:
        self._amenities[amenity.id] = amenity
        return amenity

    async def set_property_amenities(self, property_id: uuid.UUID, amenity_ids: list[uuid.UUID]) -> None:
        self._property_amenities[property_id] = amenity_ids

    async def get_property_amenities(self, property_id: uuid.UUID) -> list[Amenity]:
        ids = self._property_amenities.get(property_id, [])
        return [self._amenities[aid] for aid in ids if aid in self._amenities]


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
    name: str = "Test Property",
    internal_name: str = "test-property",
    status: PropertyStatus = PropertyStatus.ACTIVE,
    **kwargs,
) -> Property:
    return Property(
        id=uuid.uuid4(),
        company_id=company_id,
        name=name,
        internal_name=internal_name,
        status=status,
        **kwargs,
    )


# ---------- TestCreatePropertyService ----------


class TestCreatePropertyService:
    @pytest.mark.asyncio
    async def test_valid_create(self):
        prop_repo = FakePropertyRepository()
        audit_repo = FakePropertyAuditLogRepository()
        svc = CreatePropertyService(prop_repo, audit_repo)

        result = await svc.execute(
            CreatePropertyInput(
                company_id=COMPANY_ID,
                name="Beach Villa",
                internal_name="beach-villa",
                type=PropertyType.APARTMENT,
            )
        )

        assert result.id is not None
        assert result.name == "Beach Villa"
        assert result.internal_name == "beach-villa"
        assert result.type == PropertyType.APARTMENT
        assert result.status == PropertyStatus.NEW
        assert result.company_id == COMPANY_ID

    @pytest.mark.asyncio
    async def test_stores_wifi_credentials(self):
        prop_repo = FakePropertyRepository()
        audit_repo = FakePropertyAuditLogRepository()
        svc = CreatePropertyService(prop_repo, audit_repo)

        result = await svc.execute(
            CreatePropertyInput(
                company_id=COMPANY_ID,
                name="Auezov City 28",
                internal_name="28auc",
                type=PropertyType.APARTMENT,
                wifi_name="Home 28",
                wifi_password="1234554321",
            )
        )

        saved = await prop_repo.get_by_id(result.id)
        assert saved is not None
        assert saved.wifi_name == "Home 28"
        assert saved.wifi_password == "1234554321"

    @pytest.mark.asyncio
    async def test_duplicate_internal_name_raises(self):
        prop_repo = FakePropertyRepository()
        audit_repo = FakePropertyAuditLogRepository()
        svc = CreatePropertyService(prop_repo, audit_repo)

        await svc.execute(
            CreatePropertyInput(
                company_id=COMPANY_ID,
                name="First",
                internal_name="dup-name",
                type=PropertyType.APARTMENT,
            )
        )

        with pytest.raises(ValueError, match="already exists"):
            await svc.execute(
                CreatePropertyInput(
                    company_id=COMPANY_ID,
                    name="Second",
                    internal_name="dup-name",
                    type=PropertyType.APARTMENT,
                )
            )

    @pytest.mark.asyncio
    async def test_cross_company_same_internal_name_allowed(self):
        prop_repo = FakePropertyRepository()
        audit_repo = FakePropertyAuditLogRepository()
        svc = CreatePropertyService(prop_repo, audit_repo)

        await svc.execute(
            CreatePropertyInput(
                company_id=COMPANY_ID,
                name="First",
                internal_name="shared-name",
                type=PropertyType.APARTMENT,
            )
        )
        result = await svc.execute(
            CreatePropertyInput(
                company_id=OTHER_COMPANY_ID,
                name="Second",
                internal_name="shared-name",
                type=PropertyType.HOUSE,
            )
        )

        assert result.company_id == OTHER_COMPANY_ID
        assert result.internal_name == "shared-name"

    @pytest.mark.asyncio
    async def test_creates_audit_log(self):
        prop_repo = FakePropertyRepository()
        audit_repo = FakePropertyAuditLogRepository()
        svc = CreatePropertyService(prop_repo, audit_repo)

        result = await svc.execute(
            CreatePropertyInput(
                company_id=COMPANY_ID,
                name="Villa",
                internal_name="villa-1",
                type=PropertyType.HOUSE,
                changed_by=USER_ID,
            )
        )

        logs = await audit_repo.list_by_property(result.id)
        assert len(logs) == 1
        assert logs[0].action == AuditAction.CREATE
        assert logs[0].changed_by == USER_ID
        assert logs[0].field_name == "*"

    @pytest.mark.asyncio
    async def test_all_fields_populated(self):
        prop_repo = FakePropertyRepository()
        audit_repo = FakePropertyAuditLogRepository()
        svc = CreatePropertyService(prop_repo, audit_repo)

        result = await svc.execute(
            CreatePropertyInput(
                company_id=COMPANY_ID,
                name="Full Property",
                internal_name="full-prop",
                type=PropertyType.ROOM,
                description="A nice room",
                source_url="https://example.com",
                latitude=43.23,
                longitude=76.95,
                address_full="123 Main St",
                apartment_number="42",
                entrance="A",
                block="3",
                floor=5,
                rooms=3,
                beds=4,
                area_living=50.0,
                area_total=80.0,
                check_in_instructions="Key in lockbox",
                check_out_instructions="Leave key on table",
                house_rules="No smoking",
            )
        )

        assert result.type == PropertyType.ROOM
        assert result.description == "A nice room"
        assert result.source_url == "https://example.com"
        assert result.latitude == 43.23
        assert result.longitude == 76.95
        assert result.address_full == "123 Main St"
        assert result.apartment_number == "42"
        assert result.entrance == "A"
        assert result.block == "3"
        assert result.floor == 5
        assert result.rooms == 3
        assert result.beds == 4
        assert result.area_living == 50.0
        assert result.area_total == 80.0
        assert result.check_in_instructions == "Key in lockbox"
        assert result.check_out_instructions == "Leave key on table"
        assert result.house_rules == "No smoking"

    @pytest.mark.asyncio
    async def test_persistence_in_repo(self):
        prop_repo = FakePropertyRepository()
        audit_repo = FakePropertyAuditLogRepository()
        svc = CreatePropertyService(prop_repo, audit_repo)

        result = await svc.execute(
            CreatePropertyInput(
                company_id=COMPANY_ID,
                name="Persisted",
                internal_name="persisted-1",
                type=PropertyType.APARTMENT,
            )
        )

        saved = await prop_repo.get_by_id(result.id)
        assert saved is not None
        assert saved.name == "Persisted"


# ---------- TestUpdatePropertyService ----------


class TestUpdatePropertyService:
    async def _setup(self):
        prop_repo = FakePropertyRepository()
        audit_repo = FakePropertyAuditLogRepository()
        prop = _make_property(status=PropertyStatus.ACTIVE)
        await prop_repo.save(prop)
        svc = UpdatePropertyService(prop_repo, audit_repo)
        return prop_repo, audit_repo, svc, prop

    @pytest.mark.asyncio
    async def test_partial_update_name(self):
        prop_repo, audit_repo, svc, prop = await self._setup()

        result = await svc.execute(
            UpdatePropertyInput(
                property_id=prop.id,
                company_id=COMPANY_ID,
                name="New Name",
            )
        )

        assert result.name == "New Name"
        assert result.internal_name == prop.internal_name  # unchanged

    @pytest.mark.asyncio
    async def test_update_wifi_credentials(self):
        prop_repo, _, svc, prop = await self._setup()

        result = await svc.execute(
            UpdatePropertyInput(
                property_id=prop.id,
                company_id=COMPANY_ID,
                wifi_name="Home 64",
                wifi_password="rotated",
            )
        )

        assert result.wifi_name == "Home 64"
        assert result.wifi_password == "rotated"
        assert result.name == prop.name  # unchanged

    @pytest.mark.asyncio
    async def test_update_creates_audit_log(self):
        prop_repo, audit_repo, svc, prop = await self._setup()

        await svc.execute(
            UpdatePropertyInput(
                property_id=prop.id,
                company_id=COMPANY_ID,
                name="Updated Name",
                changed_by=USER_ID,
            )
        )

        logs = await audit_repo.list_by_property(prop.id)
        assert len(logs) == 1
        assert logs[0].action == AuditAction.UPDATE
        assert logs[0].field_name == "name"
        assert logs[0].new_value == "Updated Name"
        assert logs[0].changed_by == USER_ID

    @pytest.mark.asyncio
    async def test_not_found_raises(self):
        prop_repo = FakePropertyRepository()
        audit_repo = FakePropertyAuditLogRepository()
        svc = UpdatePropertyService(prop_repo, audit_repo)

        with pytest.raises(ValueError, match="Property not found"):
            await svc.execute(
                UpdatePropertyInput(
                    property_id=uuid.uuid4(),
                    company_id=COMPANY_ID,
                    name="X",
                )
            )

    @pytest.mark.asyncio
    async def test_wrong_company_raises(self):
        prop_repo, audit_repo, svc, prop = await self._setup()

        with pytest.raises(ValueError, match="Property not found"):
            await svc.execute(
                UpdatePropertyInput(
                    property_id=prop.id,
                    company_id=OTHER_COMPANY_ID,
                    name="X",
                )
            )

    @pytest.mark.asyncio
    async def test_archived_property_raises(self):
        prop_repo = FakePropertyRepository()
        audit_repo = FakePropertyAuditLogRepository()
        prop = _make_property(status=PropertyStatus.ARCHIVED)
        await prop_repo.save(prop)
        svc = UpdatePropertyService(prop_repo, audit_repo)

        with pytest.raises(ValueError, match="Cannot update an archived property"):
            await svc.execute(
                UpdatePropertyInput(
                    property_id=prop.id,
                    company_id=COMPANY_ID,
                    name="X",
                )
            )

    @pytest.mark.asyncio
    async def test_duplicate_internal_name_raises(self):
        prop_repo = FakePropertyRepository()
        audit_repo = FakePropertyAuditLogRepository()
        prop1 = _make_property(internal_name="first")
        prop2 = _make_property(internal_name="second")
        await prop_repo.save(prop1)
        await prop_repo.save(prop2)
        svc = UpdatePropertyService(prop_repo, audit_repo)

        with pytest.raises(ValueError, match="already exists"):
            await svc.execute(
                UpdatePropertyInput(
                    property_id=prop2.id,
                    company_id=COMPANY_ID,
                    internal_name="first",
                )
            )

    @pytest.mark.asyncio
    async def test_update_same_internal_name_no_error(self):
        """Updating a property with its own internal name should not raise."""
        prop_repo, audit_repo, svc, prop = await self._setup()

        result = await svc.execute(
            UpdatePropertyInput(
                property_id=prop.id,
                company_id=COMPANY_ID,
                internal_name=prop.internal_name,
            )
        )

        assert result.internal_name == prop.internal_name

    @pytest.mark.asyncio
    async def test_update_multiple_fields(self):
        prop_repo, audit_repo, svc, prop = await self._setup()

        result = await svc.execute(
            UpdatePropertyInput(
                property_id=prop.id,
                company_id=COMPANY_ID,
                name="Updated",
                rooms=5,
                beds=8,
                changed_by=USER_ID,
            )
        )

        assert result.name == "Updated"
        assert result.rooms == 5
        assert result.beds == 8
        logs = await audit_repo.list_by_property(prop.id)
        changed_fields = {log.field_name for log in logs}
        assert "name" in changed_fields
        assert "rooms" in changed_fields
        assert "beds" in changed_fields

    @pytest.mark.asyncio
    async def test_no_change_no_audit(self):
        """If the new value is the same as old, no audit log is created."""
        prop_repo, audit_repo, svc, prop = await self._setup()

        await svc.execute(
            UpdatePropertyInput(
                property_id=prop.id,
                company_id=COMPANY_ID,
                name=prop.name,
            )
        )

        logs = await audit_repo.list_by_property(prop.id)
        assert len(logs) == 0

    @pytest.mark.asyncio
    async def test_update_type_field(self):
        prop_repo, audit_repo, svc, prop = await self._setup()

        result = await svc.execute(
            UpdatePropertyInput(
                property_id=prop.id,
                company_id=COMPANY_ID,
                type=PropertyType.HOUSE,
            )
        )

        assert result.type == PropertyType.HOUSE

    @pytest.mark.asyncio
    async def test_update_description_to_none(self):
        prop_repo = FakePropertyRepository()
        audit_repo = FakePropertyAuditLogRepository()
        prop = _make_property(description="Old description")
        await prop_repo.save(prop)
        svc = UpdatePropertyService(prop_repo, audit_repo)

        result = await svc.execute(
            UpdatePropertyInput(
                property_id=prop.id,
                company_id=COMPANY_ID,
                description=None,
            )
        )

        assert result.description is None


# ---------- TestGetPropertyService ----------


class TestGetPropertyService:
    def _create_service(
        self,
        prop_repo=None,
        photo_repo=None,
        amenity_repo=None,
        pricing_repo=None,
        seasonal_repo=None,
        discount_repo=None,
        audit_repo=None,
    ):
        return GetPropertyService(
            prop_repo or FakePropertyRepository(),
            photo_repo or FakePropertyPhotoRepository(),
            amenity_repo or FakeAmenityRepository(),
            pricing_repo or FakePricingConfigRepository(),
            seasonal_repo or FakeSeasonalPriceRepository(),
            discount_repo or FakeDiscountRuleRepository(),
            audit_repo or FakePropertyAuditLogRepository(),
        )

    @pytest.mark.asyncio
    async def test_returns_property_detail(self):
        prop_repo = FakePropertyRepository()
        prop = _make_property()
        await prop_repo.save(prop)
        svc = self._create_service(prop_repo=prop_repo)

        result = await svc.execute(prop.id, COMPANY_ID)

        assert isinstance(result, PropertyDetail)
        assert result.property.id == prop.id
        assert result.photos == []
        assert result.amenities == []
        assert result.pricing is None
        assert result.seasonal_prices == []
        assert result.discount_rules == []

    @pytest.mark.asyncio
    async def test_not_found_raises(self):
        svc = self._create_service()

        with pytest.raises(ValueError, match="Property not found"):
            await svc.execute(uuid.uuid4(), COMPANY_ID)

    @pytest.mark.asyncio
    async def test_wrong_company_raises(self):
        prop_repo = FakePropertyRepository()
        prop = _make_property(company_id=OTHER_COMPANY_ID)
        await prop_repo.save(prop)
        svc = self._create_service(prop_repo=prop_repo)

        with pytest.raises(ValueError, match="Property not found"):
            await svc.execute(prop.id, COMPANY_ID)

    @pytest.mark.asyncio
    async def test_with_photos(self):
        prop_repo = FakePropertyRepository()
        photo_repo = FakePropertyPhotoRepository()
        prop = _make_property()
        await prop_repo.save(prop)
        photo = PropertyPhoto(property_id=prop.id, url="https://img.com/1.jpg", sort_order=0)
        await photo_repo.save(photo)
        svc = self._create_service(prop_repo=prop_repo, photo_repo=photo_repo)

        result = await svc.execute(prop.id, COMPANY_ID)

        assert len(result.photos) == 1
        assert result.photos[0].url == "https://img.com/1.jpg"

    @pytest.mark.asyncio
    async def test_with_pricing_and_seasonals(self):
        prop_repo = FakePropertyRepository()
        pricing_repo = FakePricingConfigRepository()
        seasonal_repo = FakeSeasonalPriceRepository()
        discount_repo = FakeDiscountRuleRepository()
        prop = _make_property()
        await prop_repo.save(prop)
        pricing = PricingConfig(property_id=prop.id, base_price=Decimal("100"))
        await pricing_repo.save(pricing)
        seasonal = SeasonalPrice(
            pricing_config_id=pricing.id,
            name="Summer",
            start_date=date(2025, 6, 1),
            end_date=date(2025, 8, 31),
            price_per_night=Decimal("150"),
        )
        await seasonal_repo.save(seasonal)
        discount = DiscountRule(
            pricing_config_id=pricing.id,
            min_nights=7,
            discount_percent=Decimal("10"),
        )
        await discount_repo.save(discount)

        svc = self._create_service(
            prop_repo=prop_repo,
            pricing_repo=pricing_repo,
            seasonal_repo=seasonal_repo,
            discount_repo=discount_repo,
        )

        result = await svc.execute(prop.id, COMPANY_ID)

        assert result.pricing is not None
        assert result.pricing.base_price == Decimal("100")
        assert len(result.seasonal_prices) == 1
        assert len(result.discount_rules) == 1

    @pytest.mark.asyncio
    async def test_with_audit_logs(self):
        prop_repo = FakePropertyRepository()
        audit_repo = FakePropertyAuditLogRepository()
        prop = _make_property()
        await prop_repo.save(prop)
        await audit_repo.save(PropertyAuditLog(property_id=prop.id, field_name="*", action=AuditAction.CREATE))

        svc = self._create_service(prop_repo=prop_repo, audit_repo=audit_repo)

        result = await svc.execute(prop.id, COMPANY_ID)

        assert len(result.audit_logs) == 1
        assert result.audit_logs[0].action == AuditAction.CREATE


# ---------- TestListPropertiesService ----------


class TestListPropertiesService:
    @pytest.mark.asyncio
    async def test_company_filter(self):
        prop_repo = FakePropertyRepository()
        prop1 = _make_property(company_id=COMPANY_ID, name="Mine")
        prop2 = _make_property(company_id=OTHER_COMPANY_ID, name="Theirs")
        await prop_repo.save(prop1)
        await prop_repo.save(prop2)
        svc = ListPropertiesService(prop_repo)

        result = await svc.execute(COMPANY_ID)

        assert len(result.items) == 1
        assert result.items[0].name == "Mine"
        assert result.total == 1

    @pytest.mark.asyncio
    async def test_status_filter(self):
        prop_repo = FakePropertyRepository()
        active = _make_property(name="Active", status=PropertyStatus.ACTIVE, internal_name="active-1")
        paused = _make_property(name="Paused", status=PropertyStatus.PAUSED, internal_name="paused-1")
        await prop_repo.save(active)
        await prop_repo.save(paused)
        svc = ListPropertiesService(prop_repo)

        result = await svc.execute(COMPANY_ID, status=PropertyStatus.ACTIVE)

        assert len(result.items) == 1
        assert result.items[0].name == "Active"

    @pytest.mark.asyncio
    async def test_search_filter(self):
        prop_repo = FakePropertyRepository()
        prop1 = _make_property(name="Beach Villa", internal_name="beach-villa")
        prop2 = _make_property(name="Mountain House", internal_name="mountain-house")
        await prop_repo.save(prop1)
        await prop_repo.save(prop2)
        svc = ListPropertiesService(prop_repo)

        result = await svc.execute(COMPANY_ID, search="beach")

        assert len(result.items) == 1
        assert result.items[0].name == "Beach Villa"

    @pytest.mark.asyncio
    async def test_pagination(self):
        prop_repo = FakePropertyRepository()
        for i in range(5):
            p = _make_property(name=f"Prop {i}", internal_name=f"prop-{i}")
            await prop_repo.save(p)
        svc = ListPropertiesService(prop_repo)

        result = await svc.execute(COMPANY_ID, offset=0, limit=2)

        assert len(result.items) == 2
        assert result.total == 5
        assert result.offset == 0
        assert result.limit == 2

    @pytest.mark.asyncio
    async def test_empty(self):
        prop_repo = FakePropertyRepository()
        svc = ListPropertiesService(prop_repo)

        result = await svc.execute(COMPANY_ID)

        assert result.items == []
        assert result.total == 0


# ---------- TestChangePropertyStatusService ----------


class TestChangePropertyStatusService:
    async def _setup(self, initial_status=PropertyStatus.NEW):
        prop_repo = FakePropertyRepository()
        audit_repo = FakePropertyAuditLogRepository()
        prop = _make_property(status=initial_status)
        await prop_repo.save(prop)
        svc = ChangePropertyStatusService(prop_repo, audit_repo)
        return prop_repo, audit_repo, svc, prop

    @pytest.mark.asyncio
    async def test_new_to_active(self):
        _, _, svc, prop = await self._setup(PropertyStatus.NEW)
        result = await svc.execute(prop.id, COMPANY_ID, PropertyStatus.ACTIVE)
        assert result.status == PropertyStatus.ACTIVE

    @pytest.mark.asyncio
    async def test_active_to_paused(self):
        _, _, svc, prop = await self._setup(PropertyStatus.ACTIVE)
        result = await svc.execute(prop.id, COMPANY_ID, PropertyStatus.PAUSED)
        assert result.status == PropertyStatus.PAUSED

    @pytest.mark.asyncio
    async def test_active_to_archived(self):
        _, _, svc, prop = await self._setup(PropertyStatus.ACTIVE)
        result = await svc.execute(prop.id, COMPANY_ID, PropertyStatus.ARCHIVED)
        assert result.status == PropertyStatus.ARCHIVED

    @pytest.mark.asyncio
    async def test_paused_to_active(self):
        _, _, svc, prop = await self._setup(PropertyStatus.PAUSED)
        result = await svc.execute(prop.id, COMPANY_ID, PropertyStatus.ACTIVE)
        assert result.status == PropertyStatus.ACTIVE

    @pytest.mark.asyncio
    async def test_paused_to_archived(self):
        _, _, svc, prop = await self._setup(PropertyStatus.PAUSED)
        result = await svc.execute(prop.id, COMPANY_ID, PropertyStatus.ARCHIVED)
        assert result.status == PropertyStatus.ARCHIVED

    @pytest.mark.asyncio
    async def test_archived_to_active(self):
        _, _, svc, prop = await self._setup(PropertyStatus.ARCHIVED)
        result = await svc.execute(prop.id, COMPANY_ID, PropertyStatus.ACTIVE)
        assert result.status == PropertyStatus.ACTIVE

    @pytest.mark.asyncio
    async def test_invalid_transition_new_to_paused(self):
        _, _, svc, prop = await self._setup(PropertyStatus.NEW)
        with pytest.raises(ValueError, match="Cannot transition"):
            await svc.execute(prop.id, COMPANY_ID, PropertyStatus.PAUSED)

    @pytest.mark.asyncio
    async def test_invalid_transition_new_to_archived(self):
        _, _, svc, prop = await self._setup(PropertyStatus.NEW)
        with pytest.raises(ValueError, match="Cannot transition"):
            await svc.execute(prop.id, COMPANY_ID, PropertyStatus.ARCHIVED)

    @pytest.mark.asyncio
    async def test_invalid_transition_checked_in_to_done(self):
        """Checked_out has no transition target for booking, but active->new is invalid for property."""
        _, _, svc, prop = await self._setup(PropertyStatus.ACTIVE)
        with pytest.raises(ValueError, match="Cannot transition"):
            await svc.execute(prop.id, COMPANY_ID, PropertyStatus.NEW)

    @pytest.mark.asyncio
    async def test_creates_audit_log(self):
        _, audit_repo, svc, prop = await self._setup(PropertyStatus.NEW)
        await svc.execute(prop.id, COMPANY_ID, PropertyStatus.ACTIVE, changed_by=USER_ID)

        logs = await audit_repo.list_by_property(prop.id)
        assert len(logs) == 1
        assert logs[0].action == AuditAction.STATUS_CHANGE
        assert logs[0].old_value == "new"
        assert logs[0].new_value == "active"
        assert logs[0].changed_by == USER_ID

    @pytest.mark.asyncio
    async def test_not_found_raises(self):
        prop_repo = FakePropertyRepository()
        audit_repo = FakePropertyAuditLogRepository()
        svc = ChangePropertyStatusService(prop_repo, audit_repo)

        with pytest.raises(ValueError, match="Property not found"):
            await svc.execute(uuid.uuid4(), COMPANY_ID, PropertyStatus.ACTIVE)

    @pytest.mark.asyncio
    async def test_wrong_company_raises(self):
        _, _, svc, prop = await self._setup(PropertyStatus.NEW)
        with pytest.raises(ValueError, match="Property not found"):
            await svc.execute(prop.id, OTHER_COMPANY_ID, PropertyStatus.ACTIVE)


# ---------- TestManagePhotosService ----------


class TestManagePhotosService:
    async def _setup(self):
        prop_repo = FakePropertyRepository()
        photo_repo = FakePropertyPhotoRepository()
        prop = _make_property()
        await prop_repo.save(prop)
        svc = ManagePhotosService(prop_repo, photo_repo)
        return prop_repo, photo_repo, svc, prop

    @pytest.mark.asyncio
    async def test_add_photo(self):
        _, _, svc, prop = await self._setup()

        result = await svc.add_photo(prop.id, COMPANY_ID, "https://img.com/1.jpg")

        assert result.property_id == prop.id
        assert result.url == "https://img.com/1.jpg"

    @pytest.mark.asyncio
    async def test_add_photo_with_cover(self):
        _, _, svc, prop = await self._setup()

        result = await svc.add_photo(prop.id, COMPANY_ID, "https://img.com/cover.jpg", is_cover=True, sort_order=0)

        assert result.is_cover is True
        assert result.sort_order == 0

    @pytest.mark.asyncio
    async def test_add_photo_wrong_property(self):
        _, _, svc, _ = await self._setup()

        with pytest.raises(ValueError, match="Property not found"):
            await svc.add_photo(uuid.uuid4(), COMPANY_ID, "https://img.com/x.jpg")

    @pytest.mark.asyncio
    async def test_add_photo_wrong_company(self):
        _, _, svc, prop = await self._setup()

        with pytest.raises(ValueError, match="Property not found"):
            await svc.add_photo(prop.id, OTHER_COMPANY_ID, "https://img.com/x.jpg")

    @pytest.mark.asyncio
    async def test_delete_photo(self):
        _, photo_repo, svc, prop = await self._setup()

        photo = await svc.add_photo(prop.id, COMPANY_ID, "https://img.com/del.jpg")
        await svc.delete_photo(photo.id, prop.id, COMPANY_ID)

        photos = await photo_repo.list_by_property(prop.id)
        assert len(photos) == 0

    @pytest.mark.asyncio
    async def test_reorder_photos(self):
        _, photo_repo, svc, prop = await self._setup()

        p1 = await svc.add_photo(prop.id, COMPANY_ID, "https://img.com/1.jpg", sort_order=0)
        p2 = await svc.add_photo(prop.id, COMPANY_ID, "https://img.com/2.jpg", sort_order=1)
        p3 = await svc.add_photo(prop.id, COMPANY_ID, "https://img.com/3.jpg", sort_order=2)

        reordered = await svc.reorder_photos(prop.id, COMPANY_ID, [p3.id, p1.id, p2.id])

        assert reordered[0].id == p3.id
        assert reordered[1].id == p1.id
        assert reordered[2].id == p2.id

    @pytest.mark.asyncio
    async def test_list_photos(self):
        _, _, svc, prop = await self._setup()
        await svc.add_photo(prop.id, COMPANY_ID, "https://img.com/a.jpg")
        await svc.add_photo(prop.id, COMPANY_ID, "https://img.com/b.jpg")

        photos = await svc.list_photos(prop.id, COMPANY_ID)
        assert len(photos) == 2

    @pytest.mark.asyncio
    async def test_list_photos_wrong_company(self):
        _, _, svc, prop = await self._setup()

        with pytest.raises(ValueError, match="Property not found"):
            await svc.list_photos(prop.id, OTHER_COMPANY_ID)

    @pytest.mark.asyncio
    async def test_delete_photo_wrong_company(self):
        _, _, svc, prop = await self._setup()
        photo = await svc.add_photo(prop.id, COMPANY_ID, "https://img.com/1.jpg")

        with pytest.raises(ValueError, match="Property not found"):
            await svc.delete_photo(photo.id, prop.id, OTHER_COMPANY_ID)


# ---------- TestManagePricingService ----------


class TestManagePricingService:
    async def _setup(self):
        prop_repo = FakePropertyRepository()
        pricing_repo = FakePricingConfigRepository()
        seasonal_repo = FakeSeasonalPriceRepository()
        discount_repo = FakeDiscountRuleRepository()
        prop = _make_property()
        await prop_repo.save(prop)
        svc = ManagePricingService(prop_repo, pricing_repo, seasonal_repo, discount_repo)
        return prop_repo, pricing_repo, seasonal_repo, discount_repo, svc, prop

    @pytest.mark.asyncio
    async def test_create_pricing(self):
        _, _, _, _, svc, prop = await self._setup()

        result = await svc.upsert_pricing(
            prop.id,
            COMPANY_ID,
            PricingConfigInput(base_price=Decimal("100"), weekend_markup=Decimal("20")),
        )

        assert result.base_price == Decimal("100")
        assert result.weekend_markup == Decimal("20")
        assert result.property_id == prop.id

    @pytest.mark.asyncio
    async def test_update_pricing(self):
        _, _, _, _, svc, prop = await self._setup()
        await svc.upsert_pricing(prop.id, COMPANY_ID, PricingConfigInput(base_price=Decimal("100")))

        result = await svc.upsert_pricing(prop.id, COMPANY_ID, PricingConfigInput(base_price=Decimal("150")))

        assert result.base_price == Decimal("150")

    @pytest.mark.asyncio
    async def test_get_pricing(self):
        _, _, _, _, svc, prop = await self._setup()
        await svc.upsert_pricing(prop.id, COMPANY_ID, PricingConfigInput(base_price=Decimal("200")))

        result = await svc.get_pricing(prop.id, COMPANY_ID)

        assert result is not None
        assert result.base_price == Decimal("200")

    @pytest.mark.asyncio
    async def test_get_pricing_none(self):
        _, _, _, _, svc, prop = await self._setup()

        result = await svc.get_pricing(prop.id, COMPANY_ID)
        assert result is None

    @pytest.mark.asyncio
    async def test_pricing_wrong_property(self):
        _, _, _, _, svc, _ = await self._setup()

        with pytest.raises(ValueError, match="Property not found"):
            await svc.upsert_pricing(uuid.uuid4(), COMPANY_ID, PricingConfigInput(base_price=Decimal("100")))

    @pytest.mark.asyncio
    async def test_add_seasonal_price(self):
        _, _, _, _, svc, prop = await self._setup()
        await svc.upsert_pricing(prop.id, COMPANY_ID, PricingConfigInput(base_price=Decimal("100")))

        seasonal = SeasonalPrice(
            name="Summer",
            start_date=date(2025, 6, 1),
            end_date=date(2025, 8, 31),
            price_per_night=Decimal("150"),
        )
        result = await svc.add_seasonal_price(prop.id, COMPANY_ID, seasonal)

        assert result.name == "Summer"
        assert result.price_per_night == Decimal("150")

    @pytest.mark.asyncio
    async def test_add_seasonal_without_pricing_raises(self):
        _, _, _, _, svc, prop = await self._setup()

        seasonal = SeasonalPrice(name="Winter", price_per_night=Decimal("80"))
        with pytest.raises(ValueError, match="Pricing config not found"):
            await svc.add_seasonal_price(prop.id, COMPANY_ID, seasonal)

    @pytest.mark.asyncio
    async def test_delete_seasonal_price(self):
        _, _, seasonal_repo, _, svc, prop = await self._setup()
        await svc.upsert_pricing(prop.id, COMPANY_ID, PricingConfigInput(base_price=Decimal("100")))
        seasonal = await svc.add_seasonal_price(
            prop.id, COMPANY_ID, SeasonalPrice(name="Summer", price_per_night=Decimal("150"))
        )

        await svc.delete_seasonal_price(prop.id, COMPANY_ID, seasonal.id)

        pricing = await svc.get_pricing(prop.id, COMPANY_ID)
        remaining = await seasonal_repo.list_by_pricing_config(pricing.id)
        assert len(remaining) == 0

    @pytest.mark.asyncio
    async def test_list_seasonal_prices(self):
        _, _, _, _, svc, prop = await self._setup()
        await svc.upsert_pricing(prop.id, COMPANY_ID, PricingConfigInput(base_price=Decimal("100")))
        await svc.add_seasonal_price(prop.id, COMPANY_ID, SeasonalPrice(name="S1", price_per_night=Decimal("120")))
        await svc.add_seasonal_price(prop.id, COMPANY_ID, SeasonalPrice(name="S2", price_per_night=Decimal("80")))

        result = await svc.list_seasonal_prices(prop.id, COMPANY_ID)
        assert len(result) == 2

    @pytest.mark.asyncio
    async def test_list_seasonal_no_pricing_returns_empty(self):
        _, _, _, _, svc, prop = await self._setup()

        result = await svc.list_seasonal_prices(prop.id, COMPANY_ID)
        assert result == []

    @pytest.mark.asyncio
    async def test_add_discount_rule(self):
        _, _, _, _, svc, prop = await self._setup()
        await svc.upsert_pricing(prop.id, COMPANY_ID, PricingConfigInput(base_price=Decimal("100")))

        rule = DiscountRule(min_nights=7, discount_percent=Decimal("10"))
        result = await svc.add_discount_rule(prop.id, COMPANY_ID, rule)

        assert result.min_nights == 7
        assert result.discount_percent == Decimal("10")

    @pytest.mark.asyncio
    async def test_add_discount_without_pricing_raises(self):
        _, _, _, _, svc, prop = await self._setup()

        rule = DiscountRule(min_nights=3, discount_percent=Decimal("5"))
        with pytest.raises(ValueError, match="Pricing config not found"):
            await svc.add_discount_rule(prop.id, COMPANY_ID, rule)

    @pytest.mark.asyncio
    async def test_delete_discount_rule(self):
        _, _, _, discount_repo, svc, prop = await self._setup()
        await svc.upsert_pricing(prop.id, COMPANY_ID, PricingConfigInput(base_price=Decimal("100")))
        rule = await svc.add_discount_rule(
            prop.id, COMPANY_ID, DiscountRule(min_nights=5, discount_percent=Decimal("10"))
        )

        await svc.delete_discount_rule(prop.id, COMPANY_ID, rule.id)

        pricing = await svc.get_pricing(prop.id, COMPANY_ID)
        remaining = await discount_repo.list_by_pricing_config(pricing.id)
        assert len(remaining) == 0

    @pytest.mark.asyncio
    async def test_list_discount_rules(self):
        _, _, _, _, svc, prop = await self._setup()
        await svc.upsert_pricing(prop.id, COMPANY_ID, PricingConfigInput(base_price=Decimal("100")))
        await svc.add_discount_rule(prop.id, COMPANY_ID, DiscountRule(min_nights=3, discount_percent=Decimal("5")))
        await svc.add_discount_rule(prop.id, COMPANY_ID, DiscountRule(min_nights=7, discount_percent=Decimal("10")))

        result = await svc.list_discount_rules(prop.id, COMPANY_ID)
        assert len(result) == 2

    @pytest.mark.asyncio
    async def test_list_discount_no_pricing_returns_empty(self):
        _, _, _, _, svc, prop = await self._setup()

        result = await svc.list_discount_rules(prop.id, COMPANY_ID)
        assert result == []

    @pytest.mark.asyncio
    async def test_upsert_pricing_all_fields(self):
        _, _, _, _, svc, prop = await self._setup()

        result = await svc.upsert_pricing(
            prop.id,
            COMPANY_ID,
            PricingConfigInput(
                base_price=Decimal("200"),
                weekend_markup=Decimal("50"),
                default_deposit=Decimal("500"),
                extra_adult_price=Decimal("30"),
                extra_child_price=Decimal("15"),
                base_guests=2,
            ),
        )

        assert result.base_price == Decimal("200")
        assert result.weekend_markup == Decimal("50")
        assert result.default_deposit == Decimal("500")
        assert result.extra_adult_price == Decimal("30")
        assert result.extra_child_price == Decimal("15")
        assert result.base_guests == 2


# ---------- TestManageAmenitiesService ----------


class TestManageAmenitiesService:
    async def _setup(self):
        amenity_repo = FakeAmenityRepository()
        prop_repo = FakePropertyRepository()
        prop = _make_property()
        await prop_repo.save(prop)
        svc = ManageAmenitiesService(amenity_repo, prop_repo)
        return amenity_repo, prop_repo, svc, prop

    @pytest.mark.asyncio
    async def test_create_amenity(self):
        _, _, svc, _ = await self._setup()

        result = await svc.create_amenity("WiFi", AmenityCategory.ENTERTAINMENT)

        assert result.name == "WiFi"
        assert result.category == AmenityCategory.ENTERTAINMENT
        assert result.id is not None

    @pytest.mark.asyncio
    async def test_create_amenity_with_icon(self):
        _, _, svc, _ = await self._setup()

        result = await svc.create_amenity("Pool", AmenityCategory.OUTDOOR, icon="pool-icon")

        assert result.icon == "pool-icon"

    @pytest.mark.asyncio
    async def test_list_amenities(self):
        _, _, svc, _ = await self._setup()
        await svc.create_amenity("WiFi", AmenityCategory.ENTERTAINMENT)
        await svc.create_amenity("AC", AmenityCategory.COMFORT)

        result = await svc.list_amenities()
        assert len(result) == 2

    @pytest.mark.asyncio
    async def test_list_amenities_empty(self):
        _, _, svc, _ = await self._setup()

        result = await svc.list_amenities()
        assert result == []

    @pytest.mark.asyncio
    async def test_set_property_amenities(self):
        _, _, svc, prop = await self._setup()
        a1 = await svc.create_amenity("WiFi", AmenityCategory.ENTERTAINMENT)
        a2 = await svc.create_amenity("AC", AmenityCategory.COMFORT)

        result = await svc.set_property_amenities(prop.id, COMPANY_ID, [a1.id, a2.id])

        assert len(result) == 2

    @pytest.mark.asyncio
    async def test_get_property_amenities(self):
        _, _, svc, prop = await self._setup()
        a1 = await svc.create_amenity("WiFi", AmenityCategory.ENTERTAINMENT)
        await svc.set_property_amenities(prop.id, COMPANY_ID, [a1.id])

        result = await svc.get_property_amenities(prop.id, COMPANY_ID)
        assert len(result) == 1
        assert result[0].name == "WiFi"

    @pytest.mark.asyncio
    async def test_remove_property_amenities(self):
        _, _, svc, prop = await self._setup()
        a1 = await svc.create_amenity("WiFi", AmenityCategory.ENTERTAINMENT)
        await svc.set_property_amenities(prop.id, COMPANY_ID, [a1.id])

        result = await svc.set_property_amenities(prop.id, COMPANY_ID, [])
        assert len(result) == 0

    @pytest.mark.asyncio
    async def test_set_property_amenities_wrong_company(self):
        _, _, svc, prop = await self._setup()

        with pytest.raises(ValueError, match="Property not found"):
            await svc.set_property_amenities(prop.id, OTHER_COMPANY_ID, [])

    @pytest.mark.asyncio
    async def test_get_property_amenities_wrong_company(self):
        _, _, svc, prop = await self._setup()

        with pytest.raises(ValueError, match="Property not found"):
            await svc.get_property_amenities(prop.id, OTHER_COMPANY_ID)

    @pytest.mark.asyncio
    async def test_set_amenities_not_found_property(self):
        _, _, svc, _ = await self._setup()

        with pytest.raises(ValueError, match="Property not found"):
            await svc.set_property_amenities(uuid.uuid4(), COMPANY_ID, [])
