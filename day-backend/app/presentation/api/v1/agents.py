"""Agents who bring guests: the operator names them on bookings."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.agents.entities import Agent
from app.domain.auth.permissions import Permission
from app.infrastructure.database import get_session
from app.infrastructure.repositories.agents import SqlAgentRepository
from app.presentation.api.deps import get_company_id, require
from app.presentation.schemas.agents import AgentCreate, AgentResponse, AgentUpdate

agent_router = APIRouter(prefix="/agents", tags=["agents"])


@agent_router.get("", response_model=list[AgentResponse], dependencies=[Depends(require(Permission.BOOKINGS_READ))])
async def list_agents(
    include_inactive: bool = Query(default=False),
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    agents = await SqlAgentRepository(session).list(company_id, include_inactive=include_inactive)
    return [AgentResponse.model_validate(a, from_attributes=True) for a in agents]


@agent_router.post(
    "",
    response_model=AgentResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require(Permission.BOOKINGS_WRITE))],
)
async def add_agent(
    body: AgentCreate,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    agent = await SqlAgentRepository(session).add(
        Agent(company_id=company_id, name=body.name, phone=body.phone, note=body.note)
    )
    await session.commit()
    return AgentResponse.model_validate(agent, from_attributes=True)


@agent_router.patch(
    "/{agent_id}", response_model=AgentResponse, dependencies=[Depends(require(Permission.BOOKINGS_WRITE))]
)
async def update_agent(
    agent_id: uuid.UUID,
    body: AgentUpdate,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
):
    repo = SqlAgentRepository(session)
    agent = await repo.get(company_id, agent_id)
    if agent is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
    for field_name, value in body.model_dump(exclude_unset=True).items():
        if field_name == "name" and value is None:
            continue
        setattr(agent, field_name, value)
    agent = await repo.update(agent)
    await session.commit()
    return AgentResponse.model_validate(agent, from_attributes=True)
