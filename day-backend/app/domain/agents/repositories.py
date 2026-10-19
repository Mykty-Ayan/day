from __future__ import annotations

import abc
import uuid
from collections.abc import Sequence

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
