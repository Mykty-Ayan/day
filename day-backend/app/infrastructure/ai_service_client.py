import logging
import time

import httpx

logger = logging.getLogger("app.ai_client")


class AIServiceClient:
    def __init__(self, base_url: str) -> None:
        self._base_url = base_url

    async def parse_listing(self, url: str, user_prompt: str | None = None) -> dict:
        endpoint = f"{self._base_url}/api/v1/parse"
        payload = {"url": url, "user_prompt": user_prompt}
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await self._request(client, "POST", endpoint, payload)
            self._raise_for_status(response)
            return response.json()

    async def parse_text(self, text: str, user_prompt: str | None = None) -> dict:
        endpoint = f"{self._base_url}/api/v1/parse/text"
        payload = {"text": text, "user_prompt": user_prompt}
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await self._request(client, "POST", endpoint, payload)
            self._raise_for_status(response)
            return response.json()

    @staticmethod
    async def _request(client: httpx.AsyncClient, method: str, url: str, json: dict) -> httpx.Response:
        start = time.perf_counter()
        try:
            response = await client.request(method, url, json=json)
            elapsed_ms = round((time.perf_counter() - start) * 1000)
            logger.info(
                "ai-service %s %s %d %dms",
                method,
                url,
                response.status_code,
                elapsed_ms,
                extra={
                    "request_data": {
                        "method": method,
                        "url": url,
                        "status": response.status_code,
                        "duration_ms": elapsed_ms,
                    }
                },
            )
            return response
        except httpx.HTTPError as exc:
            elapsed_ms = round((time.perf_counter() - start) * 1000)
            logger.error(
                "ai-service %s %s FAILED %dms: %s",
                method,
                url,
                elapsed_ms,
                exc,
                extra={
                    "request_data": {
                        "method": method,
                        "url": url,
                        "error": str(exc),
                        "duration_ms": elapsed_ms,
                    }
                },
            )
            raise

    @staticmethod
    def _raise_for_status(response: httpx.Response) -> None:
        try:
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            detail = None
            try:
                payload = response.json()
                if isinstance(payload, dict):
                    detail_val = payload.get("detail")
                    if isinstance(detail_val, str) and detail_val.strip():
                        detail = detail_val
            except Exception:
                detail = None

            if detail:
                raise RuntimeError(detail) from exc
            raise
