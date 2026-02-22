"""Unit tests for AI migration application services."""

import uuid
from decimal import Decimal

import pytest

from app.application.ai_migration.confirm_import import ConfirmImportInput, ConfirmImportService
from app.application.ai_migration.get_import import GetImportInput, GetImportService
from app.application.ai_migration.list_imports import ListImportsInput, ListImportsService
from app.application.ai_migration.start_import import StartImportInput, StartImportService
from app.application.property.create_property import CreatePropertyService
from app.domain.ai_migration.entities import ImportJob
from app.domain.ai_migration.repositories import ImportJobRepository
from app.domain.ai_migration.value_objects import ImportJobStatus, ImportSource
from app.domain.property.entities import Property, PropertyAuditLog
from app.domain.property.repositories import PropertyAuditLogRepository, PropertyRepository
from app.domain.property.value_objects import PropertyStatus, PropertyType

# ---------- Fake repositories ----------


class FakeImportJobRepository(ImportJobRepository):
    """In-memory import job repository for testing."""

    def __init__(self) -> None:
        self._jobs: dict[uuid.UUID, ImportJob] = {}

    async def save(self, job: ImportJob) -> ImportJob:
        self._jobs[job.id] = job
        return job

    async def update(self, job: ImportJob) -> ImportJob:
        self._jobs[job.id] = job
        return job

    async def get_by_id(self, job_id: uuid.UUID) -> ImportJob | None:
        return self._jobs.get(job_id)

    async def list_by_company(self, company_id: uuid.UUID, *, offset: int = 0, limit: int = 50) -> list[ImportJob]:
        jobs = [j for j in self._jobs.values() if j.company_id == company_id]
        jobs.sort(key=lambda j: j.created_at or "", reverse=True)
        return jobs[offset : offset + limit]

    async def count_by_company(self, company_id: uuid.UUID) -> int:
        return sum(1 for j in self._jobs.values() if j.company_id == company_id)


class FakePropertyRepository(PropertyRepository):
    """In-memory property repository for testing."""

    def __init__(self) -> None:
        self._properties: dict[uuid.UUID, Property] = {}

    async def get_by_id(self, property_id: uuid.UUID) -> Property | None:
        return self._properties.get(property_id)

    async def list_by_company(
        self,
        company_id: uuid.UUID,
        *,
        offset: int = 0,
        limit: int = 50,
        status: PropertyStatus | None = None,
        search: str | None = None,
    ) -> list[Property]:
        return [p for p in self._properties.values() if p.company_id == company_id]

    async def count_by_company(self, company_id: uuid.UUID) -> int:
        return sum(1 for p in self._properties.values() if p.company_id == company_id)

    async def save(self, prop: Property) -> Property:
        self._properties[prop.id] = prop
        return prop

    async def update(self, prop: Property) -> Property:
        self._properties[prop.id] = prop
        return prop

    async def exists_internal_name(
        self, company_id: uuid.UUID, internal_name: str, *, exclude_id: uuid.UUID | None = None
    ) -> bool:
        return any(
            p.company_id == company_id and p.internal_name == internal_name and p.id != exclude_id
            for p in self._properties.values()
        )

    async def find_next_clone_name(self, company_id: uuid.UUID, base_name: str) -> str:
        import re

        root = re.sub(r"-\d+$", "", base_name)
        existing = [p.internal_name for p in self._properties.values() if p.company_id == company_id]
        max_suffix = 0
        for name in existing:
            if name == root:
                max_suffix = max(max_suffix, 0)
            else:
                match = re.match(rf"^{re.escape(root)}-(\d+)$", name)
                if match:
                    max_suffix = max(max_suffix, int(match.group(1)))
        return f"{root}-{max_suffix + 1}"


class FakePropertyAuditLogRepository(PropertyAuditLogRepository):
    """In-memory audit log repository for testing."""

    def __init__(self) -> None:
        self._logs: list[PropertyAuditLog] = []

    async def list_by_property(
        self,
        property_id: uuid.UUID,
        *,
        offset: int = 0,
        limit: int = 50,
    ) -> list[PropertyAuditLog]:
        return [log for log in self._logs if log.property_id == property_id][offset : offset + limit]

    async def save(self, log: PropertyAuditLog) -> PropertyAuditLog:
        self._logs.append(log)
        return log


# ---------- Fake AI service client ----------


