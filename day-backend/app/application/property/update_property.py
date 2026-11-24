from __future__ import annotations

import enum
import uuid
from dataclasses import dataclass
from decimal import Decimal

from app.application.property.create_property import (
    check_late_check_out,
    check_listing_kinds,
    check_stay_nights,
    check_turnover_hours,
)
from app.domain.property.entities import GUESTS_REQUIRED, Property, PropertyAuditLog
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
    buffer_minutes: object = _UNSET
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
    nearby: object = _UNSET
    late_check_out_hour: object = _UNSET
    late_check_out_price: object = _UNSET
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
    "min_nights", "max_nights", "buffer_minutes", "min_lead_hours",
    "check_in_hour", "check_out_hour", "check_in_method", "late_check_out_hour", "late_check_out_price",
    "area_living", "area_total",
    "check_in_instructions", "check_out_instructions", "house_rules", "nearby",
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
            # Only its number of guests may be added: without it the flat could never go on sale again.
            given = {name for name in _UPDATABLE_FIELDS if getattr(inp, name, _UNSET) is not _UNSET}
            if given != {"max_guests"} or inp.max_guests is None:
                raise ValueError("Cannot update an archived property")

        # One hour in a PATCH is checked against the other as saved.
        check_turnover_hours(
            prop.check_in_hour if inp.check_in_hour is _UNSET else inp.check_in_hour,  # type: ignore[arg-type]
            prop.check_out_hour if inp.check_out_hour is _UNSET else inp.check_out_hour,  # type: ignore[arg-type]
        )
        check_late_check_out(
            prop.check_out_hour if inp.check_out_hour is _UNSET else inp.check_out_hour,  # type: ignore[arg-type]
            prop.late_check_out_hour if inp.late_check_out_hour is _UNSET else inp.late_check_out_hour,  # type: ignore[arg-type]
            prop.late_check_out_price if inp.late_check_out_price is _UNSET else inp.late_check_out_price,  # type: ignore[arg-type]
        )
        check_stay_nights(
            prop.min_nights if inp.min_nights is _UNSET else inp.min_nights,  # type: ignore[arg-type]
            prop.max_nights if inp.max_nights is _UNSET else inp.max_nights,  # type: ignore[arg-type]
        )
        check_listing_kinds(
            prop.listing_urls if inp.listing_urls is _UNSET else inp.listing_urls,  # type: ignore[arg-type]
            prop.hourly_listing_urls if inp.hourly_listing_urls is _UNSET else inp.hourly_listing_urls,  # type: ignore[arg-type]
        )

        # A flat on sale keeps its number of guests: without it any party is offered the flat.
        if prop.status == PropertyStatus.ACTIVE and inp.max_guests is None:
            raise ValueError(GUESTS_REQUIRED)

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
            # A price sent back as typed (5000) is the one stored (5000.00): no change to record.
            if isinstance(new_val, Decimal) and isinstance(old_val, Decimal) and new_val == old_val:
                continue
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

    async def copy_nearby(
        self,
        source_id: uuid.UUID,
        target_ids: list[uuid.UUID],
        company_id: uuid.UUID,
        changed_by: uuid.UUID | None,
    ) -> int:
        """Give the chosen flats this flat's list «Рядом» in place of theirs, each change in
        its own history. All or none: a flat of another company, or an archived one, refuses
        the whole copy. Returns how many flats took the list."""
        source = await self._property_repo.get_by_id(source_id)
        if source is None or source.company_id != company_id:
            raise ValueError("Property not found")
        changed = 0
        for target_id in dict.fromkeys(target_ids):
            if target_id == source_id:
                continue
            inp = UpdatePropertyInput(property_id=target_id, company_id=company_id, changed_by=changed_by)
            # Each flat its own list: an edit of one later leaves the others as they are.
            inp.nearby = [dict(place) for place in source.nearby]
            await self.execute(inp)
            changed += 1
        return changed
