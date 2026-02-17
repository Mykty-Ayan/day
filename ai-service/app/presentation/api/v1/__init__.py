from fastapi import APIRouter

from app.presentation.api.v1.health import router as health_router
from app.presentation.api.v1.parse import router as parse_router

api_v1_router = APIRouter(prefix="/api/v1")
api_v1_router.include_router(parse_router)
api_v1_router.include_router(health_router)
