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

    JWT_SECRET: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    CORS_ORIGINS: list[str] = ["http://localhost:5173", "https://frontend-dev-62e8.up.railway.app"]

    AI_SERVICE_URL: str = "http://ai-service:8001" if Path("/.dockerenv").exists() else "http://localhost:8001"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
