"""Unit tests for cleaning application services."""

import uuid
from datetime import date, time

import pytest

from app.application.cleaning.assign_cleaner import AssignCleanerService
from app.application.cleaning.change_task_status import ChangeCleaningTaskStatusService
from app.application.cleaning.create_task import CreateCleaningTaskInput, CreateCleaningTaskService
from app.application.cleaning.manage_checklists import (
    ChecklistItemInput,
    CreateChecklistTemplateInput,
    ManageChecklistsService,
)
from app.application.cleaning.rate_cleaner import RateCleanerInput, RateCleanerService
from app.application.cleaning.submit_report import (
    ReportChecklistInput,
    ReportPhotoInput,
    SubmitReportInput,
    SubmitReportService,
)
from app.domain.cleaning.entities import (
    CleanerRating,
    CleaningChecklistItem,
    CleaningChecklistTemplate,
    CleaningReport,
    CleaningReportChecklist,
    CleaningReportPhoto,
    CleaningTask,
)
from app.domain.cleaning.repositories import (
    CleanerRatingRepository,
    CleaningChecklistItemRepository,
    CleaningChecklistTemplateRepository,
    CleaningReportChecklistRepository,
    CleaningReportPhotoRepository,
    CleaningReportRepository,
    CleaningTaskRepository,
)
from app.domain.cleaning.value_objects import CleaningStatus, CleaningType, ReportStatus, RoomType
from app.domain.property.entities import Property
from app.domain.property.repositories import PropertyRepository
from app.domain.property.value_objects import PropertyStatus, PropertyType

# ---------- Constants ----------

COMPANY_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")
OTHER_COMPANY_ID = uuid.UUID("00000000-0000-0000-0000-000000000099")
USER_ID = uuid.UUID("00000000-0000-0000-0000-000000000002")
CLEANER_ID = uuid.UUID("00000000-0000-0000-0000-000000000003")


# ---------- Fake repositories ----------


class FakePropertyRepository(PropertyRepository):
    def __init__(self) -> None:
        self._properties: dict[uuid.UUID, Property] = {}

    async def get_by_id(self, property_id: uuid.UUID) -> Property | None:
        return self._properties.get(property_id)

    async def list_by_company(self, company_id, *, offset=0, limit=50, status=None, search=None):
        return [p for p in self._properties.values() if p.company_id == company_id]

    async def count_by_company(self, company_id):
        return sum(1 for p in self._properties.values() if p.company_id == company_id)

    async def save(self, prop):
        self._properties[prop.id] = prop
        return prop

    async def update(self, prop):
        self._properties[prop.id] = prop
        return prop

    async def exists_internal_name(self, company_id, internal_name, *, exclude_id=None):
        return False

    async def find_next_clone_name(self, company_id, base_name):
        return f"{base_name}-1"


class FakeCleaningTaskRepository(CleaningTaskRepository):
    def __init__(self) -> None:
        self._tasks: dict[uuid.UUID, CleaningTask] = {}

    async def create(self, task: CleaningTask) -> CleaningTask:
        self._tasks[task.id] = task
        return task

    async def get_by_id(self, task_id: uuid.UUID) -> CleaningTask | None:
        return self._tasks.get(task_id)

    async def list_by_company(
        self,
        company_id,
        *,
        offset=0,
        limit=50,
        status=None,
        property_id=None,
        cleaner_id=None,
        date_from=None,
        date_to=None,
    ):
        result = [t for t in self._tasks.values() if t.company_id == company_id]
        if status is not None:
            result = [t for t in result if t.status == status]
        return result[offset : offset + limit]

    async def count_by_company(
        self,
        company_id,
        *,
        status=None,
        property_id=None,
        cleaner_id=None,
        date_from=None,
        date_to=None,
    ):
        result = [t for t in self._tasks.values() if t.company_id == company_id]
        if status is not None:
            result = [t for t in result if t.status == status]
        return len(result)

    async def list_by_property(self, property_id, *, offset=0, limit=50):
        return [t for t in self._tasks.values() if t.property_id == property_id][offset : offset + limit]

    async def update(self, task: CleaningTask) -> CleaningTask:
        self._tasks[task.id] = task
        return task


class FakeCleaningChecklistTemplateRepository(CleaningChecklistTemplateRepository):
    def __init__(self) -> None:
        self._templates: dict[uuid.UUID, CleaningChecklistTemplate] = {}

    async def create(self, template: CleaningChecklistTemplate) -> CleaningChecklistTemplate:
        self._templates[template.id] = template
        return template

    async def get_by_id(self, template_id: uuid.UUID) -> CleaningChecklistTemplate | None:
        return self._templates.get(template_id)

    async def list_by_company(self, company_id: uuid.UUID) -> list[CleaningChecklistTemplate]:
        return [t for t in self._templates.values() if t.company_id == company_id]

    async def update(self, template: CleaningChecklistTemplate) -> CleaningChecklistTemplate:
        self._templates[template.id] = template
        return template

    async def delete(self, template_id: uuid.UUID) -> None:
        self._templates.pop(template_id, None)


