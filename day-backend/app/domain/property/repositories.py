from __future__ import annotations

import abc
import uuid
from collections.abc import Sequence

from app.domain.property.entities import (
    Amenity,
    DiscountRule,
    PricingConfig,
    Property,
    PropertyAuditLog,
    PropertyCosts,
    PropertyPhoto,
    PropertyTag,
    SeasonalPrice,
)
from app.domain.property.value_objects import PropertyStatus


class PropertyRepository(abc.ABC):
    @abc.abstractmethod
    async def get_by_id(self, property_id: uuid.UUID) -> Property | None: ...

    @abc.abstractmethod
    async def list_by_company(
        self,
        company_id: uuid.UUID,
        *,
        offset: int = 0,
        limit: int = 50,
        status: PropertyStatus | None = None,
        search: str | None = None,
    ) -> list[Property]: ...

    @abc.abstractmethod
    async def count_by_company(self, company_id: uuid.UUID) -> int: ...

    @abc.abstractmethod
    async def save(self, prop: Property) -> Property: ...

    @abc.abstractmethod
    async def update(self, prop: Property) -> Property: ...

    @abc.abstractmethod
    async def exists_internal_name(
        self, company_id: uuid.UUID, internal_name: str, *, exclude_id: uuid.UUID | None = None
    ) -> bool: ...

    @abc.abstractmethod
    async def find_next_clone_name(self, company_id: uuid.UUID, base_name: str) -> str: ...


class PropertyPhotoRepository(abc.ABC):
    @abc.abstractmethod
    async def list_by_property(self, property_id: uuid.UUID) -> list[PropertyPhoto]: ...

    @abc.abstractmethod
    async def save(self, photo: PropertyPhoto) -> PropertyPhoto: ...

    @abc.abstractmethod
    async def delete(self, photo_id: uuid.UUID) -> None: ...

    @abc.abstractmethod
    async def reorder(self, property_id: uuid.UUID, photo_ids: list[uuid.UUID]) -> None: ...


class AmenityRepository(abc.ABC):
    @abc.abstractmethod
    async def list_all(self) -> list[Amenity]: ...

    @abc.abstractmethod
    async def get_by_id(self, amenity_id: uuid.UUID) -> Amenity | None: ...

    @abc.abstractmethod
    async def save(self, amenity: Amenity) -> Amenity: ...

    @abc.abstractmethod
    async def set_property_amenities(self, property_id: uuid.UUID, amenity_ids: list[uuid.UUID]) -> None: ...

    @abc.abstractmethod
    async def get_property_amenities(self, property_id: uuid.UUID) -> list[Amenity]: ...


class PricingConfigRepository(abc.ABC):
    @abc.abstractmethod
    async def get_by_property(self, property_id: uuid.UUID) -> PricingConfig | None: ...

    @abc.abstractmethod
    async def save(self, config: PricingConfig) -> PricingConfig: ...

    @abc.abstractmethod
    async def update(self, config: PricingConfig) -> PricingConfig: ...


class PropertyCostsRepository(abc.ABC):
    @abc.abstractmethod
    async def get_by_property(self, property_id: uuid.UUID) -> PropertyCosts | None: ...

    @abc.abstractmethod
    async def list_for_properties(
        self, property_ids: Sequence[uuid.UUID]
    ) -> dict[uuid.UUID, PropertyCosts]:
        """Costs for many flats at once.

        Analytics reports every flat in one screen; asking per flat would turn
        one report into a query per property.
        """

    @abc.abstractmethod
    async def upsert(self, costs: PropertyCosts) -> PropertyCosts:
        """Costs are one row per flat, edited in place rather than versioned."""


class SeasonalPriceRepository(abc.ABC):
    @abc.abstractmethod
    async def list_by_pricing_config(self, pricing_config_id: uuid.UUID) -> list[SeasonalPrice]: ...

    @abc.abstractmethod
    async def save(self, price: SeasonalPrice) -> SeasonalPrice: ...

    @abc.abstractmethod
    async def delete(self, price_id: uuid.UUID) -> None: ...


class DiscountRuleRepository(abc.ABC):
    @abc.abstractmethod
    async def list_by_pricing_config(self, pricing_config_id: uuid.UUID) -> list[DiscountRule]: ...

    @abc.abstractmethod
    async def save(self, rule: DiscountRule) -> DiscountRule: ...

    @abc.abstractmethod
    async def delete(self, rule_id: uuid.UUID) -> None: ...


class PropertyAuditLogRepository(abc.ABC):
    @abc.abstractmethod
    async def list_by_property(
        self,
        property_id: uuid.UUID,
        *,
        offset: int = 0,
        limit: int = 50,
    ) -> list[PropertyAuditLog]: ...

    @abc.abstractmethod
    async def save(self, log: PropertyAuditLog) -> PropertyAuditLog: ...


class PropertyTagRepository(abc.ABC):
    @abc.abstractmethod
    async def get_by_id(self, tag_id: uuid.UUID) -> PropertyTag | None: ...

    @abc.abstractmethod
    async def list_by_company(self, company_id: uuid.UUID) -> list[PropertyTag]: ...

    @abc.abstractmethod
    async def save(self, tag: PropertyTag) -> PropertyTag: ...

    @abc.abstractmethod
    async def update(self, tag: PropertyTag) -> PropertyTag: ...

    @abc.abstractmethod
    async def delete(self, tag_id: uuid.UUID) -> None: ...

    @abc.abstractmethod
    async def exists_name(self, company_id: uuid.UUID, name: str, *, exclude_id: uuid.UUID | None = None) -> bool: ...

    @abc.abstractmethod
    async def assign_tag(self, property_id: uuid.UUID, tag_id: uuid.UUID) -> None: ...

    @abc.abstractmethod
    async def remove_tag(self, property_id: uuid.UUID, tag_id: uuid.UUID) -> None: ...

    @abc.abstractmethod
    async def get_property_tags(self, property_id: uuid.UUID) -> list[PropertyTag]: ...

    @abc.abstractmethod
    async def get_property_ids_by_tag(self, tag_id: uuid.UUID) -> list[uuid.UUID]: ...
