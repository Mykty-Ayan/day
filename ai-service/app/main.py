from fastapi import FastAPI

from app.presentation.api.v1 import api_v1_router


def create_app() -> FastAPI:
    app = FastAPI(title="Day PMS AI Service", version="0.1.0")
    app.include_router(api_v1_router)
    return app


app = create_app()