class FakeCleaningChecklistItemRepository(CleaningChecklistItemRepository):
    def __init__(self) -> None:
        self._items: dict[uuid.UUID, CleaningChecklistItem] = {}

    async def create(self, item: CleaningChecklistItem) -> CleaningChecklistItem:
        self._items[item.id] = item
        return item

    async def get_by_id(self, item_id: uuid.UUID) -> CleaningChecklistItem | None:
        return self._items.get(item_id)

    async def list_by_template(self, template_id: uuid.UUID) -> list[CleaningChecklistItem]:
        return sorted(
            [i for i in self._items.values() if i.template_id == template_id],
            key=lambda i: i.sort_order,
        )

    async def update(self, item: CleaningChecklistItem) -> CleaningChecklistItem:
        self._items[item.id] = item
        return item

    async def reorder(self, template_id: uuid.UUID, item_ids: list[uuid.UUID]) -> None:
        for idx, iid in enumerate(item_ids):
            if iid in self._items:
                self._items[iid].sort_order = idx

    async def delete(self, item_id: uuid.UUID) -> None:
        self._items.pop(item_id, None)

    async def delete_by_template(self, template_id: uuid.UUID) -> None:
        to_delete = [iid for iid, item in self._items.items() if item.template_id == template_id]
        for iid in to_delete:
            del self._items[iid]


class FakeCleaningReportRepository(CleaningReportRepository):
    def __init__(self) -> None:
        self._reports: dict[uuid.UUID, CleaningReport] = {}

    async def create(self, report: CleaningReport) -> CleaningReport:
        self._reports[report.id] = report
        return report

    async def get_by_id(self, report_id: uuid.UUID) -> CleaningReport | None:
        return self._reports.get(report_id)

    async def get_by_task(self, task_id: uuid.UUID) -> CleaningReport | None:
        for r in self._reports.values():
            if r.task_id == task_id:
                return r
        return None

    async def update(self, report: CleaningReport) -> CleaningReport:
        self._reports[report.id] = report
        return report


class FakeCleaningReportPhotoRepository(CleaningReportPhotoRepository):
    def __init__(self) -> None:
        self._photos: list[CleaningReportPhoto] = []

    async def create(self, photo: CleaningReportPhoto) -> CleaningReportPhoto:
        self._photos.append(photo)
        return photo

    async def list_by_report(self, report_id: uuid.UUID) -> list[CleaningReportPhoto]:
        return [p for p in self._photos if p.report_id == report_id]


class FakeCleaningReportChecklistRepository(CleaningReportChecklistRepository):
    def __init__(self) -> None:
        self._items: list[CleaningReportChecklist] = []

    async def create(self, item: CleaningReportChecklist) -> CleaningReportChecklist:
        self._items.append(item)
        return item

    async def list_by_report(self, report_id: uuid.UUID) -> list[CleaningReportChecklist]:
        return [i for i in self._items if i.report_id == report_id]


class FakeCleanerRatingRepository(CleanerRatingRepository):
    def __init__(self) -> None:
        self._ratings: list[CleanerRating] = []

    async def create(self, rating: CleanerRating) -> CleanerRating:
        self._ratings.append(rating)
        return rating

    async def list_by_cleaner(self, cleaner_id, *, offset=0, limit=50):
        result = [r for r in self._ratings if r.cleaner_id == cleaner_id]
        return result[offset : offset + limit]

    async def avg_score_by_cleaner(self, cleaner_id: uuid.UUID) -> float:
        scores = [r.score for r in self._ratings if r.cleaner_id == cleaner_id]
        if not scores:
            return 0.0
        return sum(scores) / len(scores)

    async def count_by_cleaner(self, cleaner_id: uuid.UUID) -> int:
        return sum(1 for r in self._ratings if r.cleaner_id == cleaner_id)


# ---------- Helpers ----------


def _make_property(company_id: uuid.UUID = COMPANY_ID, **kwargs) -> Property:
    return Property(
        id=uuid.uuid4(),
        company_id=company_id,
        name=kwargs.get("name", "Test Prop"),
        internal_name=kwargs.get("internal_name", "test-prop"),
        status=kwargs.get("status", PropertyStatus.ACTIVE),
        type=PropertyType.APARTMENT,
    )


def _make_task(
    company_id: uuid.UUID = COMPANY_ID,
    property_id: uuid.UUID | None = None,
    status: CleaningStatus = CleaningStatus.PENDING,
    cleaner_id: uuid.UUID | None = None,
    **kwargs,
) -> CleaningTask:
    return CleaningTask(
        id=uuid.uuid4(),
        company_id=company_id,
        property_id=property_id or uuid.uuid4(),
        status=status,
        cleaner_id=cleaner_id,
        **kwargs,
    )


# ---------- TestCreateCleaningTaskService ----------