class FakeAIServiceClient:
    """In-memory AI service client for testing."""

    def __init__(self, result: dict | None = None, error: Exception | None = None) -> None:
        self._result = result or {
            "source_type": "booking",
            "confidence": 0.85,
            "extracted_data": {
                "name": "Test Property",
                "type": "apartment",
                "rooms": 2,
                "beds": 3,
                "address_full": "123 Test St",
            },
            "mapped_property": {
                "name": "Test Property",
                "internal_name": "test-property",
                "type": "apartment",
                "rooms": 2,
                "beds": 3,
                "address_full": "123 Test St",
            },
            "raw_data": {},
            "warnings": [],
        }
        self._error = error
        self.call_count = 0
        self.last_url: str | None = None
        self.last_prompt: str | None = None

    async def parse_listing(self, url: str, user_prompt: str | None = None) -> dict:
        self.call_count += 1
        self.last_url = url
        self.last_prompt = user_prompt
        if self._error:
            raise self._error
        return self._result


class FakePricingService:
    def __init__(self) -> None:
        self.calls: list[tuple[uuid.UUID, uuid.UUID, Decimal]] = []

    async def upsert_pricing(self, property_id, company_id, inp):
        self.calls.append((property_id, company_id, inp.base_price))
        return None


class FakePhotosService:
    def __init__(self) -> None:
        self.calls: list[tuple[uuid.UUID, uuid.UUID, str, int, bool]] = []

    async def add_photo(self, property_id, company_id, url, *, sort_order=0, is_cover=False):
        self.calls.append((property_id, company_id, url, sort_order, is_cover))
        return None


# ---------- Constants ----------


COMPANY_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")
OTHER_COMPANY_ID = uuid.UUID("00000000-0000-0000-0000-000000000099")
USER_ID = uuid.UUID("00000000-0000-0000-0000-000000000002")


# ---------- StartImportService ----------


