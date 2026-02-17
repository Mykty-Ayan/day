from __future__ import annotations

import uuid
from dataclasses import dataclass

from app.application.property.create_property import CreatePropertyInput, CreatePropertyService
from app.domain.ai_migration.repositories import ImportJobRepository
from app.domain.ai_migration.value_objects import ImportJobStatus
from app.domain.property.entities import Property
from app.domain.property.value_objects import PropertyType


@dataclass
class ConfirmImportInput:
    job_id: uuid.UUID
    company_id: uuid.UUID
    property_data: dict
    changed_by: uuid.UUID | None = None


class ConfirmImportService:
    def __init__(
        self,
        import_job_repo: ImportJobRepository,
        create_property_svc: CreatePropertyService,
    ) -> None:
        self._import_job_repo = import_job_repo
        self._create_property_svc = create_property_svc

    async def execute(self, inp: ConfirmImportInput) -> Property:
        job = await self._import_job_repo.get_by_id(inp.job_id)
        if job is None or job.company_id != inp.company_id:
            raise ValueError("Import job not found")

        if job.status != ImportJobStatus.COMPLETED:
            raise ValueError(f"Import job is not completed (status: {job.status.value})")

        data = inp.property_data
        prop_input = CreatePropertyInput(
            company_id=inp.company_id,
            name=data.get("name", ""),
            internal_name=data.get("internal_name", ""),
            type=PropertyType(data.get("type", "apartment")),
            description=data.get("description"),
            source_url=data.get("source_url", job.source_url),
            latitude=data.get("latitude"),
            longitude=data.get("longitude"),
            address_full=data.get("address_full"),
            apartment_number=data.get("apartment_number"),
            entrance=data.get("entrance"),
            block=data.get("block"),
            floor=data.get("floor"),
            rooms=data.get("rooms"),
            beds=data.get("beds"),
            area_living=data.get("area_living"),
            area_total=data.get("area_total"),
            check_in_instructions=data.get("check_in_instructions"),
            check_out_instructions=data.get("check_out_instructions"),
            house_rules=data.get("house_rules"),
            changed_by=inp.changed_by,
        )

        return await self._create_property_svc.execute(prop_input)
