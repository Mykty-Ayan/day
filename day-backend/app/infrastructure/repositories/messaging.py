from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.messaging.entities import (
    ChannelIdentity,
    ChannelLinkCode,
    Conversation,
    Message,
    OutboundNotification,
)
from app.domain.messaging.repositories import (
    ChannelIdentityRepository,
    ChannelLinkCodeRepository,
    ConversationRepository,
    MessageRepository,
    OutboundNotificationRepository,
)
from app.domain.messaging.value_objects import (
    Channel,
    ConversationState,
    MessageDirection,
    MessageStatus,
    NotificationEvent,
    NotificationStatus,
)
from app.infrastructure.models.messaging import (
    ChannelIdentityModel,
    ChannelLinkCodeModel,
    ConversationModel,
    MessageModel,
    OutboundNotificationModel,
)


def _to_identity(m: ChannelIdentityModel) -> ChannelIdentity:
    return ChannelIdentity(
        id=m.id,
        company_id=m.company_id,
        channel=Channel(m.channel),
        external_id=m.external_id,
        display_name=m.display_name or "",
        user_id=m.user_id,
        guest_id=m.guest_id,
        is_active=m.is_active,
        created_at=m.created_at,
    )


def _to_conversation(m: ConversationModel) -> Conversation:
    return Conversation(
        id=m.id,
        company_id=m.company_id,
        channel=Channel(m.channel),
        identity_id=m.identity_id,
        state=ConversationState(m.state),
        context=dict(m.context or {}),
        last_message_at=m.last_message_at,
        created_at=m.created_at,
    )


def _to_message(m: MessageModel) -> Message:
    return Message(
        id=m.id,
        conversation_id=m.conversation_id,
        direction=MessageDirection(m.direction),
        body=m.body or "",
        provider_message_id=m.provider_message_id,
        status=MessageStatus(m.status),
        payload=dict(m.payload or {}),
        created_at=m.created_at,
    )


def _to_notification(m: OutboundNotificationModel) -> OutboundNotification:
    return OutboundNotification(
        id=m.id,
        company_id=m.company_id,
        channel=Channel(m.channel),
        target=m.target,
        event=NotificationEvent(m.event),
        payload=dict(m.payload or {}),
        status=NotificationStatus(m.status),
        attempts=m.attempts,
        last_error=m.last_error,
        next_attempt_at=m.next_attempt_at,
        created_at=m.created_at,
        sent_at=m.sent_at,
    )


def _to_link_code(m: ChannelLinkCodeModel) -> ChannelLinkCode:
    return ChannelLinkCode(
        id=m.id,
        company_id=m.company_id,
        code=m.code,
        channel=Channel(m.channel),
        created_by=m.created_by,
        expires_at=m.expires_at,
        used_at=m.used_at,
        created_at=m.created_at,
    )


class SqlChannelIdentityRepository(ChannelIdentityRepository):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_by_external_id(self, channel: Channel, external_id: str) -> ChannelIdentity | None:
        stmt = select(ChannelIdentityModel).where(
            ChannelIdentityModel.channel == channel.value,
            ChannelIdentityModel.external_id == external_id,
        )
        result = await self._session.scalar(stmt)
        return _to_identity(result) if result else None

    async def list_by_company(
        self,
        company_id: uuid.UUID,
        *,
        channel: Channel | None = None,
        only_active: bool = True,
    ) -> list[ChannelIdentity]:
        stmt = select(ChannelIdentityModel).where(ChannelIdentityModel.company_id == company_id)
        if channel is not None:
            stmt = stmt.where(ChannelIdentityModel.channel == channel.value)
        if only_active:
            stmt = stmt.where(ChannelIdentityModel.is_active.is_(True))
        rows = (await self._session.scalars(stmt.order_by(ChannelIdentityModel.created_at))).all()
        return [_to_identity(m) for m in rows]

    async def save(self, identity: ChannelIdentity) -> ChannelIdentity:
        model = ChannelIdentityModel(
            id=identity.id,
            company_id=identity.company_id,
            channel=identity.channel.value,
            external_id=identity.external_id,
            display_name=identity.display_name,
            user_id=identity.user_id,
            guest_id=identity.guest_id,
            is_active=identity.is_active,
        )
        self._session.add(model)
        await self._session.flush()
        await self._session.refresh(model)
        return _to_identity(model)

    async def update(self, identity: ChannelIdentity) -> ChannelIdentity:
        model = await self._session.get(ChannelIdentityModel, identity.id)
        if model is None:
            raise ValueError("Channel identity not found")
        model.company_id = identity.company_id
        model.display_name = identity.display_name
        model.user_id = identity.user_id
        model.guest_id = identity.guest_id
        model.is_active = identity.is_active
        await self._session.flush()
        await self._session.refresh(model)
        return _to_identity(model)


