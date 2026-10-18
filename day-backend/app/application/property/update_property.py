from __future__ import annotations

import enum
import uuid
from dataclasses import dataclass

from app.application.property.create_property import check_stay_nights, check_turnover_hours
from app.domain.property.entities import Property, PropertyAuditLog
from app.domain.property.repositories import PropertyAuditLogRepository, PropertyRepository
from app.domain.property.value_objects import AuditAction, PropertyStatus

# Sentinel for "not provided"
_UNSET = object()


@dataclass
class UpdatePropertyInput:
    property_id: uuid.UUID
    company_id: uuid.UUID
    name: object = _UNSET
    internal_name: object = _UNSET
    type: object = _UNSET
    rental_mode: object = _UNSET
    description: object = _UNSET
    source_url: object = _UNSET
    latitude: object = _UNSET
    longitude: object = _UNSET
    address_full: object = _UNSET
    apartment_number: object = _UNSET
    entrance: object = _UNSET
    block: object = _UNSET
    floor: object = _UNSET
    complex_name: object = _UNSET
    floors_total: object = _UNSET
    map_url: object = _UNSET
    whatsapp_product_url: object = _UNSET
    video_url: object = _UNSET
    listing_urls: object = _UNSET
    hourly_listing_urls: object = _UNSET
    min_nights: object = _UNSET
    max_nights: object = _UNSET
    buffer_hours: object = _UNSET
    min_lead_hours: object = _UNSET
    rooms: object = _UNSET
    beds: object = _UNSET
    max_guests: object = _UNSET
    bathrooms: object = _UNSET
    check_in_hour: object = _UNSET
    check_out_hour: object = _UNSET
    check_in_method: object = _UNSET
    area_living: object = _UNSET
    area_total: object = _UNSET
    check_in_instructions: object = _UNSET
    check_out_instructions: object = _UNSET
    house_rules: object = _UNSET
    wifi_name: object = _UNSET
    wifi_password: object = _UNSET
    # Set from the authenticated caller; a service key attributes the change
    # to the operator who issued it.
    changed_by: uuid.UUID | None = None


_UPDATABLE_FIELDS = {
    "name", "internal_name", "type", "rental_mode", "description", "source_url",
    "latitude", "longitude", "address_full", "apartment_number",
    "entrance", "block", "floor", "rooms", "beds", "max_guests", "bathrooms",
    "complex_name", "floors_total", "map_url", "whatsapp_product_url", "video_url",
    "listing_urls", "hourly_listing_urls",
    "min_nights", "max_nights", "buffer_hours", "min_lead_hours",
    "check_in_hour", "check_out_hour", "check_in_method",
    "area_living", "area_total",
    "check_in_instructions", "check_out_instructions", "house_rules",
    "wifi_name", "wifi_password",
}


_SECRET_FIELDS = {"wifi_password"}


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

        # One hour in a PATCH is checked against the other as saved.
        check_turnover_hours(
            prop.check_in_hour if inp.check_in_hour is _UNSET else inp.check_in_hour,  # type: ignore[arg-type]
            prop.check_out_hour if inp.check_out_hour is _UNSET else inp.check_out_hour,  # type: ignore[arg-type]
        )
        check_stay_nights(
            prop.min_nights if inp.min_nights is _UNSET else inp.min_nights,  # type: ignore[arg-type]
            prop.max_nights if inp.max_nights is _UNSET else inp.max_nights,  # type: ignore[arg-type]
        )

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
            # Any enum compares and audits by its value ("lockbox", not "CheckInMethod.LOCKBOX").
            if isinstance(new_val, enum.Enum):
                new_val_str = new_val.value
            else:
                new_val_str = str(new_val) if new_val is not None else None
            old_val_str = old_val.value if isinstance(old_val, enum.Enum) else (
                str(old_val) if old_val is not None else None
            )
            if new_val_str != old_val_str:
                setattr(prop, field_name, new_val)
                if field_name in _SECRET_FIELDS:
                    # Who changed it and when is the useful part; the value
                    # would hand the password to everyone who reads history.
                    old_val_str = "***" if old_val_str is not None else None
                    new_val_str = "***" if new_val_str is not None else None
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
