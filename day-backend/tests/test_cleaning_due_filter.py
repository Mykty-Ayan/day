"""A cleaning due by a day: a past day and no date count, a later day does not, and
another company's never does."""

import uuid
from datetime import date

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

import app.main  # noqa: E402,F401  (every model registered, for the foreign keys)
from app.config import settings
from app.domain.cleaning.entities import CleaningTask
from app.domain.cleaning.value_objects import CleaningStatus

pytestmark = pytest.mark.integration

DAY = date(2030, 12, 10)


async def _flat(company):
    from app.infrastructure.models.auth import CompanyModel
    from app.infrastructure.models.property import PropertyModel
    from tests.test_property_tag_filter import _seed

    flat = uuid.uuid4()
    await _seed(
        CompanyModel(id=company, name=f"Cleaning due {company.hex[:6]}"),
        PropertyModel(id=flat, company_id=company, name="Т13", internal_name="t13", type="apartment",
                      status="active", rental_mode="daily"),
    )
    return flat


async def test_due_by_takes_past_days_and_no_date_within_the_company():
    from app.infrastructure.repositories.cleaning import SqlCleaningTaskRepository

    mine, theirs = uuid.uuid4(), uuid.uuid4()
    my_flat, their_flat = await _flat(mine), await _flat(theirs)
    days = {"past": date(2030, 12, 1), "same": DAY, "none": None, "later": date(2030, 12, 11)}

    engine = create_async_engine(settings.DATABASE_URL, poolclass=NullPool)
    try:
        async with async_sessionmaker(engine, expire_on_commit=False)() as session:
            repo = SqlCleaningTaskRepository(session)
            ids = {}
            for name, day in days.items():
                task = await repo.create(CleaningTask(company_id=mine, property_id=my_flat, scheduled_date=day))
                ids[name] = task.id
            await repo.create(CleaningTask(company_id=theirs, property_id=their_flat, scheduled_date=DAY))
            await repo.create(
                CleaningTask(company_id=mine, property_id=my_flat, scheduled_date=DAY, status=CleaningStatus.DONE)
            )

            found = await repo.list_by_company(mine, due_by=DAY)
            total = await repo.count_by_company(mine, due_by=DAY)
            await session.rollback()
    finally:
        await engine.dispose()

    assert {task.id for task in found} == {ids["past"], ids["same"], ids["none"]}
    assert total == 3
