import uuid
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    Date,
    Float,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.infrastructure.database import Base


class PropertyModel(Base):
    __tablename__ = "properties"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(index=True)
    name: Mapped[str] = mapped_column(String(255))
    internal_name: Mapped[str] = mapped_column(String(255))
    type: Mapped[str] = mapped_column(String(50))
    status: Mapped[str] = mapped_column(String(50), default="new")
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)

    # Location
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    address_full: Mapped[str | None] = mapped_column(String(512), nullable=True)
    apartment_number: Mapped[str | None] = mapped_column(String(50), nullable=True)
    entrance: Mapped[str | None] = mapped_column(String(50), nullable=True)
    block: Mapped[str | None] = mapped_column(String(50), nullable=True)
    floor: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Details
    rooms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    beds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    area_living: Mapped[float | None] = mapped_column(Float, nullable=True)
    area_total: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Rules
    check_in_instructions: Mapped[str | None] = mapped_column(Text, nullable=True)
    check_out_instructions: Mapped[str | None] = mapped_column(Text, nullable=True)
    house_rules: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Relationships
    photos: Mapped[list["PropertyPhotoModel"]] = relationship(
        back_populates="property", cascade="all, delete-orphan"
    )
    pricing_config: Mapped["PricingConfigModel | None"] = relationship(
        back_populates="property", uselist=False, cascade="all, delete-orphan"
    )
    amenity_links: Mapped[list["PropertyAmenityModel"]] = relationship(
        back_populates="property", cascade="all, delete-orphan"
    )
    audit_logs: Mapped[list["PropertyAuditLogModel"]] = relationship(
        back_populates="property", cascade="all, delete-orphan"
    )

    __table_args__ = (
        UniqueConstraint("company_id", "internal_name", name="uq_property_company_internal_name"),
    )


class PropertyPhotoModel(Base):
    __tablename__ = "property_photos"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    property_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("properties.id", ondelete="CASCADE"), index=True
    )
    url: Mapped[str] = mapped_column(String(1024))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_cover: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)

    property: Mapped["PropertyModel"] = relationship(back_populates="photos")


class AmenityModel(Base):
    __tablename__ = "amenities"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), unique=True)
    icon: Mapped[str | None] = mapped_column(String(255), nullable=True)
    category: Mapped[str] = mapped_column(String(50))

    property_links: Mapped[list["PropertyAmenityModel"]] = relationship(
        back_populates="amenity"
    )


class PropertyAmenityModel(Base):
    __tablename__ = "property_amenities"

    property_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("properties.id", ondelete="CASCADE"), primary_key=True
    )
    amenity_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("amenities.id", ondelete="CASCADE"), primary_key=True
    )

    property: Mapped["PropertyModel"] = relationship(back_populates="amenity_links")
    amenity: Mapped["AmenityModel"] = relationship(back_populates="property_links")


class PricingConfigModel(Base):
    __tablename__ = "pricing_configs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    property_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("properties.id", ondelete="CASCADE"), unique=True, index=True
    )
    base_price: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    weekend_markup: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    default_deposit: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    extra_adult_price: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    extra_child_price: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    base_guests: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        default=datetime.utcnow, onupdate=datetime.utcnow
    )

    property: Mapped["PropertyModel"] = relationship(back_populates="pricing_config")
    seasonal_prices: Mapped[list["SeasonalPriceModel"]] = relationship(
        back_populates="pricing_config", cascade="all, delete-orphan"
    )
    discount_rules: Mapped[list["DiscountRuleModel"]] = relationship(
        back_populates="pricing_config", cascade="all, delete-orphan"
    )


class SeasonalPriceModel(Base):
    __tablename__ = "seasonal_prices"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    pricing_config_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("pricing_configs.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(255))
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date] = mapped_column(Date)
    price_per_night: Mapped[float] = mapped_column(Numeric(12, 2))
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)

    pricing_config: Mapped["PricingConfigModel"] = relationship(
        back_populates="seasonal_prices"
    )


class DiscountRuleModel(Base):
    __tablename__ = "discount_rules"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    pricing_config_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("pricing_configs.id", ondelete="CASCADE"), index=True
    )
    min_nights: Mapped[int] = mapped_column(Integer)
    discount_percent: Mapped[float] = mapped_column(Numeric(5, 2), default=0)
    discount_fixed: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)

    pricing_config: Mapped["PricingConfigModel"] = relationship(
        back_populates="discount_rules"
    )


class PropertyAuditLogModel(Base):
    __tablename__ = "property_audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    property_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("properties.id", ondelete="CASCADE"), index=True
    )
    changed_by: Mapped[uuid.UUID | None] = mapped_column(nullable=True)
    field_name: Mapped[str] = mapped_column(String(255))
    old_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    new_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    action: Mapped[str] = mapped_column(String(50))
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)

    property: Mapped["PropertyModel"] = relationship(back_populates="audit_logs")