class TestStartImportService:
    @pytest.mark.asyncio
    async def test_creates_job_with_pending_status(self):
        repo = FakeImportJobRepository()
        ai_client = FakeAIServiceClient()
        svc = StartImportService(repo, ai_client)

        result = await svc.execute(
            StartImportInput(
                company_id=COMPANY_ID,
                source_url="https://booking.com/hotel/test",
            )
        )

        # After the full flow, job should be completed (starts pending, transitions to processing, then completed)
        assert result.id is not None
        assert result.company_id == COMPANY_ID

    @pytest.mark.asyncio
    async def test_sets_source_url_and_prompt(self):
        repo = FakeImportJobRepository()
        ai_client = FakeAIServiceClient()
        svc = StartImportService(repo, ai_client)

        result = await svc.execute(
            StartImportInput(
                company_id=COMPANY_ID,
                source_url="https://booking.com/hotel/test",
                user_prompt="2 bedroom apartment in Almaty",
            )
        )

        assert result.source_url == "https://booking.com/hotel/test"
        assert result.user_prompt == "2 bedroom apartment in Almaty"

    @pytest.mark.asyncio
    async def test_calls_ai_service_client(self):
        repo = FakeImportJobRepository()
        ai_client = FakeAIServiceClient()
        svc = StartImportService(repo, ai_client)

        await svc.execute(
            StartImportInput(
                company_id=COMPANY_ID,
                source_url="https://booking.com/hotel/test",
                user_prompt="2br apt",
            )
        )

        assert ai_client.call_count == 1
        assert ai_client.last_url == "https://booking.com/hotel/test"
        assert ai_client.last_prompt == "2br apt"

    @pytest.mark.asyncio
    async def test_normalizes_krisha_legacy_show_url_before_save_and_parse(self):
        repo = FakeImportJobRepository()
        ai_client = FakeAIServiceClient()
        svc = StartImportService(repo, ai_client)

        result = await svc.execute(
            StartImportInput(
                company_id=COMPANY_ID,
                source_url="https://krisha.kz/show/690725054",
            )
        )

        assert result.source_url == "https://krisha.kz/a/show/690725054"
        assert ai_client.last_url == "https://krisha.kz/a/show/690725054"
        assert result.source_type == ImportSource.KRISHA

    @pytest.mark.asyncio
    async def test_normalizes_airbnb_hosting_editor_url_before_save_and_parse(self):
        repo = FakeImportJobRepository()
        ai_client = FakeAIServiceClient()
        svc = StartImportService(repo, ai_client)

        source_url = "https://www.airbnb.ru/hosting/listings/editor/1502076254219978997/details/photo-tour"
        result = await svc.execute(StartImportInput(company_id=COMPANY_ID, source_url=source_url))

        assert result.source_url == "https://www.airbnb.ru/rooms/1502076254219978997"
        assert ai_client.last_url == "https://www.airbnb.ru/rooms/1502076254219978997"
        assert result.source_type == ImportSource.AIRBNB

    @pytest.mark.asyncio
    async def test_updates_job_on_success_with_extracted_data(self):
        repo = FakeImportJobRepository()
        ai_client = FakeAIServiceClient(
            result={
                "extracted_data": {"name": "Cozy Flat", "rooms": 3},
                "mapped_property": {"name": "Cozy Flat", "type": "apartment"},
            }
        )
        svc = StartImportService(repo, ai_client)

        result = await svc.execute(
            StartImportInput(
                company_id=COMPANY_ID,
                source_url="https://booking.com/hotel/test",
            )
        )

        assert result.status == ImportJobStatus.COMPLETED
        assert result.extracted_data == {"name": "Cozy Flat", "rooms": 3}
        assert result.mapped_property == {"name": "Cozy Flat", "type": "apartment"}
        assert result.error_message is None

    @pytest.mark.asyncio
    async def test_updates_job_on_failure_with_error(self):
        repo = FakeImportJobRepository()
        ai_client = FakeAIServiceClient(error=RuntimeError("AI service timeout"))
        svc = StartImportService(repo, ai_client)

        result = await svc.execute(
            StartImportInput(
                company_id=COMPANY_ID,
                source_url="https://booking.com/hotel/test",
            )
        )

        assert result.status == ImportJobStatus.FAILED
        assert "AI service timeout" in result.error_message

    @pytest.mark.asyncio
    async def test_detects_booking_source(self):
        repo = FakeImportJobRepository()
        ai_client = FakeAIServiceClient()
        svc = StartImportService(repo, ai_client)

        result = await svc.execute(
            StartImportInput(
                company_id=COMPANY_ID,
                source_url="https://www.booking.com/hotel/kz/test.html",
            )
        )

        assert result.source_type == ImportSource.BOOKING

    @pytest.mark.asyncio
    async def test_detects_airbnb_source(self):
        repo = FakeImportJobRepository()
        ai_client = FakeAIServiceClient()
        svc = StartImportService(repo, ai_client)

        result = await svc.execute(
            StartImportInput(
                company_id=COMPANY_ID,
                source_url="https://www.airbnb.com/rooms/12345",
            )
        )

        assert result.source_type == ImportSource.AIRBNB

    @pytest.mark.asyncio
    async def test_detects_krisha_source(self):
        repo = FakeImportJobRepository()
        ai_client = FakeAIServiceClient()
        svc = StartImportService(repo, ai_client)

        result = await svc.execute(
            StartImportInput(
                company_id=COMPANY_ID,
                source_url="https://krisha.kz/a/show/12345",
            )
        )

        assert result.source_type == ImportSource.KRISHA

    @pytest.mark.asyncio
    async def test_returns_completed_job_on_success(self):
        repo = FakeImportJobRepository()
        ai_client = FakeAIServiceClient()
        svc = StartImportService(repo, ai_client)

        result = await svc.execute(
            StartImportInput(
                company_id=COMPANY_ID,
                source_url="https://booking.com/hotel/test",
            )
        )

        assert result.status == ImportJobStatus.COMPLETED
        # The job should also be persisted in the repo with the same status
        persisted = await repo.get_by_id(result.id)
        assert persisted is not None
        assert persisted.status == ImportJobStatus.COMPLETED

    @pytest.mark.asyncio
    async def test_sets_created_by(self):
        repo = FakeImportJobRepository()
        ai_client = FakeAIServiceClient()
        svc = StartImportService(repo, ai_client)

        result = await svc.execute(
            StartImportInput(
                company_id=COMPANY_ID,
                source_url="https://booking.com/hotel/test",
                created_by=USER_ID,
            )
        )

        assert result.created_by == USER_ID


# ---------- GetImportService ----------


