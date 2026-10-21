"""The company's rules for guests: what holds in every flat (documents, pets, smoking, quiet hours)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.property.manage_company_facts import ManageCompanyFactsService
from app.domain.auth.permissions import Permission
from app.domain.property.value_objects import FactAudience, FactSource
from app.infrastructure.database import get_session
from app.infrastructure.repositories.property import SqlCompanyFactRepository
from app.presentation.api.deps import Principal, get_company_id, get_principal, require
from app.presentation.schemas.property import CompanyFactCreate, CompanyFactResponse

company_fact_router = APIRouter(prefix="/company-facts", tags=["company-facts"])


def _service(session: AsyncSession) -> ManageCompanyFactsService:
    return ManageCompanyFactsService(SqlCompanyFactRepository(session))


@company_fact_router.get(
    "", response_model=list[CompanyFactResponse], dependencies=[Depends(require(Permission.PROPERTIES_READ))]
)
async def list_company_facts(
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
    principal: Principal = Depends(get_principal),
):
    facts = await _service(session).list(company_id)
    # A rule only for a staying guest (a door code) is a secret, as on a flat.
    if Permission.PROPERTY_SECRETS_READ not in principal.permissions:
        facts = [f for f in facts if f.audience != FactAudience.GUEST]
    return [CompanyFactResponse.model_validate(f, from_attributes=True) for f in facts]


@company_fact_router.post(
    "",
    response_model=CompanyFactResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require(Permission.PROPERTY_FACTS_WRITE))],
)
async def add_company_fact(
    body: CompanyFactCreate,
    response: Response,
    session: AsyncSession = Depends(get_session),
    principal: Principal = Depends(get_principal),
):
    """Add a rule. The same text again answers 200 with the rule already kept."""
    source = FactSource.API_KEY if principal.kind == "api_key" else FactSource.USER
    try:
        fact, created = await _service(session).add(principal.company_id, body.text, body.audience, source=source)
    except ValueError as e:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    await session.commit()
    if not created:
        response.status_code = status.HTTP_200_OK
    return CompanyFactResponse.model_validate(fact, from_attributes=True)


@company_fact_router.delete(
    "/{fact_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require(Permission.PROPERTY_FACTS_WRITE))],
)
async def delete_company_fact(
    fact_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    try:
        await _service(session).delete(company_id, fact_id)
    except LookupError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    await session.commit()
