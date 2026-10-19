"""The company's expenses: record one, list them, void a wrong one."""

from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.expenses.manage_expenses import ManageExpensesService, NewExpense
from app.domain.auth.permissions import Permission
from app.domain.expenses.entities import ExpenseCategory
from app.infrastructure.database import get_session
from app.infrastructure.repositories.agents import SqlAgentRepository
from app.infrastructure.repositories.booking import SqlBookingRepository
from app.infrastructure.repositories.expenses import SqlExpenseRepository
from app.infrastructure.repositories.property import SqlPropertyRepository
from app.presentation.api.deps import Principal, get_company_id, get_principal, require
from app.presentation.schemas.expenses import ExpenseCreate, ExpenseResponse

expense_router = APIRouter(prefix="/expenses", tags=["expenses"])

_manage = [Depends(require(Permission.EXPENSES_MANAGE))]


def _service(session: AsyncSession) -> ManageExpensesService:
    return ManageExpensesService(
        SqlExpenseRepository(session),
        SqlPropertyRepository(session),
        SqlAgentRepository(session),
        SqlBookingRepository(session),
    )


@expense_router.post("", response_model=ExpenseResponse, status_code=status.HTTP_201_CREATED, dependencies=_manage)
async def add_expense(
    body: ExpenseCreate,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
    principal: Principal = Depends(get_principal),
):
    try:
        expense = await _service(session).add(
            NewExpense(
                company_id=company_id,
                category=body.category,
                amount=body.amount,
                spent_on=body.spent_on,
                property_id=body.property_id,
                payee=body.payee,
                note=body.note,
                agent_id=body.agent_id,
                booking_id=body.booking_id,
                created_by=principal.actor_id,
            )
        )
    except ValueError as e:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))
    await session.commit()
    return ExpenseResponse.model_validate(expense, from_attributes=True)


@expense_router.get("", response_model=list[ExpenseResponse], dependencies=_manage)
async def list_expenses(
    date_from: date | None = None,
    date_to: date | None = None,
    property_id: uuid.UUID | None = None,
    category: ExpenseCategory | None = None,
    include_voided: bool = Query(default=False),
    limit: int = Query(default=500, ge=1, le=2000),
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    if date_from is not None and date_to is not None and date_from > date_to:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="date_from is after date_to")
    rows = await _service(session).list(
        company_id,
        date_from=date_from,
        date_to=date_to,
        property_id=property_id,
        category=category,
        include_voided=include_voided,
    )
    return [ExpenseResponse.model_validate(e, from_attributes=True) for e in rows[:limit]]


@expense_router.post("/{expense_id}/void", response_model=ExpenseResponse, dependencies=_manage)
async def void_expense(
    expense_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
    principal: Principal = Depends(get_principal),
):
    try:
        expense = await _service(session).void(company_id, expense_id, principal.actor_id)
    except LookupError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expense not found")
    except ValueError as e:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
    await session.commit()
    return ExpenseResponse.model_validate(expense, from_attributes=True)
