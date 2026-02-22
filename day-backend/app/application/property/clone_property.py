from __future__ import annotations

import uuid

from app.domain.property.entities import (
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
from app.domain.property.value_objects import AuditAction, PropertyStatus


class ClonePropertyService:
    def __init__(
        self,
        property_repo: PropertyRepository,
        photo_repo: PropertyPhotoRepository,
        amenity_repo: AmenityRepository,
        pricing_repo: PricingConfigRepository,
        seasonal_repo: SeasonalPriceRepository,
        discount_repo: DiscountRuleRepository,
        audit_repo: PropertyAuditLogRepository,
    ) -> None:
        self._property_repo = property_repo
        self._photo_repo = photo_repo
        self._amenity_repo = amenity_repo
        self._pricing_repo = pricing_repo
        self._seasonal_repo = seasonal_repo
        self._discount_repo = discount_repo
        self._audit_repo = audit_repo

    async def execute(
        self,
        property_id: uuid.UUID,
        company_id: uuid.UUID,
        *,
        changed_by: uuid.UUID | None = None,
    ) -> Property:
        # Fetch the source property
        source = await self._property_repo.get_by_id(property_id)
        if source is None or source.company_id != company_id:
            raise ValueError("Property not found")

        # Generate clone name
        clone_internal_name = await self._property_repo.find_next_clone_name(company_id, source.internal_name)

        # Clone the property with new ID, status=new, and new internal_name
        clone = Property(
            id=uuid.uuid4(),
            company_id=company_id,
            name=f"{source.name} (copy)",
            internal_name=clone_internal_name,
            type=source.type,
            status=PropertyStatus.NEW,
            description=source.description,
            source_url=source.source_url,
            latitude=source.latitude,
            longitude=source.longitude,
            address_full=source.address_full,
            apartment_number=source.apartment_number,
            entrance=source.entrance,
            block=source.block,
            floor=source.floor,
            rooms=source.rooms,
            beds=source.beds,
            area_living=source.area_living,
            area_total=source.area_total,
            check_in_instructions=source.check_in_instructions,
            check_out_instructions=source.check_out_instructions,
            house_rules=source.house_rules,
        )
        saved = await self._property_repo.save(clone)

        # Clone photos
        photos = await self._photo_repo.list_by_property(property_id)
        for photo in photos:
            await self._photo_repo.save(
                PropertyPhoto(
                    id=uuid.uuid4(),
                    property_id=saved.id,
                    url=photo.url,
                    sort_order=photo.sort_order,
                    is_cover=photo.is_cover,
                )
            )

        # Clone amenities
        amenities = await self._amenity_repo.get_property_amenities(property_id)
        if amenities:
            await self._amenity_repo.set_property_amenities(saved.id, [a.id for a in amenities])

        # Clone pricing config, seasonal prices, and discount rules
        pricing = await self._pricing_repo.get_by_property(property_id)
        if pricing:
            new_pricing = await self._pricing_repo.save(
                PricingConfig(
                    id=uuid.uuid4(),
                    property_id=saved.id,
                    base_price=pricing.base_price,
                    weekend_markup=pricing.weekend_markup,
                    default_deposit=pricing.default_deposit,
                    extra_adult_price=pricing.extra_adult_price,
                    extra_child_price=pricing.extra_child_price,
                    base_guests=pricing.base_guests,
                )
            )

            # Clone seasonal prices
            seasonal_prices = await self._seasonal_repo.list_by_pricing_config(pricing.id)
            for sp in seasonal_prices:
                await self._seasonal_repo.save(
                    SeasonalPrice(
                        id=uuid.uuid4(),
                        pricing_config_id=new_pricing.id,
                        name=sp.name,
                        start_date=sp.start_date,
                        end_date=sp.end_date,
                        price_per_night=sp.price_per_night,
                    )
                )

            # Clone discount rules
            discount_rules = await self._discount_repo.list_by_pricing_config(pricing.id)
            for dr in discount_rules:
                await self._discount_repo.save(
                    DiscountRule(
                        id=uuid.uuid4(),
                        pricing_config_id=new_pricing.id,
                        min_nights=dr.min_nights,
                        discount_percent=dr.discount_percent,
                        discount_fixed=dr.discount_fixed,
                    )
                )

        # Create audit log entry
        await self._audit_repo.save(
            PropertyAuditLog(
                property_id=saved.id,
                changed_by=changed_by,
                field_name="*",
                old_value=str(property_id),
                new_value=str(saved.id),
                action=AuditAction.CLONE,
            )
        )

        return saved
