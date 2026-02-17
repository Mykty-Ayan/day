from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException

from app.application.parse_listing import ParseListingInput, ParseListingService
from app.domain.services import ContentParser
from app.domain.value_objects import SourceType
from app.infrastructure.extractors.llm_extractor import LLMExtractor
from app.infrastructure.mappers.property_mapper import DefaultPropertyMapper
from app.infrastructure.parsers.airbnb_parser import AirbnbParser
from app.infrastructure.parsers.booking_parser import BookingParser
from app.infrastructure.parsers.generic_parser import GenericParser
from app.infrastructure.parsers.krisha_parser import KrishaParser
from app.presentation.schemas.parse import ExtractedPropertyResponse, ParseRequest, ParseResponse

logger = logging.getLogger(__name__)

router = APIRouter(tags=["parse"])

# Parser registry mapping source types to their parser implementations
_PARSER_MAP: dict[SourceType, type[ContentParser]] = {
    SourceType.BOOKING: BookingParser,
    SourceType.AIRBNB: AirbnbParser,
    SourceType.KRISHA: KrishaParser,
    SourceType.OTHER: GenericParser,
}


def _parser_factory(source_type: SourceType) -> ContentParser:
    """Create a parser instance for the given source type."""
    parser_cls = _PARSER_MAP.get(source_type, GenericParser)
    return parser_cls()


@router.post("/parse", response_model=ParseResponse)
async def parse_listing(body: ParseRequest) -> ParseResponse:
    """Parse a property listing URL and extract structured property data."""
    service = ParseListingService(
        parser_factory=_parser_factory,
        extractor=LLMExtractor(),
        mapper=DefaultPropertyMapper(),
    )

    try:
        result = await service.execute(
            ParseListingInput(url=body.url, user_prompt=body.user_prompt),
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    except Exception:
        logger.exception("Unexpected error parsing listing: %s", body.url)
        raise HTTPException(status_code=500, detail="Internal server error while parsing listing") from None

    return ParseResponse(
        source_url=result.source_url,
        source_type=result.source_type.value,
        raw_data=result.raw_data,
        property_data=ExtractedPropertyResponse(
            name=result.property_data.name,
            internal_name=result.property_data.internal_name,
            type=result.property_data.type,
            description=result.property_data.description,
            source_url=result.property_data.source_url,
            latitude=result.property_data.latitude,
            longitude=result.property_data.longitude,
            address_full=result.property_data.address_full,
            rooms=result.property_data.rooms,
            beds=result.property_data.beds,
            area_total=result.property_data.area_total,
            area_living=result.property_data.area_living,
            floor=result.property_data.floor,
            check_in_instructions=result.property_data.check_in_instructions,
            check_out_instructions=result.property_data.check_out_instructions,
            house_rules=result.property_data.house_rules,
            amenities=result.property_data.amenities,
            base_price=result.property_data.base_price,
            photos=result.property_data.photos,
        ),
        confidence=result.confidence,
        warnings=result.warnings,
    )