class TestCreateCleaningTaskService:
    async def _setup(self, prop_company_id=COMPANY_ID):
        prop_repo = FakePropertyRepository()
        task_repo = FakeCleaningTaskRepository()
        prop = _make_property(company_id=prop_company_id)
        await prop_repo.save(prop)
        svc = CreateCleaningTaskService(task_repo, prop_repo)
        return task_repo, prop_repo, svc, prop

    @pytest.mark.asyncio
    async def test_create_post_checkout_task(self):
        _, _, svc, prop = await self._setup()

        result = await svc.execute(
            CreateCleaningTaskInput(
                company_id=COMPANY_ID,
                property_id=prop.id,
                type=CleaningType.POST_CHECKOUT,
            )
        )

        assert result.property_id == prop.id
        assert result.type == CleaningType.POST_CHECKOUT
        assert result.status == CleaningStatus.PENDING

    @pytest.mark.asyncio
    async def test_create_mid_stay_task(self):
        _, _, svc, prop = await self._setup()

        result = await svc.execute(
            CreateCleaningTaskInput(
                company_id=COMPANY_ID,
                property_id=prop.id,
                type=CleaningType.MID_STAY,
            )
        )

        assert result.type == CleaningType.MID_STAY

    @pytest.mark.asyncio
    async def test_create_on_demand_task(self):
        _, _, svc, prop = await self._setup()

        result = await svc.execute(
            CreateCleaningTaskInput(
                company_id=COMPANY_ID,
                property_id=prop.id,
                type=CleaningType.ON_DEMAND,
            )
        )

        assert result.type == CleaningType.ON_DEMAND

    @pytest.mark.asyncio
    async def test_auto_assign_sets_assigned_status(self):
        _, _, svc, prop = await self._setup()

        result = await svc.execute(
            CreateCleaningTaskInput(
                company_id=COMPANY_ID,
                property_id=prop.id,
                cleaner_id=CLEANER_ID,
            )
        )

        assert result.status == CleaningStatus.ASSIGNED
        assert result.cleaner_id == CLEANER_ID

    @pytest.mark.asyncio
    async def test_no_cleaner_pending_status(self):
        _, _, svc, prop = await self._setup()

        result = await svc.execute(
            CreateCleaningTaskInput(
                company_id=COMPANY_ID,
                property_id=prop.id,
            )
        )

        assert result.status == CleaningStatus.PENDING
        assert result.cleaner_id is None

    @pytest.mark.asyncio
    async def test_property_not_found_raises(self):
        _, _, svc, _ = await self._setup()

        with pytest.raises(ValueError, match="Property not found"):
            await svc.execute(
                CreateCleaningTaskInput(
                    company_id=COMPANY_ID,
                    property_id=uuid.uuid4(),
                )
            )

    @pytest.mark.asyncio
    async def test_property_wrong_company_raises(self):
        _, _, svc, prop = await self._setup()

        with pytest.raises(ValueError, match="does not belong"):
            await svc.execute(
                CreateCleaningTaskInput(
                    company_id=OTHER_COMPANY_ID,
                    property_id=prop.id,
                )
            )

    @pytest.mark.asyncio
    async def test_task_with_booking_id(self):
        _, _, svc, prop = await self._setup()
        booking_id = uuid.uuid4()

        result = await svc.execute(
            CreateCleaningTaskInput(
                company_id=COMPANY_ID,
                property_id=prop.id,
                booking_id=booking_id,
            )
        )

        assert result.booking_id == booking_id

    @pytest.mark.asyncio
    async def test_task_with_schedule(self):
        _, _, svc, prop = await self._setup()

        result = await svc.execute(
            CreateCleaningTaskInput(
                company_id=COMPANY_ID,
                property_id=prop.id,
                scheduled_date=date(2025, 6, 15),
                scheduled_time=time(10, 0),
            )
        )

        assert result.scheduled_date == date(2025, 6, 15)
        assert result.scheduled_time == time(10, 0)

    @pytest.mark.asyncio
    async def test_task_with_notes(self):
        _, _, svc, prop = await self._setup()

        result = await svc.execute(
            CreateCleaningTaskInput(
                company_id=COMPANY_ID,
                property_id=prop.id,
                notes="Deep clean required",
            )
        )

        assert result.notes == "Deep clean required"

    @pytest.mark.asyncio
    async def test_task_persistence(self):
        task_repo, _, svc, prop = await self._setup()

        result = await svc.execute(
            CreateCleaningTaskInput(
                company_id=COMPANY_ID,
                property_id=prop.id,
            )
        )

        saved = await task_repo.get_by_id(result.id)
        assert saved is not None
        assert saved.company_id == COMPANY_ID


# ---------- TestChangeCleaningTaskStatusService ----------


