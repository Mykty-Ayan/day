import httpx


class AIServiceClient:
    def __init__(self, base_url: str) -> None:
        self._base_url = base_url

    async def parse_listing(self, url: str, user_prompt: str | None = None) -> dict:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{self._base_url}/api/v1/parse",
                json={"url": url, "user_prompt": user_prompt},
            )
            response.raise_for_status()
            return response.json()
