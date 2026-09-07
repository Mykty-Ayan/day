from fastapi import APIRouter

from app.presentation.api.v1.ai_migration import ai_migration_router
from app.presentation.api.v1.analytics import analytics_router
from app.presentation.api.v1.assistant import assistant_router
from app.presentation.api.v1.auth import auth_router
from app.presentation.api.v1.bookings import booking_router, gantt_router, guest_router
from app.presentation.api.v1.channels import channel_router
from app.presentation.api.v1.channex import channex_router
from app.presentation.api.v1.cleaning import checklist_router, cleaning_router, rating_router
from app.presentation.api.v1.health import router as health_router
from app.presentation.api.v1.leads import blacklist_router, lead_router
from app.presentation.api.v1.properties import amenity_router
from app.presentation.api.v1.properties import router as properties_router
from app.presentation.api.v1.settings import settings_router
from app.presentation.api.v1.tags import tag_router
from app.presentation.api.v1.users import api_key_router, user_router
from app.presentation.api.v1.webhooks import webhook_router

api_v1_router = APIRouter(prefix="/api/v1")
api_v1_router.include_router(auth_router)
api_v1_router.include_router(health_router)
api_v1_router.include_router(properties_router)
api_v1_router.include_router(lead_router)
api_v1_router.include_router(blacklist_router)
api_v1_router.include_router(amenity_router)
api_v1_router.include_router(tag_router)
api_v1_router.include_router(booking_router)
api_v1_router.include_router(guest_router)
api_v1_router.include_router(gantt_router)
api_v1_router.include_router(cleaning_router)
api_v1_router.include_router(checklist_router)
api_v1_router.include_router(rating_router)
api_v1_router.include_router(analytics_router)
api_v1_router.include_router(ai_migration_router)
api_v1_router.include_router(settings_router)
api_v1_router.include_router(user_router)
api_v1_router.include_router(api_key_router)
api_v1_router.include_router(channel_router)
api_v1_router.include_router(channex_router)
api_v1_router.include_router(assistant_router)
api_v1_router.include_router(webhook_router)
