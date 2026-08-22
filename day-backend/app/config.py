from pathlib import Path

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/day"
    REDIS_URL: str = "redis://localhost:6379/0"

    S3_ENDPOINT: str = Field(
        default="http://localhost:9000",
        validation_alias=AliasChoices("S3_ENDPOINT", "S3_ENDPOINT_URL"),
    )
    S3_PUBLIC_ENDPOINT: str | None = None
    S3_PUBLIC_READ: bool = False
    S3_MAX_DOWNLOAD_BYTES: int = 25 * 1024 * 1024
    S3_ACCESS_KEY: str = ""
    S3_SECRET_KEY: str = ""
    S3_BUCKET: str = Field(
        default="day-uploads",
        validation_alias=AliasChoices("S3_BUCKET", "S3_BUCKET_NAME"),
    )

    JWT_SECRET: str = Field(default=..., min_length=16)
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    CORS_ORIGINS: list[str] = ["http://localhost:5173", "https://frontend-dev-62e8.up.railway.app"]

    # Default clock times applied to daily bookings whose check-in/check-out
    # arrive as a bare date (or midnight). Hourly bookings carry explicit times.
    DEFAULT_CHECK_IN_HOUR: int = 14
    DEFAULT_CHECK_OUT_HOUR: int = 12

    AI_SERVICE_URL: str = "http://ai-service:8001" if Path("/.dockerenv").exists() else "http://localhost:8001"

    # Public HTTPS origin of this API. Both bots register webhooks against it,
    # so it must be the address the provider can actually reach.
    PUBLIC_BASE_URL: str = "http://localhost:8000"

    # Telegram — host-facing bot. The secret is echoed back by Telegram in the
    # X-Telegram-Bot-Api-Secret-Token header on every webhook delivery.
    TELEGRAM_BOT_TOKEN: str = ""
    TELEGRAM_WEBHOOK_SECRET: str = ""

    # WhatsApp via whapi.cloud — guest-facing bot.
    WHAPI_TOKEN: str = ""
    WHAPI_API_URL: str = "https://gate.whapi.cloud"
    WHAPI_WEBHOOK_SECRET: str = ""

    # Channex — channel manager (OTA distribution). The webhook secret is a
    # path segment on /webhooks/channex/{secret}, same scheme as whapi.
    CHANNEX_API_URL: str = "https://staging.channex.io"
    CHANNEX_API_KEY: str = ""
    CHANNEX_WEBHOOK_SECRET: str = ""

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
