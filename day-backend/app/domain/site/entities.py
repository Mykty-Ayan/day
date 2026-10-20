"""A company's public site: its address in a link, how it looks, how a guest reaches it.

The owner edits it in the web, no release needed: the pages read it on each visit.
"""

from __future__ import annotations

import re
import uuid
from dataclasses import dataclass
from datetime import datetime

# Lower-case letters, digits and inner hyphens: "munar", "auezov-city-apart".
SLUG = re.compile(r"^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$")
# Words a link might read as Day's own pages.
RESERVED_SLUGS = frozenset({"day", "admin", "api", "app", "tma", "login", "register", "settings", "public", "www"})
COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")


@dataclass
class CompanySite:
    company_id: uuid.UUID
    slug: str
    title: str
    about: str | None = None
    logo_url: str | None = None
    cover_url: str | None = None
    # The site's accent: buttons and links. None is Day's own.
    accent_color: str | None = None
    # Digits of the number a guest writes to (wa.me/<digits>); and an Instagram handle.
    whatsapp: str | None = None
    instagram: str | None = None
    updated_at: datetime | None = None
