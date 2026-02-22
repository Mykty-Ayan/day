from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

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
from app.domain.property.value_objects import (
    AmenityCategory,
    AuditAction,
    PropertyStatus,
    PropertyType,
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

# ---------- helpers ----------


def _model_to_property(m: PropertyModel) -> Property:
    return Property(
        id=m.id,
        company_id=m.company_id,
        name=m.name,
        internal_name=m.internal_name,
        type=PropertyType(m.type),
        status=PropertyStatus(m.status),
        description=m.description,
        source_url=m.source_url,
        latitude=m.latitude,
        longitude=m.longitude,
        address_full=m.address_full,
        apartment_number=m.apartment_number,
        entrance=m.entrance,
        block=m.block,
        floor=m.floor,
        rooms=m.rooms,
        beds=m.beds,
        area_living=m.area_living,
        area_total=m.area_total,
        check_in_instructions=m.check_in_instructions,
        check_out_instructions=m.check_out_instructions,
        house_rules=m.house_rules,
        created_at=m.created_at,
        updated_at=m.updated_at,
    )


def _property_to_dict(p: Property) -> dict:
    return {
        "company_id": p.company_id,
        "name": p.name,
        "internal_name": p.internal_name,
        "type": p.type.value,
        "status": p.status.value,
        "description": p.description,
        "source_url": p.source_url,
        "latitude": p.latitude,
        "longitude": p.longitude,
        "address_full": p.address_full,
        "apartment_number": p.apartment_number,
        "entrance": p.entrance,
        "block": p.block,
        "floor": p.floor,
        "rooms": p.rooms,
        "beds": p.beds,
        "area_living": p.area_living,
        "area_total": p.area_total,
        "check_in_instructions": p.check_in_instructions,
        "check_out_instructions": p.check_out_instructions,
        "house_rules": p.house_rules,
    }


def _model_to_photo(m: PropertyPhotoModel) -> PropertyPhoto:
    return PropertyPhoto(
        id=m.id,
        property_id=m.property_id,
        url=m.url,
        sort_order=m.sort_order,
        is_cover=m.is_cover,
        created_at=m.created_at,
    )


def _model_to_amenity(m: AmenityModel) -> Amenity:
    return Amenity(
        id=m.id,
        name=m.name,
        icon=m.icon,
        category=AmenityCategory(m.category),
    )


def _model_to_pricing(m: PricingConfigModel) -> PricingConfig:
    return PricingConfig(
        id=m.id,
        property_id=m.property_id,
        base_price=Decimal(str(m.base_price)),
        weekend_markup=Decimal(str(m.weekend_markup)),
        default_deposit=Decimal(str(m.default_deposit)),
        extra_adult_price=Decimal(str(m.extra_adult_price)),
        extra_child_price=Decimal(str(m.extra_child_price)),
        base_guests=m.base_guests,
        created_at=m.created_at,
        updated_at=m.updated_at,
    )


def _model_to_seasonal(m: SeasonalPriceModel) -> SeasonalPrice:
    return SeasonalPrice(
        id=m.id,
        pricing_config_id=m.pricing_config_id,
        name=m.name,
        start_date=m.start_date,
        end_date=m.end_date,
        price_per_night=Decimal(str(m.price_per_night)),
        created_at=m.created_at,
    )


def _model_to_discount(m: DiscountRuleModel) -> DiscountRule:
    return DiscountRule(
        id=m.id,
        pricing_config_id=m.pricing_config_id,
        min_nights=m.min_nights,
        discount_percent=Decimal(str(m.discount_percent)),
        discount_fixed=Decimal(str(m.discount_fixed)),
        created_at=m.created_at,
    )


def _model_to_audit(m: PropertyAuditLogModel) -> PropertyAuditLog:
    return PropertyAuditLog(
        id=m.id,
        property_id=m.property_id,
        changed_by=m.changed_by,
        field_name=m.field_name,
        old_value=m.old_value,
        new_value=m.new_value,
        action=AuditAction(m.action),
        created_at=m.created_at,
    )


# ---------- implementations ----------


class SqlPropertyRepository(PropertyRepository):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_by_id(self, property_id: uuid.UUID) -> Property | None:
        result = await self._session.get(PropertyModel, property_id)
        return _model_to_property(result) if result else None

    async def list_by_company(
        self,
        company_id: uuid.UUID,
        *,
        offset: int = 0,
        limit: int = 50,
        status: PropertyStatus | None = None,
        search: str | None = None,
    ) -> list[Property]:
        stmt = select(PropertyModel).where(PropertyModel.company_id == company_id)
        if status is not None:
            stmt = stmt.where(PropertyModel.status == status.value)
        if search:
            stmt = stmt.where(PropertyModel.internal_name.ilike(f"%{search}%"))
        stmt = stmt.order_by(PropertyModel.created_at.desc()).offset(offset).limit(limit)
        result = await self._session.scalars(stmt)
        return [_model_to_property(m) for m in result.all()]

    async def count_by_company(self, company_id: uuid.UUID) -> int:
        stmt = select(func.count()).select_from(PropertyModel).where(PropertyModel.company_id == company_id)
        result = await self._session.scalar(stmt)
        return result or 0

    async def save(self, prop: Property) -> Property:
        model = PropertyModel(id=prop.id, **_property_to_dict(prop))
        self._session.add(model)
        await self._session.flush()
        await self._session.refresh(model)
        return _model_to_property(model)

    async def update(self, prop: Property) -> Property:
        stmt = (
            update(PropertyModel)
            .where(PropertyModel.id == prop.id)
            .values(**_property_to_dict(prop), updated_at=datetime.utcnow())
        )
        await self._session.execute(stmt)
        await self._session.flush()
        result = await self._session.get(PropertyModel, prop.id)
        return _model_to_property(result)  # type: ignore[arg-type]

    async def exists_internal_name(
        self,
        company_id: uuid.UUID,
        internal_name: str,
        *,
        exclude_id: uuid.UUID | None = None,
    ) -> bool:
        stmt = (
            select(func.count())
            .select_from(PropertyModel)
            .where(
                PropertyModel.company_id == company_id,
                PropertyModel.internal_name == internal_name,
            )
        )
        if exclude_id is not None:
            stmt = stmt.where(PropertyModel.id != exclude_id)
        result = await self._session.scalar(stmt)
        return (result or 0) > 0

    async def find_next_clone_name(self, company_id: uuid.UUID, base_name: str) -> str:
        import re

        # Strip existing "-N" suffix to get the root name
        root = re.sub(r"-\d+$", "", base_name)
        # Find all names matching the pattern root or root-N
        pattern = f"{root}%"
        stmt = select(PropertyModel.internal_name).where(
            PropertyModel.company_id == company_id,
            PropertyModel.internal_name.like(pattern),
        )
        result = await self._session.scalars(stmt)
        existing_names = set(result.all())

        max_suffix = 0
        for name in existing_names:
            if name == root:
                max_suffix = max(max_suffix, 0)
            else:
                match = re.match(rf"^{re.escape(root)}-(\d+)$", name)
                if match:
                    max_suffix = max(max_suffix, int(match.group(1)))

        return f"{root}-{max_suffix + 1}"


class SqlPropertyPhotoRepository(PropertyPhotoRepository):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_by_property(self, property_id: uuid.UUID) -> list[PropertyPhoto]:
        stmt = (
            select(PropertyPhotoModel)
            .where(PropertyPhotoModel.property_id == property_id)
            .order_by(PropertyPhotoModel.sort_order)
        )
        result = await self._session.scalars(stmt)
        return [_model_to_photo(m) for m in result.all()]

    async def save(self, photo: PropertyPhoto) -> PropertyPhoto:
        model = PropertyPhotoModel(
            id=photo.id,
            property_id=photo.property_id,
            url=photo.url,
            sort_order=photo.sort_order,
            is_cover=photo.is_cover,
        )
        self._session.add(model)
        await self._session.flush()
        await self._session.refresh(model)
        return _model_to_photo(model)

    async def delete(self, photo_id: uuid.UUID) -> None:
        stmt = delete(PropertyPhotoModel).where(PropertyPhotoModel.id == photo_id)
        await self._session.execute(stmt)
        await self._session.flush()

    async def reorder(self, property_id: uuid.UUID, photo_ids: list[uuid.UUID]) -> None:
        for idx, pid in enumerate(photo_ids):
            stmt = (
                update(PropertyPhotoModel)
                .where(
                    PropertyPhotoModel.id == pid,
                    PropertyPhotoModel.property_id == property_id,
                )
                .values(sort_order=idx)
            )
            await self._session.execute(stmt)
        await self._session.flush()


class SqlAmenityRepository(AmenityRepository):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_all(self) -> list[Amenity]:
        stmt = select(AmenityModel).order_by(AmenityModel.category, AmenityModel.name)
        result = await self._session.scalars(stmt)
        return [_model_to_amenity(m) for m in result.all()]

    async def get_by_id(self, amenity_id: uuid.UUID) -> Amenity | None:
        result = await self._session.get(AmenityModel, amenity_id)
        return _model_to_amenity(result) if result else None

    async def save(self, amenity: Amenity) -> Amenity:
        model = AmenityModel(
            id=amenity.id,
            name=amenity.name,
            icon=amenity.icon,
            category=amenity.category.value,
        )
        self._session.add(model)
        await self._session.flush()
        await self._session.refresh(model)
        return _model_to_amenity(model)

    async def set_property_amenities(self, property_id: uuid.UUID, amenity_ids: list[uuid.UUID]) -> None:
        # Remove existing links
        stmt = delete(PropertyAmenityModel).where(PropertyAmenityModel.property_id == property_id)
        await self._session.execute(stmt)
        # Add new links
        for aid in amenity_ids:
            self._session.add(PropertyAmenityModel(property_id=property_id, amenity_id=aid))
        await self._session.flush()

    async def get_property_amenities(self, property_id: uuid.UUID) -> list[Amenity]:
        stmt = (
            select(AmenityModel)
            .join(PropertyAmenityModel, AmenityModel.id == PropertyAmenityModel.amenity_id)
            .where(PropertyAmenityModel.property_id == property_id)
            .order_by(AmenityModel.category, AmenityModel.name)
        )
        result = await self._session.scalars(stmt)
        return [_model_to_amenity(m) for m in result.all()]


class SqlPricingConfigRepository(PricingConfigRepository):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_by_property(self, property_id: uuid.UUID) -> PricingConfig | None:
        stmt = select(PricingConfigModel).where(PricingConfigModel.property_id == property_id)
        result = await self._session.scalar(stmt)
        return _model_to_pricing(result) if result else None

    async def save(self, config: PricingConfig) -> PricingConfig:
        model = PricingConfigModel(
            id=config.id,
            property_id=config.property_id,
            base_price=float(config.base_price),
            weekend_markup=float(config.weekend_markup),
            default_deposit=float(config.default_deposit),
            extra_adult_price=float(config.extra_adult_price),
            extra_child_price=float(config.extra_child_price),
            base_guests=config.base_guests,
        )
        self._session.add(model)
        await self._session.flush()
        await self._session.refresh(model)
        return _model_to_pricing(model)

    async def update(self, config: PricingConfig) -> PricingConfig:
        stmt = (
            update(PricingConfigModel)
            .where(PricingConfigModel.id == config.id)
            .values(
                base_price=float(config.base_price),
                weekend_markup=float(config.weekend_markup),
                default_deposit=float(config.default_deposit),
                extra_adult_price=float(config.extra_adult_price),
                extra_child_price=float(config.extra_child_price),
                base_guests=config.base_guests,
                updated_at=datetime.utcnow(),
            )
        )
        await self._session.execute(stmt)
        await self._session.flush()
        result = await self._session.get(PricingConfigModel, config.id)
        return _model_to_pricing(result)  # type: ignore[arg-type]


class SqlSeasonalPriceRepository(SeasonalPriceRepository):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_by_pricing_config(self, pricing_config_id: uuid.UUID) -> list[SeasonalPrice]:
        stmt = (
            select(SeasonalPriceModel)
            .where(SeasonalPriceModel.pricing_config_id == pricing_config_id)
            .order_by(SeasonalPriceModel.start_date)
        )
        result = await self._session.scalars(stmt)
        return [_model_to_seasonal(m) for m in result.all()]

    async def save(self, price: SeasonalPrice) -> SeasonalPrice:
        model = SeasonalPriceModel(
            id=price.id,
            pricing_config_id=price.pricing_config_id,
            name=price.name,
            start_date=price.start_date,
            end_date=price.end_date,
            price_per_night=float(price.price_per_night),
        )
        self._session.add(model)
        await self._session.flush()
        await self._session.refresh(model)
        return _model_to_seasonal(model)

    async def delete(self, price_id: uuid.UUID) -> None:
        stmt = delete(SeasonalPriceModel).where(SeasonalPriceModel.id == price_id)
        await self._session.execute(stmt)
        await self._session.flush()


class SqlDiscountRuleRepository(DiscountRuleRepository):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_by_pricing_config(self, pricing_config_id: uuid.UUID) -> list[DiscountRule]:
        stmt = (
            select(DiscountRuleModel)
            .where(DiscountRuleModel.pricing_config_id == pricing_config_id)
            .order_by(DiscountRuleModel.min_nights)
        )
        result = await self._session.scalars(stmt)
        return [_model_to_discount(m) for m in result.all()]

    async def save(self, rule: DiscountRule) -> DiscountRule:
        model = DiscountRuleModel(
            id=rule.id,
            pricing_config_id=rule.pricing_config_id,
            min_nights=rule.min_nights,
            discount_percent=float(rule.discount_percent),
            discount_fixed=float(rule.discount_fixed),
        )
        self._session.add(model)
        await self._session.flush()
        await self._session.refresh(model)
        return _model_to_discount(model)

    async def delete(self, rule_id: uuid.UUID) -> None:
        stmt = delete(DiscountRuleModel).where(DiscountRuleModel.id == rule_id)
        await self._session.execute(stmt)
        await self._session.flush()


class SqlPropertyAuditLogRepository(PropertyAuditLogRepository):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_by_property(
        self,
        property_id: uuid.UUID,
        *,
        offset: int = 0,
        limit: int = 50,
    ) -> list[PropertyAuditLog]:
        stmt = (
            select(PropertyAuditLogModel)
            .where(PropertyAuditLogModel.property_id == property_id)
            .order_by(PropertyAuditLogModel.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        result = await self._session.scalars(stmt)
        return [_model_to_audit(m) for m in result.all()]

    async def save(self, log: PropertyAuditLog) -> PropertyAuditLog:
        model = PropertyAuditLogModel(
            id=log.id,
            property_id=log.property_id,
            changed_by=log.changed_by,
            field_name=log.field_name,
            old_value=log.old_value,
            new_value=log.new_value,
            action=log.action.value,
        )
        self._session.add(model)
        await self._session.flush()
        await self._session.refresh(model)
        return _model_to_audit(model)


def _model_to_tag(m):
    from app.domain.property.entities import PropertyTag

    return PropertyTag(
        id=m.id,
        company_id=m.company_id,
        name=m.name,
        color=m.color,
        created_at=m.created_at,
    )


class SqlPropertyTagRepository:
    """SQL implementation of PropertyTagRepository."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_by_id(self, tag_id: uuid.UUID):
        from app.infrastructure.models.property import PropertyTagModel

        result = await self._session.get(PropertyTagModel, tag_id)
        return _model_to_tag(result) if result else None

    async def list_by_company(self, company_id: uuid.UUID):
        from app.infrastructure.models.property import PropertyTagModel

        stmt = select(PropertyTagModel).where(PropertyTagModel.company_id == company_id).order_by(PropertyTagModel.name)
        result = await self._session.scalars(stmt)
        return [_model_to_tag(m) for m in result.all()]

    async def save(self, tag):
        from app.infrastructure.models.property import PropertyTagModel

        model = PropertyTagModel(
            id=tag.id,
            company_id=tag.company_id,
            name=tag.name,
            color=tag.color,
        )
        self._session.add(model)
        await self._session.flush()
        await self._session.refresh(model)
        return _model_to_tag(model)

    async def update(self, tag):
        from app.infrastructure.models.property import PropertyTagModel

        stmt = update(PropertyTagModel).where(PropertyTagModel.id == tag.id).values(name=tag.name, color=tag.color)
        await self._session.execute(stmt)
        await self._session.flush()
        result = await self._session.get(PropertyTagModel, tag.id)
        return _model_to_tag(result)

    async def delete(self, tag_id: uuid.UUID) -> None:
        from app.infrastructure.models.property import PropertyTagModel

        stmt = delete(PropertyTagModel).where(PropertyTagModel.id == tag_id)
        await self._session.execute(stmt)
        await self._session.flush()

    async def exists_name(self, company_id: uuid.UUID, name: str, *, exclude_id: uuid.UUID | None = None) -> bool:
        from app.infrastructure.models.property import PropertyTagModel

        stmt = (
            select(func.count())
            .select_from(PropertyTagModel)
            .where(PropertyTagModel.company_id == company_id, PropertyTagModel.name == name)
        )
        if exclude_id is not None:
            stmt = stmt.where(PropertyTagModel.id != exclude_id)
        result = await self._session.scalar(stmt)
        return (result or 0) > 0

    async def assign_tag(self, property_id: uuid.UUID, tag_id: uuid.UUID) -> None:
        from app.infrastructure.models.property import PropertyTagAssociationModel

        self._session.add(PropertyTagAssociationModel(property_id=property_id, tag_id=tag_id))
        await self._session.flush()

    async def remove_tag(self, property_id: uuid.UUID, tag_id: uuid.UUID) -> None:
        from app.infrastructure.models.property import PropertyTagAssociationModel

        stmt = delete(PropertyTagAssociationModel).where(
            PropertyTagAssociationModel.property_id == property_id,
            PropertyTagAssociationModel.tag_id == tag_id,
        )
        await self._session.execute(stmt)
        await self._session.flush()

    async def get_property_tags(self, property_id: uuid.UUID):
        from app.infrastructure.models.property import PropertyTagAssociationModel, PropertyTagModel

        stmt = (
            select(PropertyTagModel)
            .join(PropertyTagAssociationModel, PropertyTagModel.id == PropertyTagAssociationModel.tag_id)
            .where(PropertyTagAssociationModel.property_id == property_id)
            .order_by(PropertyTagModel.name)
        )
        result = await self._session.scalars(stmt)
        return [_model_to_tag(m) for m in result.all()]

    async def get_property_ids_by_tag(self, tag_id: uuid.UUID) -> list[uuid.UUID]:
        from app.infrastructure.models.property import PropertyTagAssociationModel

        stmt = select(PropertyTagAssociationModel.property_id).where(PropertyTagAssociationModel.tag_id == tag_id)
        result = await self._session.scalars(stmt)
        return list(result.all())
