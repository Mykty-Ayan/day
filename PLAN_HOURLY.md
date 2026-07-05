# PLAN — Hourly + Daily Rental (unified `datetime` + `rental_mode`)

> Goal: extend the DAILY-only system to support BOTH hourly and daily rental in ONE model.
> Approach (fixed by user decisions): `datetime` is a superset of `date`; daily bookings just carry default check-in/out times. Each property has a **daily price AND an hourly price** — no time-of-day tariff grid. `rental_mode ∈ {daily, hourly, both}` on property and booking. `super_admin` untouched. Do NOT fork into two systems.

**Investigation note:** The 7 area reports arrived empty, so this plan was rebuilt from a direct read of the live code. Every file path / line below was verified in-repo.

## Core problem (verified)
- `bookings.check_in/check_out` are SQLAlchemy `Date` — model `app/infrastructure/models/booking.py:69-70`, migration `alembic/versions/a2b3c4d5e6f7_add_booking_domain_tables.py:75-76`, domain `app/domain/booking/entities.py:56-57`.
- `PriceCalculatorService.calculate` (`app/application/booking/price_calculator.py:52-54`) does `nights=(check_out-check_in).days` and `raise if nights<=0` → same-day/hourly impossible.
- `create_booking.py:63-64` and `update_booking.py:94` reject `check_out <= check_in`.
- Overlap query `booking.py:322-327` uses half-open `check_in < check_out AND check_out > check_in` — **works unchanged for datetime**.
- Analytics `app/infrastructure/repositories/analytics.py:65-69` does `cast(eff_check_out - eff_check_in, Integer)` — **breaks** once columns become `timestamp` (interval can't cast to Integer). Revenue proration `analytics.py:223-230` divides by `(co-ci).days` → **division by zero** for sub-day bookings. This is the finance-phase blocker.
- No advertising/ROI module exists (`find` returned nothing); "finances/ROI" are derived entirely from `analytics.py` + `calculate_metrics.py`.

## Global decisions (apply everywhere)
- **RentalMode enum** `daily | hourly | both` (property = what's allowed; booking = what this booking is; booking mode must be a subset the property allows).
- **Default times for daily bookings**: check-in `14:00`, check-out `12:00` (local). Constant `DEFAULT_CHECK_IN_HOUR=14`, `DEFAULT_CHECK_OUT_HOUR=12` in `app/config.py`. Backfill and daily-mode form submission use these.
- **Pricing**: `pricing_configs.hourly_price` NUMERIC(12,2) added alongside existing `base_price` (daily). Nothing else. Seasonal/weekend/discount logic stays daily-only.
- **Billing rule**: daily booking → existing per-night engine. Hourly booking → `ceil(hours) * hourly_price`, no weekend/seasonal/discount modifiers (keep SIMPLE). `both`-mode property: booking picks one mode explicitly.

---

## Phase 1 — Core: `datetime` + `rental_mode` foundation  ⟵ do first, unblocks everything
**Goal:** Columns become `timestamp`, `rental_mode`/`hourly_price` exist end-to-end, DAILY behaviour is byte-for-byte preserved (times default to 14:00/12:00). No hourly logic yet.

### Backend
- [ ] `app/domain/booking/value_objects.py`: add `class RentalMode(str, enum.Enum): DAILY="daily"; HOURLY="hourly"; BOTH="both"`.
- [ ] `app/domain/booking/entities.py`: `Booking.check_in/check_out: datetime | None`; add `rental_mode: RentalMode = RentalMode.DAILY`. Update import to `datetime`.
- [ ] `app/domain/property/entities.py`: `Property.rental_mode: RentalMode = RentalMode.DAILY`; `PricingConfig.hourly_price: Decimal = Decimal("0")`.
- [ ] `app/infrastructure/models/booking.py:69-70`: `check_in/check_out: Mapped[datetime] = mapped_column(DateTime)`; add `rental_mode: Mapped[str] = mapped_column(String(20), default="daily")`. Import `DateTime`.
- [ ] `app/infrastructure/models/property.py`: `PropertyModel.rental_mode: Mapped[str] = mapped_column(String(20), default="daily")`; `PricingConfigModel.hourly_price: Mapped[float] = mapped_column(Numeric(12,2), default=0)`.
- [ ] `app/infrastructure/repositories/booking.py`: `_model_to_booking` (73-92) map `rental_mode=RentalMode(m.rental_mode)`; `create` (287-304) + `update` (449-464) set `rental_mode=booking.rental_mode.value`. Import `RentalMode`.
- [ ] `app/infrastructure/repositories/property.py`: `_model_to_pricing` (123) add `hourly_price=Decimal(str(m.hourly_price))`; pricing `save` (372) + `update` (392) set `hourly_price=float(config.hourly_price)`. `_model_to_property` + property `save`/`update` map `rental_mode`.
- [ ] `app/config.py`: add `DEFAULT_CHECK_IN_HOUR=14`, `DEFAULT_CHECK_OUT_HOUR=12`.
- [ ] Schemas `app/presentation/schemas/booking.py`: `BookingCreate/BookingUpdate/BookingResponse` `check_in/check_out: datetime`; add `rental_mode: RentalMode = RentalMode.DAILY`. Also `GanttBookingResponse` (247), `TodayBookingItem` (277), `PriceCalculateRequest` (224): `date → datetime`, add `rental_mode`.
- [ ] Schemas `app/presentation/schemas/property.py`: `PricingConfigCreate/Response` add `hourly_price: Decimal = Field(default=Decimal("0"), ge=0)`; `PropertyCreate/Update/Response` add `rental_mode: RentalMode = RentalMode.DAILY`. `ManagePricingService.PricingConfigInput` (`manage_pricing.py:17`) + `create_property`/`update_property` carry the new fields.
- [ ] Service default-time coercion: in `create_booking.py` (before overlap/price) and `update_booking.py`, when `rental_mode==DAILY` and an incoming value is midnight/date-only, set time to the 14:00/12:00 defaults. Keep `check_out > check_in` guard (still valid for daily).

### Frontend
- [ ] `src/types/booking.ts`: add `export type RentalMode='daily'|'hourly'|'both'`; add `rental_mode: RentalMode` to `Booking`, `BookingCreateInput`, `BookingUpdateInput`. `check_in/check_out` stay `string` (ISO datetime — no type change).
- [ ] `src/types/property.ts`: `PricingConfig` + `PricingInput` add `hourly_price: number`; `Property` + `PropertyCreateInput` add `rental_mode: RentalMode`.
- [ ] No `api/*` change — payloads are plain strings/objects.

### Migration
`alembic/versions/011_hourly_rental_core.py` (down_revision = **`010_auth_tables`**, current head):
- [ ] `op.add_column("properties", sa.Column("rental_mode", sa.String(20), nullable=False, server_default="daily"))`.
- [ ] `op.add_column("pricing_configs", sa.Column("hourly_price", sa.Numeric(12,2), nullable=False, server_default="0"))`.
- [ ] `op.add_column("bookings", sa.Column("rental_mode", sa.String(20), nullable=False, server_default="daily"))`.
- [ ] Convert booking dates → timestamp WITH backfilled default times (Postgres):
  `ALTER TABLE bookings ALTER COLUMN check_in TYPE timestamp USING (check_in + time '14:00')`,
  `ALTER TABLE bookings ALTER COLUMN check_out TYPE timestamp USING (check_out + time '12:00')`.
- [ ] `downgrade`: `ALTER ... TYPE date USING check_in::date`; drop the three added columns.

### Tests
- [ ] `tests/test_booking_services.py`, `tests/test_booking_list_service.py`: update fixtures to pass `datetime`; assert daily total unchanged.
- [ ] New `tests/test_rental_mode_core.py`: create daily booking with date-only input → stored at 14:00/12:00; `rental_mode` round-trips through repo; `hourly_price` round-trips through pricing repo.
- [ ] Run `rtk alembic upgrade head` on a seeded DB; confirm existing bookings survive with sane times.

### Done-criteria
- [ ] `rtk pytest tests` green (daily behaviour identical).
- [ ] Migration up+down clean on a populated DB.
- [ ] `rtk tsc` / frontend build green; existing daily flows unaffected.

---

## Phase 2 — Pricing engine: hourly branch
**Goal:** `PriceCalculatorService` handles both modes; hourly = `ceil(hours)*hourly_price`.

### Backend
- [ ] `app/application/booking/price_calculator.py`:
  - Change signature to accept `datetime` and `rental_mode: RentalMode`.
  - `PriceBreakdown` (16): add `unit_label: str` ("nights"|"hours") and `units: int`; keep `nights` populated for daily (0 for hourly) to avoid breaking daily callers.
  - Branch: `if rental_mode==HOURLY:` compute `hours = ceil((check_out-check_in).total_seconds()/3600)`; `if hours<=0: raise ValueError`; `base_total = hourly_price*hours`; skip weekend/seasonal/discount/extra-guest-per-night (extra-guest stays per booking or omitted — omit for SIMPLE); `total = base_total`.
  - Daily branch unchanged except `nights=(check_out.date()-check_in.date()).days` (derive whole nights from the date part; still `raise if nights<=0`).
- [ ] `app/presentation/schemas/booking.py`: `PriceCalculateResponse` (232) add `hours: int` and `unit_label: str`.
- [ ] Booking API `calculate_price` handler passes `rental_mode` through.

### Frontend
- [ ] `src/types/booking.ts`: `PriceCalculation` + `PriceCalculateInput` add `hours: number`, `unit_label: string`, `rental_mode: RentalMode`.
- [ ] `CreateBookingPage.tsx` price panel (559): show hours line when `unit_label==='hours'`.

### Migration
- [ ] None.

### Tests
- [ ] `tests/test_price_calculator.py`: hourly 3h → `3*hourly_price`; 2.5h → ceil to 3; same-day daily still rejected in daily mode; daily unchanged.

### Done-criteria
- [ ] Hourly quote returns correct total; daily quotes byte-identical to Phase 1.
- [ ] `rtk pytest tests/test_price_calculator.py` green.

---

## Phase 3 — Booking create/update/move services accept hourly
**Goal:** Same-day hourly bookings can be created/edited/moved; validation is mode-aware.

### Backend
- [ ] `app/application/booking/create_booking.py`: thread `rental_mode` from input; validate booking mode ⊆ property `rental_mode`; replace `check_out <= check_in` (63-64) with mode-aware guard (`>` still required, but sub-day now legal); pass `rental_mode` to price calc and to `Booking(...)`.
- [ ] `app/application/booking/update_booking.py`: allow `rental_mode` change; same mode-aware guard at 94; recompute price via Phase-2 calc.
- [ ] `app/application/booking/move_booking.py`: on target-property change, re-validate booking mode ⊆ target `rental_mode` (currently only checks status/company at 44-47).
- [ ] `CreateBookingInput`/`UpdateBookingInput` dataclasses add `rental_mode`.

### Frontend
- [ ] `api/bookings.ts` unchanged (payload passthrough).

### Migration
- [ ] None.

### Tests
- [ ] `tests/test_booking_services.py`: create hourly booking (same calendar day) succeeds; hourly booking on a `daily`-only property is rejected; move to property that disallows the mode is rejected; overlap still enforced for two hourly bookings on the same day.

### Done-criteria
- [ ] Hourly booking survives create → read → update → move round-trip.
- [ ] `rtk pytest tests/test_booking_services.py` green.

---

## Phase 4 — Booking form UX (mode toggle + time inputs)
**Goal:** UI can create/edit both modes; daily UX unchanged by default.

### Frontend
- [ ] `src/pages/bookings/CreateBookingPage.tsx`:
  - Add `rental_mode` to `FormData`/`initialForm`; default from selected property (`daily` unless property is `hourly`/`both`).
  - Add a mode toggle (reuse `ToggleGroup`) shown only when `selectedProperty.rental_mode==='both'`.
  - Daily: keep `DateRangePicker` (dates), submit with default times applied client-side OR let backend default them (backend already does — prefer backend).
  - Hourly: render single-day date + start-time + end-time inputs; build ISO datetimes for `check_in/check_out`.
  - `getBookingPrefill` (61) + `isDateOnly` (57): accept optional time; gantt hourly cell click may prefill a time.
  - `validate` (166): hourly requires `check_out>check_in` on the same day and end-time>start-time.
  - Send `rental_mode` in `BookingCreateInput` payload (186).
- [ ] `src/pages/bookings/EditBookingPage.tsx`: mirror the above for edit.
- [ ] Property pricing form: add `hourly_price` input + `rental_mode` selector (property edit page + `PricingInput`).
- [ ] i18n: add keys for hours/mode labels in `src/locales/*`.

### Backend
- [ ] None (covered by Phases 1-3).

### Tests
- [ ] Component/e2e smoke (Playwright if present): create hourly booking through the form; daily form still works.

### Done-criteria
- [ ] Operator can book 3 hours on a `both`/`hourly` property from the UI; daily form visually unchanged for `daily` properties.

---

## Phase 5 — Gantt renders hourly bookings
**Goal:** Per-day grid tolerates datetime; hourly bookings are visible and don't corrupt day math.

### Frontend — `src/components/property/GanttChart.tsx`
- [ ] `parseDateOnly` (59) currently splits `YYYY-MM-DD` only → breaks on datetime strings. Add `parseDateTime`/normalize: take the date part for grid placement.
- [ ] `isBookedOnDate` (64), `getBarPosition` (386): compute using the **date component** of check_in/check_out; ensure a same-day hourly booking (check_in.date()==check_out.date()) still yields a ≥ min-width bar (existing `Math.max(width, CELL_W*0.5)` at 409 already guards zero-width — verify for same-day).
- [ ] `getBookingNights` (127): for hourly, show hours instead of nights in tooltip; add a small hourly badge/icon on the bar.
- [ ] Cell click (`handleCellClick` 414) for hourly-capable property: prefill a default start time in the `/bookings/new` search params.
- [ ] `GanttAgendaView.tsx`: show time range for hourly rows.

### Backend
- [ ] `get_gantt_data.py` (`GanttBooking` 13) + response schema already carry `check_in/check_out`; ensure they serialize datetime and add `rental_mode` to the gantt payload for badge rendering.

### Migration
- [ ] None.

### Tests
- [ ] Gantt smoke: an hourly booking renders as a bar on its day and its tooltip shows hours.

### Done-criteria
- [ ] Mixed daily+hourly portfolio renders without NaN/overlap glitches; same-day hourly bar visible.

---

## Phase 6 — Analytics / finances / P&L / ROI
**Goal:** Metrics stop crashing on `timestamp` columns and handle sub-day durations. (This is where the interval-cast + divide-by-zero bugs live.)

### Backend — `app/infrastructure/repositories/analytics.py`
- [ ] `clamped_nights` (65-69): `cast(eff_check_out - eff_check_in, Integer)` now yields an interval → replace with day-count derived from `func.extract('epoch', eff_check_out - eff_check_in)/86400` (floor) or `cast(func.date(eff_check_out) - func.date(eff_check_in), Integer)`. Decide the "occupancy unit": treat any hourly booking as fractional-day occupancy = `epoch/86400`, or count it as a partial-day. Recommend `booked_days = epoch/86400` (Decimal) so RevPAR/occupancy stay meaningful.
- [ ] Revenue proration (223-230): `total_booking_nights = (co-ci).days` → use seconds: `total = (co-ci).total_seconds()`; guard `if total<=0: continue`; `revenue += price * bucket_seconds/total`. Removes divide-by-zero.
- [ ] `bucket_days`/`nights_in_bucket` (211-236): recompute on seconds, not `.days`.
- [ ] `app/application/analytics/calculate_metrics.py` (49-78): rename/keep `booked_nights` semantics but source from the new day-count; ADR/RevPAR/occupancy formulas unchanged once the unit is consistent. Guard all divisions (already guarded, but re-verify with fractional denominators).
- [ ] `app/domain/analytics/entities.py`: if switching to fractional days, change `booked_nights: int` → `Decimal` (28, 39, 56) or add `booked_hours`. Keep field names stable for the frontend if possible; otherwise update `src/types/analytics.ts`.

### Frontend
- [ ] `src/types/analytics.ts` / analytics pages: if metric types changed to fractional, adjust display formatting only.

### Migration
- [ ] None.

### Tests
- [ ] `tests/test_analytics_repository.py`: dataset with one 3-hour booking + one 2-night booking → no exception, revenue attributed correctly, occupancy sane; pure-daily dataset gives identical numbers to pre-change (regression guard).

### Done-criteria
- [ ] Analytics endpoints return 200 on mixed data; daily-only numbers regression-match Phase 0 baseline.
- [ ] `rtk pytest tests/test_analytics_repository.py` green.

---

## Risks & backfill
- [ ] **Interval-cast regression (highest risk):** the moment Phase 1 converts columns to `timestamp`, `analytics.py:67-68` and its proration divide start throwing/NaN. Phases 1 and 6 must ship close together, or temporarily coerce analytics to `func.date(...)` diffs inside Phase 1 to keep endpoints alive until Phase 6.
- [ ] **Backfill semantics:** existing rows get 14:00 check-in / 12:00 check-out via the `USING (col + time '...')` cast. Verify no existing booking relied on midnight; if any cross-midnight exports exist, they shift by the default hours (acceptable, documented).
- [ ] **Overlap for hourly:** current half-open overlap is date-agnostic and already correct for timestamps — two 10:00-12:00 and 13:00-15:00 same-day bookings will NOT collide (good); 11:00-14:00 vs 13:00-15:00 will (good). Add explicit tests (Phase 3).
- [ ] **Mode subset enforcement:** a booking's `rental_mode` must be allowed by the property's `rental_mode`; enforce in create/update/move (Phase 3) to prevent an hourly booking landing on a daily-only unit.
- [ ] **Frontend datetime parsing:** `parseDateOnly` is used in multiple components; a global datetime string will silently produce `Invalid Date` if not normalized (Phase 5). Grep `parseDateOnly` before shipping.
- [ ] **Decimal vs int metrics:** switching `booked_nights` to fractional may ripple into `src/types/analytics.ts`; keep field names, change only numeric type/formatting.
- [ ] **Down-migration data loss:** downgrade casts `timestamp→date`, dropping the time component irreversibly — note in the migration docstring.

## Suggested commit sequence
1. `feat(core): datetime booking columns + rental_mode + hourly_price (migration 011, models, domain, repos, schemas, FE types)` — Phase 1.
2. `feat(pricing): hourly branch in PriceCalculatorService + response fields` — Phase 2.
3. `feat(booking): mode-aware create/update/move services` — Phase 3.
4. `feat(ui): booking form mode toggle + time inputs + hourly_price/rental_mode property fields` — Phase 4.
5. `feat(gantt): datetime-safe rendering + hourly bars/badges` — Phase 5.
6. `fix(analytics): interval-safe day math + sub-day revenue proration (no divide-by-zero)` — Phase 6.
7. `test: hourly end-to-end coverage + daily regression guards` — cross-cutting, or folded per-phase.
