from __future__ import annotations

import abc
import uuid
from collections.abc import Sequence
from decimal import Decimal

from app.domain.agents.entities import Agent


class AgentRepository(abc.ABC):
    @abc.abstractmethod
    async def add(self, agent: Agent) -> Agent: ...

    @abc.abstractmethod
    async def get(self, company_id: uuid.UUID, agent_id: uuid.UUID) -> Agent | None: ...

    @abc.abstractmethod
    async def list(self, company_id: uuid.UUID, *, include_inactive: bool = False) -> Sequence[Agent]: ...

    @abc.abstractmethod
    async def update(self, agent: Agent) -> Agent: ...

    @abc.abstractmethod
    async def totals(self, company_id: uuid.UUID) -> dict[uuid.UUID, tuple[int, Decimal]]:
        """What each agent brought: the count and the sum of the bookings naming them, cancelled ones aside."""
