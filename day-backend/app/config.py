from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/day"
    REDIS_URL: str = "redis://localhost:6379/0"

    S3_ENDPOINT: str = "http://localhost:9000"
    S3_ACCESS_KEY: str = ""
    S3_SECRET_KEY: str = ""
    S3_BUCKET: str = "day-uploads"

    JWT_SECRET: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    CORS_ORIGINS: list[str] = ["http://localhost:5173"]

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
