"""Unit tests for AI migration Pydantic schemas."""

import uuid
from datetime import datetime

import pytest
from pydantic import ValidationError

from app.domain.ai_migration.value_objects import ImportJobStatus, ImportSource
from app.presentation.schemas.ai_migration import (
    ImportBatchRequest,
    ImportBatchResponse,
    ImportConfirmRequest,
    ImportJobListResponse,
    ImportJobResponse,
    ImportStartRequest,
)


class TestImportStartRequest:
    def test_valid_request(self):
        req = ImportStartRequest(source_url="https://booking.com/test")
        assert req.source_url == "https://booking.com/test"
        assert req.user_prompt is None

    def test_with_prompt(self):
        req = ImportStartRequest(source_url="https://booking.com/test", user_prompt="2br apt")
        assert req.user_prompt == "2br apt"

    def test_rejects_empty_url(self):
        with pytest.raises(ValidationError):
            ImportStartRequest(source_url="")

    def test_rejects_missing_url(self):
        with pytest.raises(ValidationError):
            ImportStartRequest()

    def test_url_max_length(self):
        long_url = "https://booking.com/" + "a" * 2048
        with pytest.raises(ValidationError):
            ImportStartRequest(source_url=long_url)


class TestImportConfirmRequest:
    def test_valid_request(self):
        req = ImportConfirmRequest(property_data={"name": "Test", "type": "apartment"})
        assert req.property_data["name"] == "Test"
        assert req.property_data["type"] == "apartment"

    def test_empty_dict(self):
        req = ImportConfirmRequest(property_data={})
        assert req.property_data == {}

    def test_rejects_missing_property_data(self):
        with pytest.raises(ValidationError):
            ImportConfirmRequest()

    def test_complex_property_data(self):
        data = {
            "name": "Beach Villa",
            "internal_name": "beach-villa",
            "type": "house",
            "rooms": 5,
            "beds": 6,
            "description": "A beautiful beachfront villa",
            "address_full": "123 Beach Road, Maldives",
            "latitude": 4.1753,
            "longitude": 73.5093,
        }
        req = ImportConfirmRequest(property_data=data)
        assert req.property_data["name"] == "Beach Villa"
        assert req.property_data["rooms"] == 5
        assert req.property_data["latitude"] == 4.1753


class TestImportBatchRequest:
    def test_valid_batch(self):
        req = ImportBatchRequest(
            urls=["https://booking.com/1", "https://airbnb.com/2"],
            user_prompt="Extract all",
        )
        assert len(req.urls) == 2
        assert req.user_prompt == "Extract all"

    def test_rejects_empty_urls_list(self):
        with pytest.raises(ValidationError):
            ImportBatchRequest(urls=[])

    def test_prompt_is_optional(self):
        req = ImportBatchRequest(urls=["https://booking.com/1"])
        assert req.user_prompt is None


class TestImportJobResponse:
    def test_serialization(self):
        job_id = uuid.uuid4()
        company_id = uuid.uuid4()
        now = datetime.utcnow()

        resp = ImportJobResponse(
            id=job_id,
            company_id=company_id,
            source_url="https://booking.com/test",
            user_prompt="2br apt",
            status=ImportJobStatus.COMPLETED,
            source_type=ImportSource.BOOKING,
            extracted_data={"name": "Test"},
            mapped_property={"name": "Test", "type": "apartment"},
            error_message=None,
            created_by=None,
            created_at=now,
            updated_at=now,
        )

        assert resp.id == job_id
        assert resp.company_id == company_id
        assert resp.source_url == "https://booking.com/test"
        assert resp.status == ImportJobStatus.COMPLETED
        assert resp.source_type == ImportSource.BOOKING
        assert resp.extracted_data == {"name": "Test"}
        assert resp.mapped_property == {"name": "Test", "type": "apartment"}

    def test_minimal_response(self):
        resp = ImportJobResponse(
            id=uuid.uuid4(),
            company_id=uuid.uuid4(),
            source_url="https://example.com",
            status=ImportJobStatus.PENDING,
            source_type=ImportSource.OTHER,
        )
        assert resp.user_prompt is None
        assert resp.extracted_data is None
        assert resp.mapped_property is None
        assert resp.error_message is None
        assert resp.created_by is None
        assert resp.created_at is None
        assert resp.updated_at is None

    def test_failed_status_with_error(self):
        resp = ImportJobResponse(
            id=uuid.uuid4(),
            company_id=uuid.uuid4(),
            source_url="https://booking.com/test",
            status=ImportJobStatus.FAILED,
            source_type=ImportSource.BOOKING,
            error_message="AI service timeout",
        )
        assert resp.status == ImportJobStatus.FAILED
        assert resp.error_message == "AI service timeout"

    def test_json_serialization(self):
        resp = ImportJobResponse(
            id=uuid.uuid4(),
            company_id=uuid.uuid4(),
            source_url="https://booking.com/test",
            status=ImportJobStatus.COMPLETED,
            source_type=ImportSource.BOOKING,
        )
        json_str = resp.model_dump_json()
        assert "completed" in json_str
        assert "booking" in json_str


class TestImportJobListResponse:
    def test_serialization(self):
        resp = ImportJobListResponse(
            items=[
                ImportJobResponse(
                    id=uuid.uuid4(),
                    company_id=uuid.uuid4(),
                    source_url="https://booking.com/1",
                    status=ImportJobStatus.COMPLETED,
                    source_type=ImportSource.BOOKING,
                ),
            ],
            total=1,
            page=1,
            per_page=50,
            pages=1,
        )
        assert len(resp.items) == 1
        assert resp.total == 1
        assert resp.page == 1
        assert resp.per_page == 50
        assert resp.pages == 1

    def test_empty_list(self):
        resp = ImportJobListResponse(
            items=[],
            total=0,
            page=1,
            per_page=50,
            pages=1,
        )
        assert resp.items == []
        assert resp.total == 0


class TestImportBatchResponse:
    def test_serialization(self):
        resp = ImportBatchResponse(
            jobs=[
                ImportJobResponse(
                    id=uuid.uuid4(),
                    company_id=uuid.uuid4(),
                    source_url="https://booking.com/1",
                    status=ImportJobStatus.PROCESSING,
                    source_type=ImportSource.BOOKING,
                ),
                ImportJobResponse(
                    id=uuid.uuid4(),
                    company_id=uuid.uuid4(),
                    source_url="https://airbnb.com/rooms/123",
                    status=ImportJobStatus.PROCESSING,
                    source_type=ImportSource.AIRBNB,
                ),
            ],
            total_submitted=2,
        )
        assert len(resp.jobs) == 2
        assert resp.total_submitted == 2
