import uuid
from datetime import datetime

from sqlalchemy import Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.infrastructure.database import Base


class CompanySettingsModel(Base):
    __tablename__ = "company_settings"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(index=True)
    default_currency: Mapped[str] = mapped_column(String(10), default="KZT")
    default_language: Mapped[str] = mapped_column(String(10), default="ru")
    time_zone: Mapped[str] = mapped_column(String(64), default="Asia/Almaty", server_default="Asia/Almaty")
    secrets_lead_hours_daily: Mapped[int] = mapped_column(Integer, default=24, server_default="24")
    secrets_lead_hours_hourly: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (UniqueConstraint("company_id", name="uq_company_settings_company_id"),)
