"""A Telegram chat that moves to another company starts a fresh conversation there.

The chat id is one row in channel_identities, so re-linking moves that row. The
conversation, though, belongs to the company it happened in: carrying its last
turns over would hand one company's bookings and prices to the other's
assistant as "history".
"""

import uuid
from contextlib import asynccontextmanager

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.application.messaging.host_bot import HostBotService
from app.application.messaging.link_channel import LinkChannelService
from app.config import settings
from app.domain.auth.entities import Company
from app.domain.auth.repositories import CompanyRepository
from app.domain.messaging.entities import ChannelIdentity
from app.domain.messaging.value_objects import Channel, MessageDirection, MessageStatus
from tests.test_messaging import (
    COMPANY_ID,
    OTHER_COMPANY_ID,
    OWNER_ID,
    FakeIdentityRepository,
    FakeLinkCodeRepository,
)


class FakeCompanyRepository(CompanyRepository):
    def __init__(self, companies):
        self._by_id = {c.id: c for c in companies}

    async def get_by_id(self, company_id):
        return self._by_id.get(company_id)

    async def save(self, company):
        self._by_id[company.id] = company
        return company


COMPANIES = FakeCompanyRepository(
    [Company(id=COMPANY_ID, name="Munar"), Company(id=OTHER_COMPANY_ID, name="Auezov Apartments")]
)


async def _start(identities, code_company=COMPANY_ID):
    codes = FakeLinkCodeRepository()
    link = LinkChannelService(codes, identities)
    code = await link.issue_code(code_company, OWNER_ID)
    bot = HostBotService(link, company_repo=COMPANIES)
    return await bot.handle(None, "555", f"/start {code.code}", "offPenny")


@pytest.mark.asyncio
async def test_start_names_the_company_the_chat_now_works_for():
    reply = await _start(FakeIdentityRepository())

    assert "«Munar»" in reply.text
    assert "отключён" not in reply.text


@pytest.mark.asyncio
async def test_moving_a_chat_says_which_company_lost_it():
    known = ChannelIdentity(company_id=OTHER_COMPANY_ID, channel=Channel.TELEGRAM, external_id="555")

    reply = await _start(FakeIdentityRepository([known]))

    # The owner of the other company stops getting this chat's answers; say so.
    assert "«Munar»" in reply.text
    assert "«Auezov Apartments»" in reply.text


@pytest.mark.asyncio
async def test_relinking_to_the_same_company_does_not_claim_a_move():
    known = ChannelIdentity(company_id=COMPANY_ID, channel=Channel.TELEGRAM, external_id="555")

    reply = await _start(FakeIdentityRepository([known]))

    assert "«Munar»" in reply.text
    assert "отключён" not in reply.text


# ---------- the conversation itself, on PostgreSQL ----------


@asynccontextmanager
async def _fresh_session():
    engine = create_async_engine(settings.DATABASE_URL, poolclass=NullPool)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with maker() as session:
            yield session
    finally:
        await engine.dispose()


@pytest.mark.integration
async def test_a_moved_chat_gets_a_fresh_conversation_and_the_old_one_stays():
    from app.infrastructure.models.auth import CompanyModel
    from app.infrastructure.models.messaging import ChannelIdentityModel
    from app.presentation.api.v1.webhooks import _conversation_for, _recent_turns, _record

    first, second = uuid.uuid4(), uuid.uuid4()
    async with _fresh_session() as session:
        try:
            session.add_all([CompanyModel(id=first, name="Auezov Apartments"), CompanyModel(id=second, name="Munar")])
            identity = ChannelIdentityModel(
                id=uuid.uuid4(), company_id=first, channel="telegram", external_id=f"relink-{first}"
            )
            session.add(identity)
            await session.flush()

            before = await _conversation_for(session, identity.id, first, Channel.TELEGRAM)
            await _record(session, before.id, MessageDirection.INBOUND, "сколько стоит 62auc?", None,
                          MessageStatus.RECEIVED)
            await _record(session, before.id, MessageDirection.OUTBOUND, "62auc — 25 000 ₸", None,
                          MessageStatus.SENT)

            # The chat is re-linked to the second company.
            identity.company_id = second
            await session.flush()
            after = await _conversation_for(session, identity.id, second, Channel.TELEGRAM)

            assert after.id != before.id
            assert after.company_id == second
            assert await _recent_turns(session, after.id) == []
            # Nothing of the first company's is deleted: moved back, its thread resumes.
            again = await _conversation_for(session, identity.id, first, Channel.TELEGRAM)
            assert again.id == before.id
            assert [t.content for t in await _recent_turns(session, before.id)] == [
                "сколько стоит 62auc?",
                "62auc — 25 000 ₸",
            ]
        finally:
            await session.rollback()


@pytest.mark.integration
async def test_two_first_messages_at_once_land_in_one_conversation():
    import asyncio

    from sqlalchemy import delete

    from app.infrastructure.models.auth import CompanyModel
    from app.infrastructure.models.messaging import ChannelIdentityModel, ConversationModel
    from app.presentation.api.v1.webhooks import _conversation_for

    company, identity_id = uuid.uuid4(), uuid.uuid4()
    async with _fresh_session() as setup:
        setup.add(CompanyModel(id=company, name="Munar"))
        await setup.flush()
        setup.add(ChannelIdentityModel(id=identity_id, company_id=company, channel="telegram",
                                       external_id=f"race-{identity_id}"))
        await setup.commit()

    async def first_message():
        async with _fresh_session() as session:
            conversation = await _conversation_for(session, identity_id, company, Channel.TELEGRAM)
            await session.commit()
            return conversation.id

    try:
        # One run can miss a race; several make it show.
        for _ in range(10):
            async with _fresh_session() as session:
                await session.execute(delete(ConversationModel).where(ConversationModel.identity_id == identity_id))
                await session.commit()
            first, second = await asyncio.gather(first_message(), first_message())
            assert first == second
    finally:
        async with _fresh_session() as cleanup:
            await cleanup.execute(delete(ChannelIdentityModel).where(ChannelIdentityModel.id == identity_id))
            await cleanup.execute(delete(CompanyModel).where(CompanyModel.id == company))
            await cleanup.commit()