class TestChangeCleaningTaskStatusService:
    async def _setup(self, initial_status=CleaningStatus.PENDING):
        task_repo = FakeCleaningTaskRepository()
        task = _make_task(status=initial_status)
        await task_repo.create(task)
        svc = ChangeCleaningTaskStatusService(task_repo)
        return task_repo, svc, task

    @pytest.mark.asyncio
    async def test_pending_to_assigned(self):
        _, svc, task = await self._setup(CleaningStatus.PENDING)
        result = await svc.execute(task.id, COMPANY_ID, CleaningStatus.ASSIGNED)
        assert result.status == CleaningStatus.ASSIGNED

    @pytest.mark.asyncio
    async def test_assigned_to_in_progress(self):
        _, svc, task = await self._setup(CleaningStatus.ASSIGNED)
        result = await svc.execute(task.id, COMPANY_ID, CleaningStatus.IN_PROGRESS)
        assert result.status == CleaningStatus.IN_PROGRESS
        assert result.started_at is not None

    @pytest.mark.asyncio
    async def test_in_progress_to_done(self):
        _, svc, task = await self._setup(CleaningStatus.IN_PROGRESS)
        result = await svc.execute(task.id, COMPANY_ID, CleaningStatus.DONE)
        assert result.status == CleaningStatus.DONE
        assert result.completed_at is not None

    @pytest.mark.asyncio
    async def test_done_to_verified(self):
        _, svc, task = await self._setup(CleaningStatus.DONE)
        result = await svc.execute(task.id, COMPANY_ID, CleaningStatus.VERIFIED)
        assert result.status == CleaningStatus.VERIFIED
        assert result.verified_at is not None

    @pytest.mark.asyncio
    async def test_full_lifecycle(self):
        task_repo = FakeCleaningTaskRepository()
        task = _make_task(status=CleaningStatus.PENDING)
        await task_repo.create(task)
        svc = ChangeCleaningTaskStatusService(task_repo)

        t = await svc.execute(task.id, COMPANY_ID, CleaningStatus.ASSIGNED)
        t = await svc.execute(task.id, COMPANY_ID, CleaningStatus.IN_PROGRESS)
        assert t.started_at is not None
        t = await svc.execute(task.id, COMPANY_ID, CleaningStatus.DONE)
        assert t.completed_at is not None
        t = await svc.execute(task.id, COMPANY_ID, CleaningStatus.VERIFIED)
        assert t.verified_at is not None
        assert t.status == CleaningStatus.VERIFIED

    @pytest.mark.asyncio
    async def test_invalid_pending_to_in_progress(self):
        _, svc, task = await self._setup(CleaningStatus.PENDING)

        with pytest.raises(ValueError, match="Cannot transition"):
            await svc.execute(task.id, COMPANY_ID, CleaningStatus.IN_PROGRESS)

    @pytest.mark.asyncio
    async def test_invalid_pending_to_done(self):
        _, svc, task = await self._setup(CleaningStatus.PENDING)

        with pytest.raises(ValueError, match="Cannot transition"):
            await svc.execute(task.id, COMPANY_ID, CleaningStatus.DONE)

    @pytest.mark.asyncio
    async def test_invalid_assigned_to_done(self):
        _, svc, task = await self._setup(CleaningStatus.ASSIGNED)

        with pytest.raises(ValueError, match="Cannot transition"):
            await svc.execute(task.id, COMPANY_ID, CleaningStatus.DONE)

    @pytest.mark.asyncio
    async def test_invalid_done_to_in_progress(self):
        _, svc, task = await self._setup(CleaningStatus.DONE)

        with pytest.raises(ValueError, match="Cannot transition"):
            await svc.execute(task.id, COMPANY_ID, CleaningStatus.IN_PROGRESS)

    @pytest.mark.asyncio
    async def test_not_found_raises(self):
        task_repo = FakeCleaningTaskRepository()
        svc = ChangeCleaningTaskStatusService(task_repo)

        with pytest.raises(ValueError, match="not found"):
            await svc.execute(uuid.uuid4(), COMPANY_ID, CleaningStatus.ASSIGNED)

    @pytest.mark.asyncio
    async def test_wrong_company_raises(self):
        _, svc, task = await self._setup()

        with pytest.raises(ValueError, match="does not belong"):
            await svc.execute(task.id, OTHER_COMPANY_ID, CleaningStatus.ASSIGNED)


# ---------- TestAssignCleanerService ----------


class TestAssignCleanerService:
    async def _setup(self, initial_status=CleaningStatus.PENDING):
        task_repo = FakeCleaningTaskRepository()
        task = _make_task(status=initial_status)
        await task_repo.create(task)
        svc = AssignCleanerService(task_repo)
        return task_repo, svc, task

    @pytest.mark.asyncio
    async def test_assign_cleaner(self):
        _, svc, task = await self._setup()

        result = await svc.execute(task.id, COMPANY_ID, CLEANER_ID)

        assert result.cleaner_id == CLEANER_ID
        assert result.status == CleaningStatus.ASSIGNED

    @pytest.mark.asyncio
    async def test_only_pending_tasks(self):
        _, svc, task = await self._setup(CleaningStatus.ASSIGNED)

        with pytest.raises(ValueError, match="pending"):
            await svc.execute(task.id, COMPANY_ID, CLEANER_ID)

    @pytest.mark.asyncio
    async def test_in_progress_cannot_assign(self):
        _, svc, task = await self._setup(CleaningStatus.IN_PROGRESS)

        with pytest.raises(ValueError, match="pending"):
            await svc.execute(task.id, COMPANY_ID, CLEANER_ID)

    @pytest.mark.asyncio
    async def test_not_found_raises(self):
        task_repo = FakeCleaningTaskRepository()
        svc = AssignCleanerService(task_repo)

        with pytest.raises(ValueError, match="not found"):
            await svc.execute(uuid.uuid4(), COMPANY_ID, CLEANER_ID)

    @pytest.mark.asyncio
    async def test_wrong_company_raises(self):
        _, svc, task = await self._setup()

        with pytest.raises(ValueError, match="does not belong"):
            await svc.execute(task.id, OTHER_COMPANY_ID, CLEANER_ID)

    @pytest.mark.asyncio
    async def test_assign_persists(self):
        task_repo, svc, task = await self._setup()

        await svc.execute(task.id, COMPANY_ID, CLEANER_ID)

        saved = await task_repo.get_by_id(task.id)
        assert saved.cleaner_id == CLEANER_ID
        assert saved.status == CleaningStatus.ASSIGNED


