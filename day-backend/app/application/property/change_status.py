from __future__ import annotations

import uuid

from app.domain.property.entities import Property, PropertyAuditLog
from app.domain.property.repositories import PropertyAuditLogRepository, PropertyRepository
from app.domain.property.value_objects import AuditAction, PropertyStatus


class ChangePropertyStatusService:
    def __init__(
        self,
        property_repo: PropertyRepository,
        audit_repo: PropertyAuditLogRepository,
    ) -> None:
        self._property_repo = property_repo
        self._audit_repo = audit_repo

    async def execute(
        self,
        property_id: uuid.UUID,
        company_id: uuid.UUID,
        new_status: PropertyStatus,
        *,
        changed_by: uuid.UUID | None = None,
    ) -> Property:
        prop = await self._property_repo.get_by_id(property_id)
        if prop is None:
            raise ValueError("Property not found")
        if prop.company_id != company_id:
            raise ValueError("Property not found")

        old_status = prop.status
        prop.change_status(new_status)  # raises ValueError on invalid transition

        updated = await self._property_repo.update(prop)

        await self._audit_repo.save(
            PropertyAuditLog(
                property_id=prop.id,
                changed_by=changed_by,
                field_name="status",
                old_value=old_status.value,
                new_value=new_status.value,
                action=AuditAction.STATUS_CHANGE,
            )
        )

        return updated
