from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.expenses.entities import Expense, ExpenseCategory
from app.domain.expenses.repositories import ExpenseRepository
from app.infrastructure.models.expenses import ExpenseModel


def _to_expense(m: ExpenseModel) -> Expense:
    return Expense(
        id=m.id,
        company_id=m.company_id,
        property_id=m.property_id,
        category=ExpenseCategory(m.category),
        amount=Decimal(str(m.amount)),
        spent_on=m.spent_on,
        payee=m.payee,
        note=m.note,
        created_by=m.created_by,
        created_at=m.created_at,
        voided_at=m.voided_at,
        voided_by=m.voided_by,
    )


class SqlExpenseRepository(ExpenseRepository):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def add(self, expense: Expense) -> Expense:
        model = ExpenseModel(
            id=expense.id,
            company_id=expense.company_id,
            property_id=expense.property_id,
            category=expense.category.value,
            amount=expense.amount,
            spent_on=expense.spent_on,
            payee=expense.payee,
            note=expense.note,
            created_by=expense.created_by,
        )
        self._session.add(model)
        await self._session.flush()
        await self._session.refresh(model)
        return _to_expense(model)

    async def get(self, company_id: uuid.UUID, expense_id: uuid.UUID) -> Expense | None:
        model = await self._session.scalar(
            select(ExpenseModel).where(ExpenseModel.id == expense_id, ExpenseModel.company_id == company_id)
        )
        return _to_expense(model) if model else None

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
        stmt = select(ExpenseModel).where(ExpenseModel.company_id == company_id)
        if not include_voided:
            stmt = stmt.where(ExpenseModel.voided_at.is_(None))
        if date_from is not None:
            stmt = stmt.where(ExpenseModel.spent_on >= date_from)
        if date_to is not None:
            stmt = stmt.where(ExpenseModel.spent_on <= date_to)
        if property_id is not None:
            stmt = stmt.where(ExpenseModel.property_id == property_id)
        if category is not None:
            stmt = stmt.where(ExpenseModel.category == category.value)
        stmt = stmt.order_by(ExpenseModel.spent_on.desc(), ExpenseModel.created_at.desc())
        return [_to_expense(m) for m in await self._session.scalars(stmt)]

    async def void(
        self, company_id: uuid.UUID, expense_id: uuid.UUID, voided_by: uuid.UUID | None, at: datetime
    ) -> Expense | None:
        # One conditional update: of two voids at once, the second changes nothing.
        model = await self._session.scalar(
            update(ExpenseModel)
            .where(
                ExpenseModel.id == expense_id,
                ExpenseModel.company_id == company_id,
                ExpenseModel.voided_at.is_(None),
            )
            .values(voided_at=at, voided_by=voided_by)
            .returning(ExpenseModel)
        )
        return _to_expense(model) if model else None