class TestGetImportService:
    @pytest.mark.asyncio
    async def test_returns_job_by_id(self):
        repo = FakeImportJobRepository()
        job = ImportJob(
            id=uuid.uuid4(),
            company_id=COMPANY_ID,
            source_url="https://booking.com/hotel/test",
            status=ImportJobStatus.COMPLETED,
        )
        await repo.save(job)

        svc = GetImportService(repo)
        result = await svc.execute(GetImportInput(job_id=job.id, company_id=COMPANY_ID))

        assert result.id == job.id
        assert result.source_url == "https://booking.com/hotel/test"

    @pytest.mark.asyncio
    async def test_raises_when_not_found(self):
        repo = FakeImportJobRepository()
        svc = GetImportService(repo)

        with pytest.raises(ValueError, match="Import job not found"):
            await svc.execute(GetImportInput(job_id=uuid.uuid4(), company_id=COMPANY_ID))

    @pytest.mark.asyncio
    async def test_raises_when_wrong_company(self):
        repo = FakeImportJobRepository()
        job = ImportJob(
            id=uuid.uuid4(),
            company_id=OTHER_COMPANY_ID,
            source_url="https://booking.com/hotel/test",
        )
        await repo.save(job)

        svc = GetImportService(repo)

        with pytest.raises(ValueError, match="Import job not found"):
            await svc.execute(GetImportInput(job_id=job.id, company_id=COMPANY_ID))


# ---------- ListImportsService ----------


class TestListImportsService:
    @pytest.mark.asyncio
    async def test_returns_jobs_for_company(self):
        repo = FakeImportJobRepository()
        job1 = ImportJob(company_id=COMPANY_ID, source_url="https://booking.com/1")
        job2 = ImportJob(company_id=COMPANY_ID, source_url="https://booking.com/2")
        await repo.save(job1)
        await repo.save(job2)

        svc = ListImportsService(repo)
        result = await svc.execute(ListImportsInput(company_id=COMPANY_ID))

        assert len(result.items) == 2
        assert result.total == 2

    @pytest.mark.asyncio
    async def test_empty_for_new_company(self):
        repo = FakeImportJobRepository()
        svc = ListImportsService(repo)

        result = await svc.execute(ListImportsInput(company_id=COMPANY_ID))

        assert result.items == []
        assert result.total == 0

    @pytest.mark.asyncio
    async def test_pagination(self):
        repo = FakeImportJobRepository()
        # Create 5 jobs
        for i in range(5):
            job = ImportJob(company_id=COMPANY_ID, source_url=f"https://booking.com/{i}")
            await repo.save(job)

        svc = ListImportsService(repo)

        # First page, limit 2
        result1 = await svc.execute(ListImportsInput(company_id=COMPANY_ID, offset=0, limit=2))
        assert len(result1.items) == 2
        assert result1.total == 5

        # Second page, limit 2
        result2 = await svc.execute(ListImportsInput(company_id=COMPANY_ID, offset=2, limit=2))
        assert len(result2.items) == 2
        assert result2.total == 5

        # Third page, limit 2 (only 1 remaining)
        result3 = await svc.execute(ListImportsInput(company_id=COMPANY_ID, offset=4, limit=2))
        assert len(result3.items) == 1
        assert result3.total == 5

    @pytest.mark.asyncio
    async def test_only_own_company(self):
        repo = FakeImportJobRepository()
        job1 = ImportJob(company_id=COMPANY_ID, source_url="https://booking.com/1")
        job2 = ImportJob(company_id=OTHER_COMPANY_ID, source_url="https://booking.com/2")
        await repo.save(job1)
        await repo.save(job2)

        svc = ListImportsService(repo)

        result = await svc.execute(ListImportsInput(company_id=COMPANY_ID))
        assert len(result.items) == 1
        assert result.total == 1
        assert result.items[0].company_id == COMPANY_ID

        result_other = await svc.execute(ListImportsInput(company_id=OTHER_COMPANY_ID))
        assert len(result_other.items) == 1
        assert result_other.total == 1
        assert result_other.items[0].company_id == OTHER_COMPANY_ID


# ---------- ConfirmImportService ----------