# ---------- TestSubmitReportService ----------


class TestSubmitReportService:
    async def _setup(self, task_status=CleaningStatus.IN_PROGRESS):
        task_repo = FakeCleaningTaskRepository()
        report_repo = FakeCleaningReportRepository()
        photo_repo = FakeCleaningReportPhotoRepository()
        checklist_repo = FakeCleaningReportChecklistRepository()
        task = _make_task(status=task_status, cleaner_id=CLEANER_ID)
        await task_repo.create(task)
        svc = SubmitReportService(task_repo, report_repo, photo_repo, checklist_repo)
        return task_repo, report_repo, photo_repo, checklist_repo, svc, task

    @pytest.mark.asyncio
    async def test_basic_submit(self):
        _, _, _, _, svc, task = await self._setup()

        result = await svc.execute(
            SubmitReportInput(
                task_id=task.id,
                company_id=COMPANY_ID,
                cleaner_id=CLEANER_ID,
                notes="All done",
            )
        )

        assert result.status == ReportStatus.SUBMITTED
        assert result.task_id == task.id
        assert result.cleaner_id == CLEANER_ID
        assert result.notes == "All done"
        assert result.submitted_at is not None

    @pytest.mark.asyncio
    async def test_submit_with_photos(self):
        _, _, photo_repo, _, svc, task = await self._setup()

        result = await svc.execute(
            SubmitReportInput(
                task_id=task.id,
                company_id=COMPANY_ID,
                cleaner_id=CLEANER_ID,
                photos=[
                    ReportPhotoInput(url="https://img.com/bath.jpg", room_type=RoomType.BATHROOM),
                    ReportPhotoInput(url="https://img.com/kitchen.jpg", room_type=RoomType.KITCHEN),
                ],
            )
        )

        photos = await photo_repo.list_by_report(result.id)
        assert len(photos) == 2
        assert photos[0].room_type == RoomType.BATHROOM
        assert photos[1].room_type == RoomType.KITCHEN

    @pytest.mark.asyncio
    async def test_submit_with_checklist(self):
        _, _, _, checklist_repo, svc, task = await self._setup()
        item_id_1 = uuid.uuid4()
        item_id_2 = uuid.uuid4()

        result = await svc.execute(
            SubmitReportInput(
                task_id=task.id,
                company_id=COMPANY_ID,
                cleaner_id=CLEANER_ID,
                checklist=[
                    ReportChecklistInput(checklist_item_id=item_id_1, is_done=True),
                    ReportChecklistInput(checklist_item_id=item_id_2, is_done=False, note="Needs recheck"),
                ],
            )
        )

        items = await checklist_repo.list_by_report(result.id)
        assert len(items) == 2
        assert items[0].is_done is True
        assert items[1].is_done is False
        assert items[1].note == "Needs recheck"

    @pytest.mark.asyncio
    async def test_auto_transition_in_progress_to_done(self):
        task_repo, _, _, _, svc, task = await self._setup(CleaningStatus.IN_PROGRESS)

        await svc.execute(
            SubmitReportInput(
                task_id=task.id,
                company_id=COMPANY_ID,
                cleaner_id=CLEANER_ID,
            )
        )

        updated_task = await task_repo.get_by_id(task.id)
        assert updated_task.status == CleaningStatus.DONE
        assert updated_task.completed_at is not None

    @pytest.mark.asyncio
    async def test_done_task_stays_done(self):
        task_repo, _, _, _, svc, task = await self._setup(CleaningStatus.DONE)

        await svc.execute(
            SubmitReportInput(
                task_id=task.id,
                company_id=COMPANY_ID,
                cleaner_id=CLEANER_ID,
            )
        )

        updated_task = await task_repo.get_by_id(task.id)
        assert updated_task.status == CleaningStatus.DONE

    @pytest.mark.asyncio
    async def test_pending_task_raises(self):
        _, _, _, _, svc, task = await self._setup(CleaningStatus.PENDING)

        with pytest.raises(ValueError, match="in progress or done"):
            await svc.execute(
                SubmitReportInput(
                    task_id=task.id,
                    company_id=COMPANY_ID,
                    cleaner_id=CLEANER_ID,
                )
            )

    @pytest.mark.asyncio
    async def test_assigned_task_raises(self):
        _, _, _, _, svc, task = await self._setup(CleaningStatus.ASSIGNED)

        with pytest.raises(ValueError, match="in progress or done"):
            await svc.execute(
                SubmitReportInput(
                    task_id=task.id,
                    company_id=COMPANY_ID,
                    cleaner_id=CLEANER_ID,
                )
            )

    @pytest.mark.asyncio
    async def test_not_found_raises(self):
        task_repo = FakeCleaningTaskRepository()
        svc = SubmitReportService(
            task_repo,
            FakeCleaningReportRepository(),
            FakeCleaningReportPhotoRepository(),
            FakeCleaningReportChecklistRepository(),
        )

        with pytest.raises(ValueError, match="not found"):
            await svc.execute(
                SubmitReportInput(
                    task_id=uuid.uuid4(),
                    company_id=COMPANY_ID,
                    cleaner_id=CLEANER_ID,
                )
            )

    @pytest.mark.asyncio
    async def test_wrong_company_raises(self):
        _, _, _, _, svc, task = await self._setup()

        with pytest.raises(ValueError, match="does not belong"):
            await svc.execute(
                SubmitReportInput(
                    task_id=task.id,
                    company_id=OTHER_COMPANY_ID,
                    cleaner_id=CLEANER_ID,
                )
            )

    @pytest.mark.asyncio
    async def test_photo_with_metadata(self):
        _, _, photo_repo, _, svc, task = await self._setup()
        metadata = {"camera": "iPhone", "timestamp": "2025-06-01T10:00:00"}

        result = await svc.execute(
            SubmitReportInput(
                task_id=task.id,
                company_id=COMPANY_ID,
                cleaner_id=CLEANER_ID,
                photos=[
                    ReportPhotoInput(url="https://img.com/1.jpg", metadata=metadata),
                ],
            )
        )

        photos = await photo_repo.list_by_report(result.id)
        assert photos[0].metadata == metadata


