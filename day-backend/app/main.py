import asyncio
import json
import logging
import re
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from starlette.datastructures import MutableHeaders
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.types import ASGIApp, Message, Receive, Scope, Send

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


def _redact_query(query: str) -> str | None:
    """The query string for the request log, without guests' phone numbers or link tokens."""
    if not query:
        return None
    return re.sub(r"(^|&)(phone|token)=[^&]*", r"\1\2=***", query)


class _RedactAccessLog(logging.Filter):
    """uvicorn's access line carries the full path, query included; redact it the same way.

    A calendar link's token is a standing key to a flat's occupancy, and logs
    are read by more people than the link was given to.
    """

    def filter(self, record: logging.LogRecord) -> bool:
        args = record.args
        if isinstance(args, tuple) and len(args) >= 3 and isinstance(args[2], str) and "?" in args[2]:
            path, _, query = args[2].partition("?")
            record.args = (*args[:2], f"{path}?{_redact_query(query)}", *args[3:])
        return True


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
                "query": _redact_query(str(request.url.query)),
            }
        }
        logger.info("%s %s %d %dms", request.method, request.url.path, response.status_code, elapsed_ms, extra=extra)
        return response


class SecurityHeadersMiddleware:
    """Browser hardening headers on every API response, error pages included.

    The API answers with JSON (and Swagger at /docs), so nothing it serves is
    meant to be framed, sniffed into another type, or leak its URL as a referrer.
    """

    HEADERS = {
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Referrer-Policy": "no-referrer",
        "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    }

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                for name, value in self.HEADERS.items():
                    headers.setdefault(name, value)
            await send(message)

        await self.app(scope, receive, send_with_headers)


_STORAGE_RETRY_FIRST_DELAY = 5.0
_STORAGE_RETRY_MAX_DELAY = 300.0


async def _sync_storage_read_policy(stop: asyncio.Event) -> None:
    """Retry until MinIO answers: giving up would leave a public bucket public."""
    from app.infrastructure.storage.s3 import sync_read_policy

    delay = _STORAGE_RETRY_FIRST_DELAY
    while not stop.is_set():
        try:
            await sync_read_policy()
            logger.info("Storage read policy applied: listing photos public, everything else private")
            return
        except Exception:
            logger.exception("Storage read policy could not be applied, retrying in %.0fs", delay)
        try:
            await asyncio.wait_for(stop.wait(), timeout=delay)
        except TimeoutError:
            pass
        delay = min(delay * 3, _STORAGE_RETRY_MAX_DELAY)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    import asyncio

    from app.domain.messaging.value_objects import Channel
    from app.infrastructure.calendar_worker import calendar_worker
    from app.infrastructure.hold_worker import hold_worker
    from app.infrastructure.messaging.factory import get_provider
    from app.infrastructure.messaging.worker import notification_worker

    stop = asyncio.Event()
    workers = [
        asyncio.create_task(notification_worker(stop)),
        asyncio.create_task(hold_worker(stop)),
        asyncio.create_task(calendar_worker(stop)),
    ]
    # A bucket made public by an older deploy stays public until its policy
    # is removed, and it holds guests' documents. In the background: a slow
    # or absent MinIO must not hold up the API.
    workers.append(asyncio.create_task(_sync_storage_read_policy(stop)))

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
        for worker in workers:
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
    logging.getLogger("uvicorn.access").addFilter(_RedactAccessLog())


def create_app() -> FastAPI:
    _setup_logging()

    app = FastAPI(title="Day PMS API", version="0.7.0", lifespan=lifespan)

    from app.infrastructure.rate_limiter import RateLimitMiddleware

    app.add_middleware(RateLimitMiddleware)
    app.add_middleware(RequestLoggingMiddleware)
    # Outside the rate limiter, so a 429 carries the headers too.
    app.add_middleware(SecurityHeadersMiddleware)

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
