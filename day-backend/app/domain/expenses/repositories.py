from __future__ import annotations

import abc
import uuid
from collections.abc import Sequence
from datetime import date

from app.domain.expenses.entities import Expense, ExpenseCategory


class ExpenseRepository(abc.ABC):
    @abc.abstractmethod
    async def add(self, expense: Expense) -> Expense: ...

    @abc.abstractmethod
    async def get(self, company_id: uuid.UUID, expense_id: uuid.UUID) -> Expense | None: ...

    @abc.abstractmethod
    async def list(
        self,
        company_id: uuid.UUID,
        *,
        date_from: date | None = None,
        date_to: date | None = None,
        property_id: uuid.UUID | None = None,
        category: ExpenseCategory | None = None,
        include_voided: bool = False,
    ) -> Sequence[Expense]: ...

    @abc.abstractmethod
    async def update(self, expense: Expense) -> Expense: ...