class SqlConversationRepository(ConversationRepository):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_by_identity(self, identity_id: uuid.UUID) -> Conversation | None:
        stmt = select(ConversationModel).where(ConversationModel.identity_id == identity_id)
        result = await self._session.scalar(stmt)
        return _to_conversation(result) if result else None

    async def save(self, conversation: Conversation) -> Conversation:
        model = ConversationModel(
            id=conversation.id,
            company_id=conversation.company_id,
            channel=conversation.channel.value,
            identity_id=conversation.identity_id,
            state=conversation.state.value,
            context=conversation.context,
            last_message_at=conversation.last_message_at,
        )
        self._session.add(model)
        await self._session.flush()
        await self._session.refresh(model)
        return _to_conversation(model)

    async def update(self, conversation: Conversation) -> Conversation:
        model = await self._session.get(ConversationModel, conversation.id)
        if model is None:
            raise ValueError("Conversation not found")
        model.state = conversation.state.value
        # Reassign rather than mutate: SQLAlchemy does not track in-place edits
        # of a JSON dict, and the state machine would silently stop persisting.
        model.context = dict(conversation.context)
        model.last_message_at = conversation.last_message_at
        await self._session.flush()
        await self._session.refresh(model)
        return _to_conversation(model)


class SqlMessageRepository(MessageRepository):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def save(self, message: Message) -> Message:
        model = MessageModel(
            id=message.id,
            conversation_id=message.conversation_id,
            direction=message.direction.value,
            body=message.body,
            provider_message_id=message.provider_message_id,
            status=message.status.value,
            payload=message.payload,
        )
        self._session.add(model)
        await self._session.flush()
        await self._session.refresh(model)
        return _to_message(model)

    async def list_by_conversation(self, conversation_id: uuid.UUID, *, limit: int = 50) -> list[Message]:
        stmt = (
            select(MessageModel)
            .where(MessageModel.conversation_id == conversation_id)
            .order_by(MessageModel.created_at.desc())
            .limit(limit)
        )
        rows = (await self._session.scalars(stmt)).all()
        return [_to_message(m) for m in rows]

    async def exists_provider_message(self, provider_message_id: str) -> bool:
        stmt = select(MessageModel.id).where(MessageModel.provider_message_id == provider_message_id)
        return await self._session.scalar(stmt) is not None


class SqlOutboundNotificationRepository(OutboundNotificationRepository):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def save(self, notification: OutboundNotification) -> OutboundNotification:
        model = OutboundNotificationModel(
            id=notification.id,
            company_id=notification.company_id,
            channel=notification.channel.value,
            target=notification.target,
            event=notification.event.value,
            payload=notification.payload,
            status=notification.status.value,
            attempts=notification.attempts,
            next_attempt_at=notification.next_attempt_at,
        )
        self._session.add(model)
        await self._session.flush()
        await self._session.refresh(model)
        return _to_notification(model)

    async def update(self, notification: OutboundNotification) -> OutboundNotification:
        model = await self._session.get(OutboundNotificationModel, notification.id)
        if model is None:
            raise ValueError("Notification not found")
        model.status = notification.status.value
        model.attempts = notification.attempts
        model.last_error = notification.last_error
        model.next_attempt_at = notification.next_attempt_at
        model.sent_at = notification.sent_at
        await self._session.flush()
        await self._session.refresh(model)
        return _to_notification(model)

    async def claim_due(self, *, now: datetime, limit: int = 20) -> list[OutboundNotification]:
        stmt = (
            select(OutboundNotificationModel)
            .where(
                OutboundNotificationModel.status == NotificationStatus.PENDING.value,
                or_(
                    OutboundNotificationModel.next_attempt_at.is_(None),
                    OutboundNotificationModel.next_attempt_at <= now,
                ),
            )
            .order_by(OutboundNotificationModel.created_at)
            .limit(limit)
            # Skip rows another worker already holds, so two API instances
            # draining the queue never send the same notification twice.
            .with_for_update(skip_locked=True)
        )
        rows = (await self._session.scalars(stmt)).all()
        return [_to_notification(m) for m in rows]


class SqlChannelLinkCodeRepository(ChannelLinkCodeRepository):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_by_code(self, code: str) -> ChannelLinkCode | None:
        stmt = select(ChannelLinkCodeModel).where(ChannelLinkCodeModel.code == code)
        result = await self._session.scalar(stmt)
        return _to_link_code(result) if result else None

    async def save(self, link_code: ChannelLinkCode) -> ChannelLinkCode:
        model = ChannelLinkCodeModel(
            id=link_code.id,
            company_id=link_code.company_id,
            code=link_code.code,
            channel=link_code.channel.value,
            created_by=link_code.created_by,
            expires_at=link_code.expires_at,
            used_at=link_code.used_at,
        )
        self._session.add(model)
        await self._session.flush()
        await self._session.refresh(model)
        return _to_link_code(model)

    async def update(self, link_code: ChannelLinkCode) -> ChannelLinkCode:
        model = await self._session.get(ChannelLinkCodeModel, link_code.id)
        if model is None:
            raise ValueError("Link code not found")
        model.used_at = link_code.used_at
        await self._session.flush()
        await self._session.refresh(model)
        return _to_link_code(model)
