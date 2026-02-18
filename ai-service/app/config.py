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
    AIRBNB_MCP_ENABLED: bool = False
    AIRBNB_MCP_COMMAND: str = "npx"
    AIRBNB_MCP_ARGS: str = "-y @openbnb/mcp-server-airbnb"
    AIRBNB_MCP_IGNORE_ROBOTS_TEXT: bool = True
    AIRBNB_MCP_TIMEOUT_SECONDS: int = 20
    AIRBNB_MCP_WORKDIR: str = ""

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