# ---------- TestManageChecklistsService ----------


class TestManageChecklistsService:
    async def _setup(self):
        template_repo = FakeCleaningChecklistTemplateRepository()
        item_repo = FakeCleaningChecklistItemRepository()
        svc = ManageChecklistsService(template_repo, item_repo)
        return template_repo, item_repo, svc

    @pytest.mark.asyncio
    async def test_create_template(self):
        _, _, svc = await self._setup()

        result = await svc.create_template(
            CreateChecklistTemplateInput(
                company_id=COMPANY_ID,
                name="Standard Cleaning",
            )
        )

        assert result.name == "Standard Cleaning"
        assert result.company_id == COMPANY_ID

    @pytest.mark.asyncio
    async def test_create_template_with_items(self):
        _, item_repo, svc = await self._setup()

        result = await svc.create_template(
            CreateChecklistTemplateInput(
                company_id=COMPANY_ID,
                name="Deep Clean",
                items=[
                    ChecklistItemInput(title="Vacuum floors", sort_order=0),
                    ChecklistItemInput(title="Mop kitchen", sort_order=1),
                ],
            )
        )

        items = await item_repo.list_by_template(result.id)
        assert len(items) == 2
        assert items[0].title == "Vacuum floors"
        assert items[1].title == "Mop kitchen"

    @pytest.mark.asyncio
    async def test_list_templates(self):
        _, _, svc = await self._setup()
        await svc.create_template(CreateChecklistTemplateInput(company_id=COMPANY_ID, name="T1"))
        await svc.create_template(CreateChecklistTemplateInput(company_id=COMPANY_ID, name="T2"))

        result = await svc.list_templates(COMPANY_ID)
        assert len(result) == 2

    @pytest.mark.asyncio
    async def test_list_templates_filters_by_company(self):
        _, _, svc = await self._setup()
        await svc.create_template(CreateChecklistTemplateInput(company_id=COMPANY_ID, name="Mine"))
        await svc.create_template(CreateChecklistTemplateInput(company_id=OTHER_COMPANY_ID, name="Theirs"))

        result = await svc.list_templates(COMPANY_ID)
        assert len(result) == 1
        assert result[0].name == "Mine"

    @pytest.mark.asyncio
    async def test_get_template_with_items(self):
        _, item_repo, svc = await self._setup()
        template = await svc.create_template(
            CreateChecklistTemplateInput(
                company_id=COMPANY_ID,
                name="Test",
                items=[ChecklistItemInput(title="Item 1", sort_order=0)],
            )
        )

        tpl, items = await svc.get_template_with_items(template.id, COMPANY_ID)

        assert tpl.name == "Test"
        assert len(items) == 1
        assert items[0].title == "Item 1"

    @pytest.mark.asyncio
    async def test_get_template_not_found_raises(self):
        _, _, svc = await self._setup()

        with pytest.raises(ValueError, match="not found"):
            await svc.get_template_with_items(uuid.uuid4(), COMPANY_ID)

    @pytest.mark.asyncio
    async def test_get_template_wrong_company_raises(self):
        _, _, svc = await self._setup()
        template = await svc.create_template(CreateChecklistTemplateInput(company_id=OTHER_COMPANY_ID, name="Theirs"))

        with pytest.raises(ValueError, match="does not belong"):
            await svc.get_template_with_items(template.id, COMPANY_ID)

    @pytest.mark.asyncio
    async def test_delete_template(self):
        template_repo, item_repo, svc = await self._setup()
        template = await svc.create_template(
            CreateChecklistTemplateInput(
                company_id=COMPANY_ID,
                name="Delete Me",
                items=[ChecklistItemInput(title="Item", sort_order=0)],
            )
        )

        await svc.delete_template(template.id, COMPANY_ID)

        assert await template_repo.get_by_id(template.id) is None
        items = await item_repo.list_by_template(template.id)
        assert len(items) == 0

    @pytest.mark.asyncio
    async def test_delete_template_not_found_raises(self):
        _, _, svc = await self._setup()

        with pytest.raises(ValueError, match="not found"):
            await svc.delete_template(uuid.uuid4(), COMPANY_ID)

    @pytest.mark.asyncio
    async def test_delete_template_wrong_company_raises(self):
        _, _, svc = await self._setup()
        template = await svc.create_template(CreateChecklistTemplateInput(company_id=OTHER_COMPANY_ID, name="Theirs"))

        with pytest.raises(ValueError, match="does not belong"):
            await svc.delete_template(template.id, COMPANY_ID)

    @pytest.mark.asyncio
    async def test_update_template_name(self):
        _, _, svc = await self._setup()
        template = await svc.create_template(CreateChecklistTemplateInput(company_id=COMPANY_ID, name="Old Name"))

        result = await svc.update_template(template.id, COMPANY_ID, "New Name")

        assert result.name == "New Name"

    @pytest.mark.asyncio
    async def test_add_item(self):
        _, item_repo, svc = await self._setup()
        template = await svc.create_template(CreateChecklistTemplateInput(company_id=COMPANY_ID, name="T"))

        result = await svc.add_item(template.id, COMPANY_ID, "New Item")

        assert result.title == "New Item"
        assert result.template_id == template.id

    @pytest.mark.asyncio
    async def test_add_item_auto_sort_order(self):
        _, item_repo, svc = await self._setup()
        template = await svc.create_template(
            CreateChecklistTemplateInput(
                company_id=COMPANY_ID,
                name="T",
                items=[ChecklistItemInput(title="First", sort_order=0)],
            )
        )

        result = await svc.add_item(template.id, COMPANY_ID, "Second")

        assert result.sort_order == 1

    @pytest.mark.asyncio
    async def test_add_item_negative_sort_order_raises(self):
        _, _, svc = await self._setup()
        template = await svc.create_template(CreateChecklistTemplateInput(company_id=COMPANY_ID, name="T"))

        with pytest.raises(ValueError, match="non-negative"):
            await svc.add_item(template.id, COMPANY_ID, "Bad", sort_order=-1)

    @pytest.mark.asyncio
    async def test_reorder_items(self):
        _, item_repo, svc = await self._setup()
        template = await svc.create_template(
            CreateChecklistTemplateInput(
                company_id=COMPANY_ID,
                name="T",
                items=[
                    ChecklistItemInput(title="A", sort_order=0),
                    ChecklistItemInput(title="B", sort_order=1),
                    ChecklistItemInput(title="C", sort_order=2),
                ],
            )
        )
        items = await item_repo.list_by_template(template.id)
        ids = [i.id for i in items]

        reordered = await svc.reorder_items(template.id, COMPANY_ID, list(reversed(ids)))

        assert reordered[0].title == "C"
        assert reordered[1].title == "B"
        assert reordered[2].title == "A"

    @pytest.mark.asyncio
    async def test_reorder_empty_ids_raises(self):
        _, _, svc = await self._setup()
        template = await svc.create_template(CreateChecklistTemplateInput(company_id=COMPANY_ID, name="T"))

        with pytest.raises(ValueError, match="cannot be empty"):
            await svc.reorder_items(template.id, COMPANY_ID, [])

    @pytest.mark.asyncio
    async def test_reorder_mismatched_count_raises(self):
        _, item_repo, svc = await self._setup()
        template = await svc.create_template(
            CreateChecklistTemplateInput(
                company_id=COMPANY_ID,
                name="T",
                items=[
                    ChecklistItemInput(title="A", sort_order=0),
                    ChecklistItemInput(title="B", sort_order=1),
                ],
            )
        )
        items = await item_repo.list_by_template(template.id)

        with pytest.raises(ValueError, match="all template items"):
            await svc.reorder_items(template.id, COMPANY_ID, [items[0].id])

    @pytest.mark.asyncio
    async def test_reorder_duplicate_ids_raises(self):
        _, item_repo, svc = await self._setup()
        template = await svc.create_template(
            CreateChecklistTemplateInput(
                company_id=COMPANY_ID,
                name="T",
                items=[
                    ChecklistItemInput(title="A", sort_order=0),
                    ChecklistItemInput(title="B", sort_order=1),
                ],
            )
        )
        items = await item_repo.list_by_template(template.id)

        with pytest.raises(ValueError, match="duplicate"):
            await svc.reorder_items(template.id, COMPANY_ID, [items[0].id, items[0].id])

    @pytest.mark.asyncio
    async def test_reorder_unknown_ids_raises(self):
        _, item_repo, svc = await self._setup()
        template = await svc.create_template(
            CreateChecklistTemplateInput(
                company_id=COMPANY_ID,
                name="T",
                items=[ChecklistItemInput(title="A", sort_order=0)],
            )
        )

        with pytest.raises(ValueError):
            await svc.reorder_items(template.id, COMPANY_ID, [uuid.uuid4()])

    @pytest.mark.asyncio
    async def test_update_item(self):
        _, item_repo, svc = await self._setup()
        template = await svc.create_template(
            CreateChecklistTemplateInput(
                company_id=COMPANY_ID,
                name="T",
                items=[ChecklistItemInput(title="Old Title", sort_order=0)],
            )
        )
        items = await item_repo.list_by_template(template.id)

        result = await svc.update_item(template.id, items[0].id, COMPANY_ID, "New Title")

        assert result.title == "New Title"

    @pytest.mark.asyncio
    async def test_update_item_not_found_raises(self):
        _, _, svc = await self._setup()
        template = await svc.create_template(CreateChecklistTemplateInput(company_id=COMPANY_ID, name="T"))

        with pytest.raises(ValueError, match="not found"):
            await svc.update_item(template.id, uuid.uuid4(), COMPANY_ID, "X")

    @pytest.mark.asyncio
    async def test_delete_item(self):
        _, item_repo, svc = await self._setup()
        template = await svc.create_template(
            CreateChecklistTemplateInput(
                company_id=COMPANY_ID,
                name="T",
                items=[ChecklistItemInput(title="Delete Me", sort_order=0)],
            )
        )
        items = await item_repo.list_by_template(template.id)

        await svc.delete_item(items[0].id)

        remaining = await item_repo.list_by_template(template.id)
        assert len(remaining) == 0