class TestConfirmImportService:
    def _create_services(self):
        """Create fresh services with fake repositories for each test."""
        import_repo = FakeImportJobRepository()
        property_repo = FakePropertyRepository()
        audit_repo = FakePropertyAuditLogRepository()
        create_property_svc = CreatePropertyService(property_repo, audit_repo)
        confirm_svc = ConfirmImportService(import_repo, create_property_svc)
        return import_repo, property_repo, audit_repo, confirm_svc

    @pytest.mark.asyncio
    async def test_creates_property_from_import(self):
        import_repo, property_repo, audit_repo, svc = self._create_services()

        job = ImportJob(
            company_id=COMPANY_ID,
            source_url="https://booking.com/hotel/test",
            status=ImportJobStatus.COMPLETED,
            extracted_data={"name": "Beach Villa"},
            mapped_property={"name": "Beach Villa", "type": "apartment"},
        )
        await import_repo.save(job)

        result = await svc.execute(
            ConfirmImportInput(
                job_id=job.id,
                company_id=COMPANY_ID,
                property_data={
                    "name": "Beach Villa",
                    "internal_name": "beach-villa",
                    "type": "apartment",
                    "rooms": 3,
                    "beds": 4,
                    "address_full": "123 Beach Road",
                },
                changed_by=USER_ID,
            )
        )

        assert isinstance(result, Property)
        assert result.name == "Beach Villa"
        assert result.internal_name == "beach-villa"
        assert result.type == PropertyType.APARTMENT
        assert result.rooms == 3
        assert result.beds == 4
        assert result.address_full == "123 Beach Road"
        assert result.company_id == COMPANY_ID

    @pytest.mark.asyncio
    async def test_persists_base_price_and_photos_when_present(self):
        import_repo = FakeImportJobRepository()
        property_repo = FakePropertyRepository()
        audit_repo = FakePropertyAuditLogRepository()
        create_property_svc = CreatePropertyService(property_repo, audit_repo)
        pricing_svc = FakePricingService()
        photos_svc = FakePhotosService()
        svc = ConfirmImportService(import_repo, create_property_svc, pricing_svc, photos_svc)

        job = ImportJob(
            company_id=COMPANY_ID,
            source_url="https://krisha.kz/a/show/690725054",
            status=ImportJobStatus.COMPLETED,
        )
        await import_repo.save(job)

        result = await svc.execute(
            ConfirmImportInput(
                job_id=job.id,
                company_id=COMPANY_ID,
                property_data={
                    "name": "Gauhartas",
                    "internal_name": "gauhartas-13-floor",
                    "type": "apartment",
                    "base_price": 12000,
                    "photos": [
                        "https://krisha-photos.kcdn.online/webp/a/1-full.jpg",
                        "https://krisha-photos.kcdn.online/webp/a/2-full.jpg",
                        "https://krisha-photos.kcdn.online/webp/a/1-full.jpg",
                    ],
                },
            )
        )

        assert result.name == "Gauhartas"
        assert len(pricing_svc.calls) == 1
        assert pricing_svc.calls[0][0] == result.id
        assert pricing_svc.calls[0][1] == COMPANY_ID
        assert pricing_svc.calls[0][2] == Decimal("12000")
        assert len(photos_svc.calls) == 2
        assert photos_svc.calls[0][2] == "https://krisha-photos.kcdn.online/webp/a/1-full.jpg"
        assert photos_svc.calls[0][3] == 0
        assert photos_svc.calls[0][4] is True
        assert photos_svc.calls[1][2] == "https://krisha-photos.kcdn.online/webp/a/2-full.jpg"
        assert photos_svc.calls[1][3] == 1
        assert photos_svc.calls[1][4] is False

    @pytest.mark.asyncio
    async def test_updates_job_status(self):
        """Verify the property is created successfully (confirm service delegates to create_property_svc)."""
        import_repo, property_repo, audit_repo, svc = self._create_services()

        job = ImportJob(
            company_id=COMPANY_ID,
            source_url="https://booking.com/hotel/test",
            status=ImportJobStatus.COMPLETED,
            extracted_data={"name": "Test"},
        )
        await import_repo.save(job)

        result = await svc.execute(
            ConfirmImportInput(
                job_id=job.id,
                company_id=COMPANY_ID,
                property_data={
                    "name": "Test Property",
                    "internal_name": "test-property",
                    "type": "apartment",
                },
            )
        )

        # The property was created in the repository
        saved_prop = await property_repo.get_by_id(result.id)
        assert saved_prop is not None
        assert saved_prop.name == "Test Property"

    @pytest.mark.asyncio
    async def test_raises_when_not_found(self):
        import_repo, property_repo, audit_repo, svc = self._create_services()

        with pytest.raises(ValueError, match="Import job not found"):
            await svc.execute(
                ConfirmImportInput(
                    job_id=uuid.uuid4(),
                    company_id=COMPANY_ID,
                    property_data={"name": "Test", "internal_name": "test", "type": "apartment"},
                )
            )

    @pytest.mark.asyncio
    async def test_raises_when_not_completed(self):
        import_repo, property_repo, audit_repo, svc = self._create_services()

        job = ImportJob(
            company_id=COMPANY_ID,
            source_url="https://booking.com/hotel/test",
            status=ImportJobStatus.PENDING,
        )
        await import_repo.save(job)

        with pytest.raises(ValueError, match="Import job is not completed"):
            await svc.execute(
                ConfirmImportInput(
                    job_id=job.id,
                    company_id=COMPANY_ID,
                    property_data={"name": "Test", "internal_name": "test", "type": "apartment"},
                )
            )

    @pytest.mark.asyncio
    async def test_raises_when_processing_status(self):
        import_repo, property_repo, audit_repo, svc = self._create_services()

        job = ImportJob(
            company_id=COMPANY_ID,
            source_url="https://booking.com/hotel/test",
            status=ImportJobStatus.PROCESSING,
        )
        await import_repo.save(job)

        with pytest.raises(ValueError, match="Import job is not completed"):
            await svc.execute(
                ConfirmImportInput(
                    job_id=job.id,
                    company_id=COMPANY_ID,
                    property_data={"name": "Test", "internal_name": "test", "type": "apartment"},
                )
            )

    @pytest.mark.asyncio
    async def test_raises_when_failed_status(self):
        import_repo, property_repo, audit_repo, svc = self._create_services()

        job = ImportJob(
            company_id=COMPANY_ID,
            source_url="https://booking.com/hotel/test",
            status=ImportJobStatus.FAILED,
        )
        await import_repo.save(job)

        with pytest.raises(ValueError, match="Import job is not completed"):
            await svc.execute(
                ConfirmImportInput(
                    job_id=job.id,
                    company_id=COMPANY_ID,
                    property_data={"name": "Test", "internal_name": "test", "type": "apartment"},
                )
            )

    @pytest.mark.asyncio
    async def test_raises_when_wrong_company(self):
        import_repo, property_repo, audit_repo, svc = self._create_services()

        job = ImportJob(
            company_id=OTHER_COMPANY_ID,
            source_url="https://booking.com/hotel/test",
            status=ImportJobStatus.COMPLETED,
        )
        await import_repo.save(job)

        with pytest.raises(ValueError, match="Import job not found"):
            await svc.execute(
                ConfirmImportInput(
                    job_id=job.id,
                    company_id=COMPANY_ID,
                    property_data={"name": "Test", "internal_name": "test", "type": "apartment"},
                )
            )

    @pytest.mark.asyncio
    async def test_uses_source_url_from_job_when_not_in_property_data(self):
        import_repo, property_repo, audit_repo, svc = self._create_services()

        job = ImportJob(
            company_id=COMPANY_ID,
            source_url="https://booking.com/hotel/test",
            status=ImportJobStatus.COMPLETED,
        )
        await import_repo.save(job)

        result = await svc.execute(
            ConfirmImportInput(
                job_id=job.id,
                company_id=COMPANY_ID,
                property_data={
                    "name": "Test",
                    "internal_name": "test-prop",
                    "type": "apartment",
                },
            )
        )

        assert result.source_url == "https://booking.com/hotel/test"

    @pytest.mark.asyncio
    async def test_creates_audit_log(self):
        import_repo, property_repo, audit_repo, svc = self._create_services()

        job = ImportJob(
            company_id=COMPANY_ID,
            source_url="https://booking.com/hotel/test",
            status=ImportJobStatus.COMPLETED,
        )
        await import_repo.save(job)

        result = await svc.execute(
            ConfirmImportInput(
                job_id=job.id,
                company_id=COMPANY_ID,
                property_data={
                    "name": "Test",
                    "internal_name": "test-prop-audit",
                    "type": "apartment",
                },
                changed_by=USER_ID,
            )
        )

        logs = await audit_repo.list_by_property(result.id)
        assert len(logs) == 1
        assert logs[0].property_id == result.id
        assert logs[0].changed_by == USER_ID
