import uuid
from datetime import datetime, time

from sqlalchemy import Boolean, CheckConstraint, Integer, SmallInteger, String, Time, UniqueConstraint
from sqlalchemy.dialects.postgresql import ARRAY
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
    minibar_invoice: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    minibar_on_booking: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    minibar_opens: Mapped[time | None] = mapped_column(Time, nullable=True)
    minibar_closes: Mapped[time | None] = mapped_column(Time, nullable=True)
    # Weekend nights, Monday 0: Friday and Saturday unless the company picks others.
    weekend_nights: Mapped[list[int]] = mapped_column(
        ARRAY(SmallInteger), default=lambda: [4, 5], server_default="{4,5}", nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("company_id", name="uq_company_settings_company_id"),
        CheckConstraint("minibar_invoice OR minibar_on_booking", name="ck_company_settings_minibar_method"),
    )
