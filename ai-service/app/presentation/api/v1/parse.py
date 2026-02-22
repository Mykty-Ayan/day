from __future__ import annotations

import logging
import shlex

from fastapi import APIRouter, HTTPException

from app.application.parse_listing import ParseListingInput, ParseListingService
from app.application.parse_text import ParseTextInput, ParseTextService
from app.config import settings
from app.domain.entities import ParseResult
from app.domain.services import ContentParser
from app.domain.value_objects import SourceType
from app.infrastructure.enrichers.airbnb_mcp_enricher import AirbnbMCPEnricher
from app.infrastructure.extractors.llm_extractor import LLMExtractor
from app.infrastructure.mappers.property_mapper import DefaultPropertyMapper
from app.infrastructure.parsers.airbnb_parser import AirbnbParser
from app.infrastructure.parsers.booking_parser import BookingParser
from app.infrastructure.parsers.generic_parser import GenericParser
from app.infrastructure.parsers.krisha_parser import KrishaParser
from app.presentation.schemas.parse import ExtractedPropertyResponse, ParseRequest, ParseResponse, ParseTextRequest

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


def _build_airbnb_mcp_enricher() -> AirbnbMCPEnricher | None:
    if not settings.AIRBNB_MCP_ENABLED:
        return None
    try:
        args = shlex.split(settings.AIRBNB_MCP_ARGS)
        return AirbnbMCPEnricher(
            command=settings.AIRBNB_MCP_COMMAND,
            args=args,
            timeout_seconds=settings.AIRBNB_MCP_TIMEOUT_SECONDS,
            workdir=settings.AIRBNB_MCP_WORKDIR.strip() or None,
            ignore_robots_text=settings.AIRBNB_MCP_IGNORE_ROBOTS_TEXT,
        )
    except Exception:
        logger.exception("Failed to initialize Airbnb MCP enricher")
        return None


_AIRBNB_MCP_ENRICHER = _build_airbnb_mcp_enricher()


def _build_parse_response(result: ParseResult) -> ParseResponse:
    """Build a ParseResponse from a ParseResult domain entity."""
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


@router.post("/parse", response_model=ParseResponse)
async def parse_listing(body: ParseRequest) -> ParseResponse:
    """Parse a property listing URL and extract structured property data."""
    mapper = DefaultPropertyMapper()
    service = ParseListingService(
        parser_factory=_parser_factory,
        extractor=LLMExtractor(),
        mapper=mapper,
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

    if result.source_type == SourceType.AIRBNB and _AIRBNB_MCP_ENRICHER is not None:
        try:
            enrichment = await _AIRBNB_MCP_ENRICHER.enrich(result.source_url)
            if enrichment:
                ParseListingService._apply_airbnb_enrichment(result.raw_data, enrichment)
                result.property_data = mapper.map_to_property(result.raw_data, result.source_url, result.source_type)
                result.confidence = mapper.calculate_confidence(result.property_data)
        except Exception as exc:
            logger.warning("Airbnb MCP enrichment failed for %s: %s", body.url, exc)
            result.warnings.append(f"Airbnb MCP enrichment failed: {exc}")

    return _build_parse_response(result)


@router.post("/parse/text", response_model=ParseResponse)
async def parse_text(body: ParseTextRequest) -> ParseResponse:
    """Parse raw text and extract structured property data."""
    service = ParseTextService(
        extractor=LLMExtractor(),
        mapper=DefaultPropertyMapper(),
    )

    try:
        result = await service.execute(
            ParseTextInput(text=body.text, user_prompt=body.user_prompt),
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    except Exception:
        logger.exception("Unexpected error parsing text input")
        raise HTTPException(status_code=500, detail="Internal server error while parsing text") from None

    return _build_parse_response(result)
