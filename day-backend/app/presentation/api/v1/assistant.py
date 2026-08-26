"""Asking in words instead of tapping.

Two endpoints. `/ask` answers questions and, when the operator asks for a
change, hands back a proposal. `/confirm` carries that proposal out — under the
caller's own token, through the same use cases the screens call, so the
assistant can never do something its operator could not.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.assistant.ask import AskAssistantService
from app.domain.assistant.gateway import ChatMessage
from app.domain.assistant.value_objects import AssistantUnavailable, ToolEffect
from app.domain.auth.permissions import Permission
from app.infrastructure.assistant.factory import build_assistant_tools
from app.infrastructure.assistant.openrouter import OpenRouterAssistantGateway
from app.infrastructure.database import get_session
from app.presentation.api.deps import get_company_id, get_user_id, require
from app.presentation.schemas.assistant import (
    AssistantAskRequest,
    AssistantAskResponse,
    AssistantConfirmRequest,
    AssistantConfirmResponse,
    PendingActionResponse,
)

assistant_router = APIRouter(prefix="/assistant", tags=["assistant"])


@assistant_router.post(
    "/ask",
    response_model=AssistantAskResponse,
    dependencies=[Depends(require(Permission.BOOKINGS_READ))],
)
async def ask(
    body: AssistantAskRequest,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
    user_id: uuid.UUID | None = Depends(get_user_id),
):
    tools = build_assistant_tools(session, company_id, user_id)
    service = AskAssistantService(OpenRouterAssistantGateway(), tools)

    try:
        reply = await service.execute(
            body.message,
            history=[ChatMessage(role=turn.role, content=turn.content) for turn in body.history],
        )
    except AssistantUnavailable as error:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(error))
    except ValueError as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error))

    return AssistantAskResponse(
        text=reply.text,
        pending=PendingActionResponse(**vars(reply.pending)) if reply.pending else None,
        used_tools=reply.used_tools,
    )


@assistant_router.post(
    "/confirm",
    response_model=AssistantConfirmResponse,
    dependencies=[Depends(require(Permission.BOOKINGS_WRITE))],
)
async def confirm(
    body: AssistantConfirmRequest,
    session: AsyncSession = Depends(get_session),
    company_id: uuid.UUID = Depends(get_company_id),
    user_id: uuid.UUID | None = Depends(get_user_id),
):
    tools = build_assistant_tools(session, company_id, user_id)
    tool = tools.get(body.tool)

    # Only the tools that were proposed as changes may be confirmed. Naming a
    # read tool here would be harmless but is still not what this endpoint is.
    if tool is None or tool.effect is not ToolEffect.WRITE:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown action")

    try:
        result = await tool.run(**body.arguments)
        await session.commit()
    except TypeError as error:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Неверные аргументы: {error}")
    except ValueError as error:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error))

    return AssistantConfirmResponse(tool=body.tool, result=result)
