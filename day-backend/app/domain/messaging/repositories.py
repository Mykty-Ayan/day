from __future__ import annotations

import abc
import uuid
from datetime import datetime

from app.domain.messaging.entities import (
    ChannelIdentity,
    ChannelLinkCode,
    Conversation,
    Message,
    OutboundNotification,
)
from app.domain.messaging.value_objects import Channel


class ChannelIdentityRepository(abc.ABC):
    @abc.abstractmethod
    async def get_by_external_id(self, channel: Channel, external_id: str) -> ChannelIdentity | None: ...

    @abc.abstractmethod
    async def list_by_company(
        self,
        company_id: uuid.UUID,
        *,
        channel: Channel | None = None,
        only_active: bool = True,
    ) -> list[ChannelIdentity]: ...

    @abc.abstractmethod
    async def save(self, identity: ChannelIdentity) -> ChannelIdentity: ...

    @abc.abstractmethod
    async def update(self, identity: ChannelIdentity) -> ChannelIdentity: ...


class ConversationRepository(abc.ABC):
    @abc.abstractmethod
    async def get_by_identity(self, identity_id: uuid.UUID) -> Conversation | None: ...

    @abc.abstractmethod
    async def save(self, conversation: Conversation) -> Conversation: ...

    @abc.abstractmethod
    async def update(self, conversation: Conversation) -> Conversation: ...


class MessageRepository(abc.ABC):
    @abc.abstractmethod
    async def save(self, message: Message) -> Message: ...

    @abc.abstractmethod
    async def list_by_conversation(
        self,
        conversation_id: uuid.UUID,
        *,
        limit: int = 50,
    ) -> list[Message]: ...

    @abc.abstractmethod
    async def exists_provider_message(self, provider_message_id: str) -> bool:
        """Providers retry deliveries; the same message must not be acted on twice."""


class OutboundNotificationRepository(abc.ABC):
    @abc.abstractmethod
    async def save(self, notification: OutboundNotification) -> OutboundNotification: ...

    @abc.abstractmethod
    async def update(self, notification: OutboundNotification) -> OutboundNotification: ...

    @abc.abstractmethod
    async def claim_due(self, *, now: datetime, limit: int = 20) -> list[OutboundNotification]:
        """Pending notifications whose next attempt is due."""


class ChannelLinkCodeRepository(abc.ABC):
    @abc.abstractmethod
    async def get_by_code(self, code: str) -> ChannelLinkCode | None: ...

    @abc.abstractmethod
    async def save(self, link_code: ChannelLinkCode) -> ChannelLinkCode: ...

    @abc.abstractmethod
    async def update(self, link_code: ChannelLinkCode) -> ChannelLinkCode: ...
