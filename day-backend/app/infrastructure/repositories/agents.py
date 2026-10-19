from __future__ import annotations

import uuid
from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.agents.entities import Agent
from app.domain.agents.repositories import AgentRepository
from app.infrastructure.models.agents import AgentModel


def _to_agent(m: AgentModel) -> Agent:
    return Agent(
        id=m.id, company_id=m.company_id, name=m.name, phone=m.phone, note=m.note,
        is_active=m.is_active, created_at=m.created_at,
    )


class SqlAgentRepository(AgentRepository):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def add(self, agent: Agent) -> Agent:
        model = AgentModel(
            id=agent.id, company_id=agent.company_id, name=agent.name, phone=agent.phone, note=agent.note,
            is_active=agent.is_active,
        )
        self._session.add(model)
        await self._session.flush()
        await self._session.refresh(model)
        return _to_agent(model)

    async def get(self, company_id: uuid.UUID, agent_id: uuid.UUID) -> Agent | None:
        model = await self._session.scalar(
            select(AgentModel).where(AgentModel.id == agent_id, AgentModel.company_id == company_id)
        )
        return _to_agent(model) if model else None

    async def list(self, company_id: uuid.UUID, *, include_inactive: bool = False) -> Sequence[Agent]:
        stmt = select(AgentModel).where(AgentModel.company_id == company_id)
        if not include_inactive:
            stmt = stmt.where(AgentModel.is_active.is_(True))
        return [_to_agent(m) for m in await self._session.scalars(stmt.order_by(AgentModel.name))]

    async def update(self, agent: Agent) -> Agent:
        model = await self._session.scalar(
            select(AgentModel).where(AgentModel.id == agent.id, AgentModel.company_id == agent.company_id)
        )
        if model is None:
            raise LookupError("Agent not found")
        model.name, model.phone, model.note, model.is_active = agent.name, agent.phone, agent.note, agent.is_active
        await self._session.flush()
        return _to_agent(model)
