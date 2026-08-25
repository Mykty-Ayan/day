"""Issue, list and revoke the service keys used by bots and integrations."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime

from app.domain.auth.entities import ApiKey
from app.domain.auth.permissions import is_valid_scope
from app.domain.auth.repositories import ApiKeyRepository
from app.infrastructure.security import api_key_hint, generate_api_key, hash_api_key


@dataclass
class IssuedApiKey:
    """An API key plus its plaintext secret.

    The secret exists only in this object, only once — it is returned to the
    caller at creation time and never recoverable afterwards.
    """

    api_key: ApiKey
    plaintext_key: str


class ApiKeyService:
    def __init__(self, api_key_repo: ApiKeyRepository) -> None:
        self._repo = api_key_repo

    async def issue(
        self,
        company_id: uuid.UUID,
        name: str,
        scopes: list[str],
        created_by: uuid.UUID,
    ) -> IssuedApiKey:
        if not name.strip():
            raise ValueError("API key name is required")
        if not scopes:
            raise ValueError("At least one scope is required")

        unknown = sorted(scope for scope in scopes if not is_valid_scope(scope))
        if unknown:
            raise ValueError(f"Unknown scopes: {', '.join(unknown)}")

        raw_key = generate_api_key()
        api_key = ApiKey(
            company_id=company_id,
            name=name.strip(),
            hashed_key=hash_api_key(raw_key),
            key_hint=api_key_hint(raw_key),
            scopes=sorted(set(scopes)),
            created_by=created_by,
        )
        return IssuedApiKey(api_key=await self._repo.save(api_key), plaintext_key=raw_key)

    async def list(self, company_id: uuid.UUID) -> list[ApiKey]:
        return await self._repo.list_by_company(company_id)

    async def revoke(self, key_id: uuid.UUID, company_id: uuid.UUID) -> ApiKey:
        api_key = await self._repo.get_by_id(key_id)
        if api_key is None or api_key.company_id != company_id:
            raise ValueError("API key not found")
        if api_key.revoked_at is not None:
            return api_key

        api_key.revoked_at = datetime.utcnow()
        return await self._repo.update(api_key)
