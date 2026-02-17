from __future__ import annotations

import uuid
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation

from app.application.property.create_property import CreatePropertyInput, CreatePropertyService
from app.application.property.manage_photos import ManagePhotosService
from app.application.property.manage_pricing import ManagePricingService, PricingConfigInput
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
        pricing_svc: ManagePricingService | None = None,
        photos_svc: ManagePhotosService | None = None,
    ) -> None:
        self._import_job_repo = import_job_repo
        self._create_property_svc = create_property_svc
        self._pricing_svc = pricing_svc
        self._photos_svc = photos_svc

    @staticmethod
    def _safe_decimal(value: object) -> Decimal | None:
        if value is None:
            return None
        try:
            return Decimal(str(value))
        except (InvalidOperation, ValueError, TypeError):
            return None

    @staticmethod
    def _extract_photo_urls(value: object) -> list[str]:
        if not isinstance(value, list):
            return []
        seen: set[str] = set()
        urls: list[str] = []
        for item in value:
            if not isinstance(item, str):
                continue
            url = item.strip()
            if not url.startswith(("http://", "https://")):
                continue
            if url in seen:
                continue
            seen.add(url)
            urls.append(url)
        return urls

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

        created = await self._create_property_svc.execute(prop_input)

        # Persist extracted nightly base price into pricing config if provided.
        if self._pricing_svc is not None:
            base_price = self._safe_decimal(data.get("base_price"))
            if base_price is not None and base_price >= 0:
                await self._pricing_svc.upsert_pricing(
                    created.id,
                    inp.company_id,
                    PricingConfigInput(base_price=base_price),
                )

        # Persist extracted photos as property photos.
        if self._photos_svc is not None:
            for idx, url in enumerate(self._extract_photo_urls(data.get("photos"))[:40]):
                await self._photos_svc.add_photo(
                    created.id,
                    inp.company_id,
                    url,
                    sort_order=idx,
                    is_cover=(idx == 0),
                )

        return created
