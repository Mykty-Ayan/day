from __future__ import annotations

import uuid
from dataclasses import dataclass

from app.domain.property.entities import Property, PropertyAuditLog
from app.domain.property.repositories import PropertyAuditLogRepository, PropertyRepository
from app.domain.property.value_objects import AuditAction, PropertyStatus, PropertyType

# Sentinel for "not provided"
_UNSET = object()


@dataclass
class UpdatePropertyInput:
    property_id: uuid.UUID
    company_id: uuid.UUID
    name: object = _UNSET
    internal_name: object = _UNSET
    type: object = _UNSET
    description: object = _UNSET
    source_url: object = _UNSET
    latitude: object = _UNSET
    longitude: object = _UNSET
    address_full: object = _UNSET
    apartment_number: object = _UNSET
    entrance: object = _UNSET
    block: object = _UNSET
    floor: object = _UNSET
    rooms: object = _UNSET
    beds: object = _UNSET
    area_living: object = _UNSET
    area_total: object = _UNSET
    check_in_instructions: object = _UNSET
    check_out_instructions: object = _UNSET
    house_rules: object = _UNSET
    # TODO: replace with authenticated user_id when auth is implemented
    changed_by: uuid.UUID | None = None


_UPDATABLE_FIELDS = {
    "name", "internal_name", "type", "description", "source_url",
    "latitude", "longitude", "address_full", "apartment_number",
    "entrance", "block", "floor", "rooms", "beds",
    "area_living", "area_total",
    "check_in_instructions", "check_out_instructions", "house_rules",
}


class UpdatePropertyService:
    def __init__(
        self,
        property_repo: PropertyRepository,
        audit_repo: PropertyAuditLogRepository,
    ) -> None:
        self._property_repo = property_repo
        self._audit_repo = audit_repo

    async def execute(self, inp: UpdatePropertyInput) -> Property:
        prop = await self._property_repo.get_by_id(inp.property_id)
        if prop is None:
            raise ValueError("Property not found")
        if prop.company_id != inp.company_id:
            raise ValueError("Property not found")
        if prop.status == PropertyStatus.ARCHIVED:
            raise ValueError("Cannot update an archived property")

        # Check unique internal_name if changed
        new_internal = getattr(inp, "internal_name", _UNSET)
        if new_internal is not _UNSET and new_internal != prop.internal_name:
            if await self._property_repo.exists_internal_name(
                inp.company_id, new_internal, exclude_id=prop.id  # type: ignore[arg-type]
            ):
                raise ValueError(
                    f"Property with internal name '{new_internal}' already exists"
                )

        # Apply changes and record audit logs
        for field_name in _UPDATABLE_FIELDS:
            new_val = getattr(inp, field_name, _UNSET)
            if new_val is _UNSET:
                continue
            old_val = getattr(prop, field_name)
            # Convert enums for comparison
            if isinstance(new_val, PropertyType):
                new_val_str = new_val.value
            else:
                new_val_str = str(new_val) if new_val is not None else None
            old_val_str = old_val.value if isinstance(old_val, PropertyType) else (
                str(old_val) if old_val is not None else None
            )
            if new_val_str != old_val_str:
                setattr(prop, field_name, new_val)
                await self._audit_repo.save(
                    PropertyAuditLog(
                        property_id=prop.id,
                        changed_by=inp.changed_by,
                        field_name=field_name,
                        old_value=old_val_str,
                        new_value=new_val_str,
                        action=AuditAction.UPDATE,
                    )
                )

        return await self._property_repo.update(prop)
