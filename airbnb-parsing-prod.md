# Airbnb Parsing In Production

## 1) Short answer: do we need MCP?

No, not for occupancy.

- For occupancy/calendar, you can work directly with Airbnb web endpoints.
- MCP is optional as a fallback/integration layer, not a hard dependency.
- If your priority is stable occupancy checks, build a direct parser pipeline first.

## 2) What must be solved

Input URL can be any Airbnb variant:

- `https://airbnb.ru/multicalendar/<id>`
- `https://ru.airbnb.com/rooms/<id>?check_in=...`
- `https://www.airbnb.com/rooms/<id>?...`

Core requirement: normalize everything to `listing_id`.

## 3) URL normalization

1. Parse URL.
2. Extract numeric listing id from path:
   - `/(rooms|multicalendar)/(\d+)`
3. If not found:
   - open page and parse canonical/og URL (`/rooms/<id>`).
4. Store canonical room URL:
   - `https://www.airbnb.com/rooms/<listing_id>`

## 4) Data source for occupancy

Use Airbnb calendar API (GraphQL persisted query endpoint used by frontend):

- `GET /api/v3/PdpAvailabilityCalendar/<hash>?operationName=PdpAvailabilityCalendar...`

Response includes daily flags:

- `calendarDate`
- `available`
- `availableForCheckin`
- `availableForCheckout`
- `minNights`

This is the correct source for occupancy, not SSR-only `BOOK_IT` fields.

## 5) Required request context

Direct API calls usually require frontend headers/cookies:

- `x-airbnb-api-key`
- `x-airbnb-graphql-platform: web`
- `x-airbnb-graphql-platform-client: minimalist-niobe`
- `x-airbnb-supports-airlock-v2: true`
- `x-csrf-without-token: 1`
- browser-like `User-Agent`
- active cookies/session

If missing, you get errors like `invalid_key`.

## 6) Production architecture

### Components

1. `Normalizer`:
   - input URL -> `listing_id`, canonical URL.
2. `Session bootstrap`:
   - fetch room page to get cookies and locale/currency context.
3. `Calendar client`:
   - call `PdpAvailabilityCalendar` month-by-month.
4. `Range evaluator`:
   - convert day-level data to requested stay decision.
5. `Fallback manager`:
   - if API blocked/changed, fallback to browser-driven extraction or MCP.
6. `Cache`:
   - cache calendar per listing/month for short TTL.
7. `Monitoring`:
   - track failures by type (`invalid_key`, `403`, parse errors, schema drift).

## 7) Decision logic for date range

For requested range `[check_in, check_out)`:

1. All nights in range must have `available = true`.
2. `check_in` day should have `availableForCheckin = true`.
3. `check_out` day should have `availableForCheckout = true` when used by your booking logic.
4. Respect `minNights` if range length is shorter.

Suggested output statuses:

- `available`
- `unavailable`
- `partially_available`
- `unknown` (upstream/API blocked)

## 8) Fallback strategy

Order:

1. Direct calendar API.
2. Headless browser network capture:
   - open room page
   - capture `PdpAvailabilityCalendar` request template + headers
   - replay for target months.
3. MCP fallback (optional):
   - useful for listing enrichment/details, not full calendar certainty.

Never return `available` when data source is missing; return `unknown`.

## 9) Caching and rate limits

- Cache key: `listing_id + year + month + locale + currency`.
- TTL: 5-15 minutes for hot checks.
- Add retry/backoff for 429/5xx.
- Use proxy/session rotation if anti-bot blocks appear.

## 10) Observability

Track:

- success rate by source (`api`, `browser`, `mcp`)
- error rates (`400 invalid_key`, `403`, `429`, timeout, parse_fail)
- schema drift alerts (missing expected fields)
- median latency by stage

## 11) Security and compliance

- Review Airbnb Terms of Service and legal requirements before scaling.
- Keep request volume controlled.
- Do not collect unnecessary personal data.

## 12) MCP role in final design

Recommended position:

- **Primary for occupancy**: direct calendar API pipeline.
- **Optional secondary**: MCP for details enrichment and quick fallback.

If you only need occupancy in prod, MCP is not required.
