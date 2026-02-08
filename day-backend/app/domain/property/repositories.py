from __future__ import annotations

import abc
import uuid

from app.domain.property.entities import (
    Amenity,
    DiscountRule,
    PricingConfig,
    Property,
    PropertyAuditLog,
    PropertyPhoto,
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
    async def set_property_amenities(
        self, property_id: uuid.UUID, amenity_ids: list[uuid.UUID]
    ) -> None: ...

    @abc.abstractmethod
    async def get_property_amenities(self, property_id: uuid.UUID) -> list[Amenity]: ...


class PricingConfigRepository(abc.ABC):
    @abc.abstractmethod
    async def get_by_property(self, property_id: uuid.UUID) -> PricingConfig | None: ...

    @abc.abstractmethod
    async def save(self, config: PricingConfig) -> PricingConfig: ...

    @abc.abstractmethod
    async def update(self, config: PricingConfig) -> PricingConfig: ...


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
