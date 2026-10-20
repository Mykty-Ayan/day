from __future__ import annotations

import re
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.domain.site.entities import COLOR, RESERVED_SLUGS, SLUG
from app.presentation.schemas.property import WebLink


class SiteUpdate(BaseModel):
    # The site's address: /c/<slug>.
    slug: str = Field(min_length=3, max_length=40)
    title: str = Field(min_length=1, max_length=120)
    about: str | None = Field(default=None, max_length=2000)
    logo_url: WebLink | None = None
    cover_url: WebLink | None = None
    accent_color: str | None = None
    # The number guests write to, any format: only its digits are kept.
    whatsapp: str | None = Field(default=None, max_length=30)
    instagram: str | None = Field(default=None, max_length=60)

    @field_validator("slug")
    @classmethod
    def _an_address(cls, value: str) -> str:
        value = value.strip().lower()
        if not SLUG.match(value):
            raise ValueError("Latin letters, digits and hyphens, 3 to 40, not starting or ending with a hyphen")
        if value in RESERVED_SLUGS:
            raise ValueError("This address is reserved")
        return value

    @field_validator("title")
    @classmethod
    def _a_title(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("A title is required")
        return value.strip()

    @field_validator("accent_color")
    @classmethod
    def _a_color(cls, value: str | None) -> str | None:
        if value and not COLOR.match(value):
            raise ValueError("A color as #RRGGBB")
        return value.lower() if value else None

    @field_validator("whatsapp")
    @classmethod
    def _a_number(cls, value: str | None) -> str | None:
        if not value or not value.strip():
            return None
        digits = re.sub(r"\D", "", value)
        if len(digits) == 11 and digits.startswith("8"):
            digits = "7" + digits[1:]  # a Kazakh number written the local way
        if not 10 <= len(digits) <= 15:
            raise ValueError("A phone holds 10 to 15 digits")
        return digits

    @field_validator("instagram")
    @classmethod
    def _a_handle(cls, value: str | None) -> str | None:
        if not value or not value.strip():
            return None
        handle = value.strip().removeprefix("https://").removeprefix("www.").removeprefix("instagram.com/")
        handle = handle.strip("/").lstrip("@")
        if not re.fullmatch(r"[A-Za-z0-9._]{1,30}", handle):
            raise ValueError("An Instagram name: letters, digits, dots and underscores")
        return handle

    @field_validator("about")
    @classmethod
    def _about(cls, value: str | None) -> str | None:
        return value.strip() or None if value else None


class SiteResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    slug: str
    title: str
    about: str | None = None
    logo_url: str | None = None
    cover_url: str | None = None
    accent_color: str | None = None
    whatsapp: str | None = None
    instagram: str | None = None
    updated_at: datetime | None = None


class PublicCompanyFlat(BaseModel):
    code: str
    name: str
    complex_name: str | None = None
    rooms: int | None = None
    max_guests: int | None = None
    area_total: float | None = None
    photo: str | None = None
    # By the kind of stay the flat takes; none when not let that way or not priced.
    night_price: float | None = None
    hour_price: float | None = None


class PublicCompanyResponse(BaseModel):
    """A company's page for guests: who it is, how to reach it, its rules and its flats on sale."""

    slug: str
    title: str
    about: str | None = None
    logo_url: str | None = None
    cover_url: str | None = None
    accent_color: str | None = None
    whatsapp: str | None = None
    instagram: str | None = None
    # The company's rules for anyone (pets, smoking, documents); never a rule for staying guests.
    rules: list[str] = []
    flats: list[PublicCompanyFlat] = []


