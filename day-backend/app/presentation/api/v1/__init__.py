from fastapi import APIRouter

from app.presentation.api.v1.bookings import booking_router, gantt_router, guest_router
from app.presentation.api.v1.health import router as health_router
from app.presentation.api.v1.properties import amenity_router
from app.presentation.api.v1.properties import router as properties_router

api_v1_router = APIRouter(prefix="/api/v1")
api_v1_router.include_router(health_router)
api_v1_router.include_router(properties_router)
api_v1_router.include_router(amenity_router)
api_v1_router.include_router(booking_router)
api_v1_router.include_router(guest_router)
api_v1_router.include_router(gantt_router)