# ---------- TestRateCleanerService ----------


class TestRateCleanerService:
    async def _setup(self):
        rating_repo = FakeCleanerRatingRepository()
        task_repo = FakeCleaningTaskRepository()
        svc = RateCleanerService(rating_repo, task_repo)
        return rating_repo, task_repo, svc

    @pytest.mark.asyncio
    async def test_rate_cleaner(self):
        _, _, svc = await self._setup()

        result = await svc.execute(
            RateCleanerInput(
                company_id=COMPANY_ID,
                cleaner_id=CLEANER_ID,
                score=5,
                review="Great job!",
            )
        )

        assert result.score == 5
        assert result.cleaner_id == CLEANER_ID
        assert result.review == "Great job!"

    @pytest.mark.asyncio
    async def test_rate_with_task(self):
        _, task_repo, svc = await self._setup()
        task = _make_task(cleaner_id=CLEANER_ID)
        await task_repo.create(task)

        result = await svc.execute(
            RateCleanerInput(
                company_id=COMPANY_ID,
                cleaner_id=CLEANER_ID,
                score=4,
                task_id=task.id,
            )
        )

        assert result.task_id == task.id

    @pytest.mark.asyncio
    async def test_score_too_low_raises(self):
        _, _, svc = await self._setup()

        with pytest.raises(ValueError, match="between 1 and 5"):
            await svc.execute(
                RateCleanerInput(
                    company_id=COMPANY_ID,
                    cleaner_id=CLEANER_ID,
                    score=0,
                )
            )

    @pytest.mark.asyncio
    async def test_score_too_high_raises(self):
        _, _, svc = await self._setup()

        with pytest.raises(ValueError, match="between 1 and 5"):
            await svc.execute(
                RateCleanerInput(
                    company_id=COMPANY_ID,
                    cleaner_id=CLEANER_ID,
                    score=6,
                )
            )

    @pytest.mark.asyncio
    async def test_score_boundary_1(self):
        _, _, svc = await self._setup()

        result = await svc.execute(
            RateCleanerInput(
                company_id=COMPANY_ID,
                cleaner_id=CLEANER_ID,
                score=1,
            )
        )

        assert result.score == 1

    @pytest.mark.asyncio
    async def test_score_boundary_5(self):
        _, _, svc = await self._setup()

        result = await svc.execute(
            RateCleanerInput(
                company_id=COMPANY_ID,
                cleaner_id=CLEANER_ID,
                score=5,
            )
        )

        assert result.score == 5

    @pytest.mark.asyncio
    async def test_task_not_found_raises(self):
        _, _, svc = await self._setup()

        with pytest.raises(ValueError, match="not found"):
            await svc.execute(
                RateCleanerInput(
                    company_id=COMPANY_ID,
                    cleaner_id=CLEANER_ID,
                    score=5,
                    task_id=uuid.uuid4(),
                )
            )

    @pytest.mark.asyncio
    async def test_task_wrong_company_raises(self):
        _, task_repo, svc = await self._setup()
        task = _make_task(company_id=OTHER_COMPANY_ID)
        await task_repo.create(task)

        with pytest.raises(ValueError, match="does not belong"):
            await svc.execute(
                RateCleanerInput(
                    company_id=COMPANY_ID,
                    cleaner_id=CLEANER_ID,
                    score=5,
                    task_id=task.id,
                )
            )

    @pytest.mark.asyncio
    async def test_kpi_calculation(self):
        rating_repo, task_repo, svc = await self._setup()

        for score in [5, 4, 3, 5, 4]:
            await svc.execute(
                RateCleanerInput(
                    company_id=COMPANY_ID,
                    cleaner_id=CLEANER_ID,
                    score=score,
                )
            )

        kpi = await svc.get_kpi(CLEANER_ID)

        assert kpi["avg_score"] == 4.2
        assert kpi["total_ratings"] == 5
        assert len(kpi["recent_ratings"]) == 5
        assert kpi["cleaner_id"] == str(CLEANER_ID)

    @pytest.mark.asyncio
    async def test_kpi_empty(self):
        _, _, svc = await self._setup()

        kpi = await svc.get_kpi(CLEANER_ID)

        assert kpi["avg_score"] == 0.0
        assert kpi["total_ratings"] == 0
        assert kpi["recent_ratings"] == []

    @pytest.mark.asyncio
    async def test_rate_without_task(self):
        _, _, svc = await self._setup()

        result = await svc.execute(
            RateCleanerInput(
                company_id=COMPANY_ID,
                cleaner_id=CLEANER_ID,
                score=4,
                rated_by=USER_ID,
            )
        )

        assert result.task_id is None
        assert result.rated_by == USER_ID
