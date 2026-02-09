from __future__ import annotations

import uuid
from dataclasses import dataclass, field

from app.domain.cleaning.entities import CleaningChecklistItem, CleaningChecklistTemplate
from app.domain.cleaning.repositories import (
    CleaningChecklistItemRepository,
    CleaningChecklistTemplateRepository,
)


@dataclass
class ChecklistItemInput:
    title: str
    sort_order: int = 0


@dataclass
class CreateChecklistTemplateInput:
    company_id: uuid.UUID
    name: str
    items: list[ChecklistItemInput] = field(default_factory=list)


class ManageChecklistsService:
    def __init__(
        self,
        template_repo: CleaningChecklistTemplateRepository,
        item_repo: CleaningChecklistItemRepository,
    ) -> None:
        self._template_repo = template_repo
        self._item_repo = item_repo

    async def create_template(
        self, inp: CreateChecklistTemplateInput
    ) -> CleaningChecklistTemplate:
        template = await self._template_repo.create(
            CleaningChecklistTemplate(
                company_id=inp.company_id,
                name=inp.name,
            )
        )
        for item_inp in inp.items:
            await self._item_repo.create(
                CleaningChecklistItem(
                    template_id=template.id,
                    title=item_inp.title,
                    sort_order=item_inp.sort_order,
                )
            )
        return template

    async def list_templates(
        self, company_id: uuid.UUID
    ) -> list[CleaningChecklistTemplate]:
        return await self._template_repo.list_by_company(company_id)

    async def get_template_with_items(
        self, template_id: uuid.UUID, company_id: uuid.UUID
    ) -> tuple[CleaningChecklistTemplate, list[CleaningChecklistItem]]:
        template = await self._template_repo.get_by_id(template_id)
        if template is None:
            raise ValueError("Checklist template not found")
        if template.company_id != company_id:
            raise ValueError("Template does not belong to company")
        items = await self._item_repo.list_by_template(template_id)
        return template, items

    async def delete_template(
        self, template_id: uuid.UUID, company_id: uuid.UUID
    ) -> None:
        template = await self._template_repo.get_by_id(template_id)
        if template is None:
            raise ValueError("Checklist template not found")
        if template.company_id != company_id:
            raise ValueError("Template does not belong to company")
        await self._item_repo.delete_by_template(template_id)
        await self._template_repo.delete(template_id)

    async def add_item(
        self,
        template_id: uuid.UUID,
        company_id: uuid.UUID,
        title: str,
        sort_order: int = 0,
    ) -> CleaningChecklistItem:
        template = await self._template_repo.get_by_id(template_id)
        if template is None:
            raise ValueError("Checklist template not found")
        if template.company_id != company_id:
            raise ValueError("Template does not belong to company")
        return await self._item_repo.create(
            CleaningChecklistItem(
                template_id=template_id,
                title=title,
                sort_order=sort_order,
            )
        )

    async def delete_item(
        self,
        item_id: uuid.UUID,
    ) -> None:
        await self._item_repo.delete(item_id)
