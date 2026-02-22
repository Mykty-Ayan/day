from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.domain.ai_migration.value_objects import ImportJobStatus, ImportSource

# ---------- Request ----------


class ImportStartRequest(BaseModel):
    source_url: str = Field(..., min_length=1, max_length=2048)
    user_prompt: str | None = None


class ImportTextStartRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=100000)
    user_prompt: str | None = None


class ImportConfirmRequest(BaseModel):
    property_data: dict


class ImportBatchRequest(BaseModel):
    urls: list[str] = Field(..., min_length=1)
    user_prompt: str | None = None


# ---------- Response ----------


class ImportJobResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    company_id: uuid.UUID
    source_url: str
    user_prompt: str | None = None
    status: ImportJobStatus
    source_type: ImportSource
    extracted_data: dict | None = None
    mapped_property: dict | None = None
    error_message: str | None = None
    created_by: uuid.UUID | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class ImportJobListResponse(BaseModel):
    items: list[ImportJobResponse]
    total: int
    page: int
    per_page: int
    pages: int


class ImportBatchResponse(BaseModel):
    jobs: list[ImportJobResponse]
    total_submitted: int
