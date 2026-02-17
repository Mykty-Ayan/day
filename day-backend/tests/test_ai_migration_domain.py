"""Unit tests for AI migration domain layer."""

import uuid
from datetime import datetime

from app.domain.ai_migration.entities import ImportJob
from app.domain.ai_migration.value_objects import ImportJobStatus, ImportSource

# ---------- ImportJobStatus ----------


class TestImportJobStatus:
    def test_pending_is_default(self):
        job = ImportJob()
        assert job.status == ImportJobStatus.PENDING

    def test_all_statuses_exist(self):
        assert ImportJobStatus.PENDING == "pending"
        assert ImportJobStatus.PROCESSING == "processing"
        assert ImportJobStatus.COMPLETED == "completed"
        assert ImportJobStatus.FAILED == "failed"

    def test_status_values_are_strings(self):
        for status in ImportJobStatus:
            assert isinstance(status.value, str)

    def test_status_is_str_enum(self):
        assert isinstance(ImportJobStatus.PENDING, str)
        assert ImportJobStatus.PENDING == "pending"

    def test_all_four_statuses(self):
        members = list(ImportJobStatus)
        assert len(members) == 4


# ---------- ImportSource ----------


class TestImportSource:
    def test_normalize_krisha_legacy_show_url(self):
        assert ImportSource.normalize_url("https://krisha.kz/show/2303047") == "https://krisha.kz/a/show/2303047"

    def test_normalize_krisha_legacy_show_url_without_scheme(self):
        assert ImportSource.normalize_url("krisha.kz/show/2303047") == "https://krisha.kz/a/show/2303047"

    def test_normalize_krisha_preserves_query(self):
        url = "https://www.krisha.kz/show/2303047?srchid=abc"
        assert ImportSource.normalize_url(url) == "https://krisha.kz/a/show/2303047?srchid=abc"

    def test_detect_booking_url(self):
        assert ImportSource.detect_from_url("https://www.booking.com/hotel/kz/test.html") == ImportSource.BOOKING

    def test_detect_airbnb_url(self):
        assert ImportSource.detect_from_url("https://www.airbnb.com/rooms/12345") == ImportSource.AIRBNB

    def test_detect_krisha_url(self):
        assert ImportSource.detect_from_url("https://krisha.kz/a/show/12345") == ImportSource.KRISHA

    def test_detect_krisha_legacy_show_url(self):
        assert ImportSource.detect_from_url("https://krisha.kz/show/12345") == ImportSource.KRISHA

    def test_detect_unknown_url(self):
        assert ImportSource.detect_from_url("https://example.com/listing") == ImportSource.OTHER

    def test_case_insensitive(self):
        assert ImportSource.detect_from_url("https://WWW.BOOKING.COM/hotel/test") == ImportSource.BOOKING

    def test_various_booking_formats(self):
        urls = [
            "https://booking.com/hotel/test",
            "https://www.booking.com/hotel/kz/test.en-us.html",
            "http://booking.com/hotel/test",
        ]
        for url in urls:
            assert ImportSource.detect_from_url(url) == ImportSource.BOOKING

    def test_various_airbnb_formats(self):
        urls = [
            "https://airbnb.com/rooms/123",
            "https://www.airbnb.com/rooms/123",
            "https://airbnb.co.uk/rooms/123",
        ]
        for url in urls:
            assert ImportSource.detect_from_url(url) == ImportSource.AIRBNB

    def test_various_krisha_formats(self):
        urls = [
            "https://krisha.kz/a/show/12345",
            "https://www.krisha.kz/a/show/67890",
            "http://krisha.kz/a/show/11111",
        ]
        for url in urls:
            assert ImportSource.detect_from_url(url) == ImportSource.KRISHA

    def test_source_values(self):
        assert ImportSource.BOOKING == "booking"
        assert ImportSource.AIRBNB == "airbnb"
        assert ImportSource.KRISHA == "krisha"
        assert ImportSource.OTHER == "other"

    def test_empty_url_returns_other(self):
        assert ImportSource.detect_from_url("") == ImportSource.OTHER

    def test_all_four_sources(self):
        members = list(ImportSource)
        assert len(members) == 4


# ---------- ImportJob ----------


class TestImportJob:
    def test_create_with_defaults(self):
        job = ImportJob()
        assert job.id is not None
        assert job.status == ImportJobStatus.PENDING
        assert job.extracted_data is None
        assert job.mapped_property is None
        assert job.error_message is None

    def test_default_source_type_is_other(self):
        job = ImportJob()
        assert job.source_type == ImportSource.OTHER

    def test_default_source_url_is_empty(self):
        job = ImportJob()
        assert job.source_url == ""

    def test_default_user_prompt_is_none(self):
        job = ImportJob()
        assert job.user_prompt is None

    def test_default_created_by_is_none(self):
        job = ImportJob()
        assert job.created_by is None

    def test_default_timestamps_are_none(self):
        job = ImportJob()
        assert job.created_at is None
        assert job.updated_at is None

    def test_create_with_all_fields(self):
        job_id = uuid.uuid4()
        company_id = uuid.uuid4()
        user_id = uuid.uuid4()
        now = datetime.utcnow()

        job = ImportJob(
            id=job_id,
            company_id=company_id,
            source_url="https://booking.com/test",
            user_prompt="2 bedroom apartment",
            status=ImportJobStatus.COMPLETED,
            source_type=ImportSource.BOOKING,
            extracted_data={"name": "Test"},
            mapped_property={"name": "Test", "type": "apartment"},
            error_message=None,
            created_by=user_id,
            created_at=now,
            updated_at=now,
        )
        assert job.id == job_id
        assert job.company_id == company_id
        assert job.source_url == "https://booking.com/test"
        assert job.user_prompt == "2 bedroom apartment"
        assert job.status == ImportJobStatus.COMPLETED
        assert job.source_type == ImportSource.BOOKING
        assert job.extracted_data == {"name": "Test"}
        assert job.mapped_property == {"name": "Test", "type": "apartment"}
        assert job.error_message is None
        assert job.created_by == user_id
        assert job.created_at == now
        assert job.updated_at == now

    def test_id_is_unique_per_instance(self):
        job1 = ImportJob()
        job2 = ImportJob()
        assert job1.id != job2.id

    def test_company_id_is_unique_per_instance(self):
        job1 = ImportJob()
        job2 = ImportJob()
        assert job1.company_id != job2.company_id

    def test_status_can_be_set_to_processing(self):
        job = ImportJob()
        job.status = ImportJobStatus.PROCESSING
        assert job.status == ImportJobStatus.PROCESSING

    def test_status_can_be_set_to_failed(self):
        job = ImportJob()
        job.status = ImportJobStatus.FAILED
        assert job.status == ImportJobStatus.FAILED

    def test_error_message_can_be_set(self):
        job = ImportJob()
        job.error_message = "Something went wrong"
        assert job.error_message == "Something went wrong"

    def test_extracted_data_can_be_set(self):
        job = ImportJob()
        job.extracted_data = {"name": "Test Property", "rooms": 3}
        assert job.extracted_data == {"name": "Test Property", "rooms": 3}

    def test_mapped_property_can_be_set(self):
        job = ImportJob()
        job.mapped_property = {"name": "Test", "type": "apartment"}
        assert job.mapped_property == {"name": "Test", "type": "apartment"}
