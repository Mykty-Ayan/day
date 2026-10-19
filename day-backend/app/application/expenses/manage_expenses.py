"""Recording the company's expenses, and voiding a wrong one."""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal

from app.domain.expenses.entities import Expense, ExpenseCategory
from app.domain.expenses.repositories import ExpenseRepository
from app.domain.property.repositories import PropertyRepository
from app.domain.property.value_objects import PropertyStatus


@dataclass
class NewExpense:
    company_id: uuid.UUID
    category: ExpenseCategory
    amount: Decimal
    spent_on: date
    created_by: uuid.UUID | None
    property_id: uuid.UUID | None = None
    payee: str | None = None
    note: str | None = None


class ManageExpensesService:
    def __init__(self, expenses: ExpenseRepository, properties: PropertyRepository) -> None:
        self._expenses = expenses
        self._properties = properties

    async def add(self, new: NewExpense) -> Expense:
        if new.amount <= 0:
            raise ValueError("The amount must be above zero")
        if new.category == ExpenseCategory.RENT and new.property_id is None:
            raise ValueError("Rent is paid for a flat: choose the flat")
        if new.property_id is not None:
            prop = await self._properties.get_by_id(new.property_id)
            # Another company's flat answers the same as no flat: nothing about it leaks.
            if prop is None or prop.company_id != new.company_id or prop.status == PropertyStatus.ARCHIVED:
                raise ValueError("No such flat in the company")
        return await self._expenses.add(
            Expense(
                company_id=new.company_id,
                category=new.category,
                amount=new.amount,
                spent_on=new.spent_on,
                property_id=new.property_id,
                payee=(new.payee or "").strip() or None,
                note=(new.note or "").strip() or None,
                created_by=new.created_by,
            )
        )

    async def list(
        self,
        company_id: uuid.UUID,
        *,
        date_from: date | None = None,
        date_to: date | None = None,
        property_id: uuid.UUID | None = None,
        category: ExpenseCategory | None = None,
        include_voided: bool = False,
    ) -> Sequence[Expense]:
        return await self._expenses.list(
            company_id,
            date_from=date_from,
            date_to=date_to,
            property_id=property_id,
            category=category,
            include_voided=include_voided,
        )

    async def void(self, company_id: uuid.UUID, expense_id: uuid.UUID, voided_by: uuid.UUID | None) -> Expense:
        expense = await self._expenses.get(company_id, expense_id)
        if expense is None:
            raise LookupError("Expense not found")
        if expense.voided_at is not None:
            raise ValueError("The expense is voided already")
        expense.voided_at = datetime.utcnow()
        expense.voided_by = voided_by
        return await self._expenses.update(expense)
