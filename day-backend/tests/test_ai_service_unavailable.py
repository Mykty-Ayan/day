"""The ai-service is not deployed everywhere. When it cannot be reached, the import
job says so with a code the web turns into "AI import is unavailable", not with
the raw text of a connection error."""

import pytest

from app.application.ai_migration.start_import import StartImportInput, StartImportService
from app.domain.ai_migration.exceptions import AIServiceUnavailable
from app.domain.ai_migration.value_objects import ImportJobStatus
from app.infrastructure.ai_service_client import AIServiceClient
from tests.test_ai_migration_services import COMPANY_ID, FakeAIServiceClient, FakeImportJobRepository


@pytest.mark.asyncio
async def test_an_unreachable_ai_service_is_reported_as_unavailable():
    # Nothing listens on port 1: the connection is refused at once.
    client = AIServiceClient(base_url="http://127.0.0.1:1")
    with pytest.raises(AIServiceUnavailable):
        await client.parse_listing(url="https://booking.com/hotel/test")
    with pytest.raises(AIServiceUnavailable):
        await client.parse_text(text="2-комнатная, Ауэзова 62")


@pytest.mark.asyncio
async def test_the_import_job_keeps_the_unavailable_code():
    svc = StartImportService(FakeImportJobRepository(), FakeAIServiceClient(error=AIServiceUnavailable()))
    job = await svc.execute(StartImportInput(company_id=COMPANY_ID, source_url="https://booking.com/hotel/test"))
    assert job.status == ImportJobStatus.FAILED
    assert job.error_message == AIServiceUnavailable.CODE == "ai_service_unavailable"
