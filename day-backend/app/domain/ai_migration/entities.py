from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime

from app.domain.ai_migration.value_objects import ImportJobStatus, ImportSource


@dataclass
class ImportJob:
    id: uuid.UUID = field(default_factory=uuid.uuid4)
    company_id: uuid.UUID = field(default_factory=uuid.uuid4)
    source_url: str = ""
    user_prompt: str | None = None
    status: ImportJobStatus = ImportJobStatus.PENDING
    source_type: ImportSource = ImportSource.OTHER
    extracted_data: dict | None = None
    mapped_property: dict | None = None
    error_message: str | None = None
    created_by: uuid.UUID | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
