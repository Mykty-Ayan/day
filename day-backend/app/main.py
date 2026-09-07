import json
import logging
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

from app.config import settings
from app.infrastructure.database import engine
from app.presentation.api.v1 import api_v1_router

logger = logging.getLogger("app.requests")


class JSONFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        log = {
            "timestamp": self.formatTime(record, self.datefmt),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        if hasattr(record, "request_data"):
            log.update(record.request_data)
        return json.dumps(log, ensure_ascii=False)


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        start = time.perf_counter()
        response = await call_next(request)
        elapsed_ms = round((time.perf_counter() - start) * 1000)
        extra = {
            "request_data": {
                "method": request.method,
                "path": request.url.path,
                "status": response.status_code,
                "duration_ms": elapsed_ms,
                "query": str(request.url.query) or None,
            }
        }
        logger.info("%s %s %d %dms", request.method, request.url.path, response.status_code, elapsed_ms, extra=extra)
        return response


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    import asyncio

    from app.domain.messaging.value_objects import Channel
    from app.infrastructure.messaging.factory import get_provider
    from app.infrastructure.messaging.worker import notification_worker

    stop = asyncio.Event()
    worker = asyncio.create_task(notification_worker(stop))

    # Telegram only delivers to the URL it was last told about, and that URL
    # changes with the deployment — so it is (re)registered on every boot.
    telegram = get_provider(Channel.TELEGRAM)
    if settings.TELEGRAM_BOT_TOKEN and settings.TELEGRAM_WEBHOOK_SECRET:
        try:
            await telegram.set_webhook(
                f"{settings.PUBLIC_BASE_URL.rstrip('/')}/api/v1/webhooks/telegram",
                settings.TELEGRAM_WEBHOOK_SECRET,
            )
            logger.info("Telegram webhook registered")
        except Exception:
            # A bot that cannot register must not stop the API from serving.
            logger.exception("Telegram webhook registration failed")

        # The menu button is the only way into the Mini App. It used to be set
        # by hand in BotFather, so it silently kept pointing at the previous
        # front-end domain after a move; registering it here ties it to the
        # deployment instead.
        mini_app_url = f"{settings.PUBLIC_APP_URL.rstrip('/')}/tma"
        try:
            await telegram.set_menu_button(mini_app_url, settings.TELEGRAM_MENU_BUTTON_TEXT)
            logger.info("Telegram menu button points at %s", mini_app_url)
        except Exception:
            logger.exception("Telegram menu button registration failed")

    try:
        yield
    finally:
        stop.set()
        worker.cancel()
        try:
            await worker
        except (asyncio.CancelledError, Exception):
            pass
        await engine.dispose()


def _setup_logging() -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(JSONFormatter())
    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(logging.INFO)


def create_app() -> FastAPI:
    _setup_logging()

    app = FastAPI(title="Day PMS API", version="0.1.0", lifespan=lifespan)

    from app.infrastructure.rate_limiter import RateLimitMiddleware

    app.add_middleware(RateLimitMiddleware)
    app.add_middleware(RequestLoggingMiddleware)

    # CORS must be the OUTERMOST middleware (added last) so that short-circuit
    # responses — e.g. a 429 from the rate limiter — still carry the
    # Access-Control-* headers; otherwise the browser reports them as opaque
    # CORS failures rather than the real status.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(api_v1_router)
    return app


app = create_app()
