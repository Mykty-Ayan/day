from __future__ import annotations

import uuid
from dataclasses import dataclass

from app.domain.booking.value_objects import RentalMode
from app.domain.property.entities import Property, PropertyAuditLog
from app.domain.property.repositories import PropertyAuditLogRepository, PropertyRepository
from app.domain.property.value_objects import AuditAction, PropertyStatus, PropertyType


@dataclass
class CreatePropertyInput:
    company_id: uuid.UUID
    name: str
    internal_name: str
    type: PropertyType
    rental_mode: RentalMode = RentalMode.DAILY
    description: str | None = None
    source_url: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    address_full: str | None = None
    apartment_number: str | None = None
    entrance: str | None = None
    block: str | None = None
    floor: int | None = None
    rooms: int | None = None
    beds: int | None = None
    area_living: float | None = None
    area_total: float | None = None
    check_in_instructions: str | None = None
    check_out_instructions: str | None = None
    house_rules: str | None = None
    wifi_name: str | None = None
    wifi_password: str | None = None
    # Set from the authenticated caller; a service key attributes the change
    # to the operator who issued it.
    changed_by: uuid.UUID | None = None


class CreatePropertyService:
    def __init__(
        self,
        property_repo: PropertyRepository,
        audit_repo: PropertyAuditLogRepository,
    ) -> None:
        self._property_repo = property_repo
        self._audit_repo = audit_repo

    async def execute(self, inp: CreatePropertyInput) -> Property:
        if await self._property_repo.exists_internal_name(
            inp.company_id, inp.internal_name
        ):
            raise ValueError(
                f"Property with internal name '{inp.internal_name}' already exists"
            )

        prop = Property(
            id=uuid.uuid4(),
            company_id=inp.company_id,
            name=inp.name,
            internal_name=inp.internal_name,
            type=inp.type,
            status=PropertyStatus.NEW,
            rental_mode=inp.rental_mode,
            description=inp.description,
            source_url=inp.source_url,
            latitude=inp.latitude,
            longitude=inp.longitude,
            address_full=inp.address_full,
            apartment_number=inp.apartment_number,
            entrance=inp.entrance,
            block=inp.block,
            floor=inp.floor,
            rooms=inp.rooms,
            beds=inp.beds,
            area_living=inp.area_living,
            area_total=inp.area_total,
            check_in_instructions=inp.check_in_instructions,
            check_out_instructions=inp.check_out_instructions,
            house_rules=inp.house_rules,
            wifi_name=inp.wifi_name,
            wifi_password=inp.wifi_password,
        )

        saved = await self._property_repo.save(prop)

        await self._audit_repo.save(
            PropertyAuditLog(
                property_id=saved.id,
                changed_by=inp.changed_by,
                field_name="*",
                old_value=None,
                new_value=None,
                action=AuditAction.CREATE,
            )
        )

        return saved
