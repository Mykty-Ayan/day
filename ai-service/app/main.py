import json
import logging
import time

from fastapi import FastAPI, Request, Response
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

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


def _setup_logging() -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(JSONFormatter())
    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(logging.INFO)


def create_app() -> FastAPI:
    _setup_logging()

    app = FastAPI(title="Day PMS AI Service", version="0.1.0")
    app.add_middleware(RequestLoggingMiddleware)
    app.include_router(api_v1_router)
    return app


app = create_app()
