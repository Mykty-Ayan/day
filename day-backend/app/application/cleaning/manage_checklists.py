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
        sort_order: int | None = None,
    ) -> CleaningChecklistItem:
        template = await self._template_repo.get_by_id(template_id)
        if template is None:
            raise ValueError("Checklist template not found")
        if template.company_id != company_id:
            raise ValueError("Template does not belong to company")
        if sort_order is not None and sort_order < 0:
            raise ValueError("sort_order must be non-negative")
        if sort_order is None:
            existing_items = await self._item_repo.list_by_template(template_id)
            sort_order = max((i.sort_order for i in existing_items), default=-1) + 1
        return await self._item_repo.create(
            CleaningChecklistItem(
                template_id=template_id,
                title=title,
                sort_order=sort_order,
            )
        )

    async def reorder_items(
        self,
        template_id: uuid.UUID,
        company_id: uuid.UUID,
        item_ids: list[uuid.UUID],
    ) -> list[CleaningChecklistItem]:
        template = await self._template_repo.get_by_id(template_id)
        if template is None:
            raise ValueError("Checklist template not found")
        if template.company_id != company_id:
            raise ValueError("Template does not belong to company")
        if not item_ids:
            raise ValueError("item_ids cannot be empty")

        current_items = await self._item_repo.list_by_template(template_id)
        current_ids = [item.id for item in current_items]
        if len(item_ids) != len(current_ids):
            raise ValueError("Reorder request must include all template items")
        if len(set(item_ids)) != len(item_ids):
            raise ValueError("Reorder request contains duplicate item IDs")
        if set(item_ids) != set(current_ids):
            raise ValueError("Reorder request contains unknown item IDs")

        await self._item_repo.reorder(template_id, item_ids)
        return await self._item_repo.list_by_template(template_id)

    async def delete_item(
        self,
        item_id: uuid.UUID,
    ) -> None:
        await self._item_repo.delete(item_id)
