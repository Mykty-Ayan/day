from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    OPENAI_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""
    OPENROUTER_API_KEY: str = ""
    OPENROUTER_BASE_URL: str = "https://openrouter.ai/api/v1"
    OPENROUTER_APP_NAME: str = "day-ai-service"
    OPENROUTER_HTTP_REFERER: str = ""
    LLM_MODEL: str = "gpt-4o-mini"
    LLM_PROVIDER: str = "openai"  # openai | anthropic | openrouter
    REQUEST_TIMEOUT: int = 30
    MAX_CONTENT_LENGTH: int = 100000

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
