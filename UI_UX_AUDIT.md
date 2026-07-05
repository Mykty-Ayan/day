# UI/UX Audit — Day PMS frontend

Consolidated from a 7-area audit (shared-ui, layout-shell, booking-forms, property-forms, gantt-calendar, list-detail, design-system) + live-browser verification at 390px. Findings deduped and ranked. Each line is a fix task.

**Counts:** P0 = 4 · P1 = 20 · P2 = ~35. Root causes concentrate in 3 shared spots (MobileShell padding, `min-w-max` toggle override, Select trigger truncation) — fix those first for maximum leverage.

Legend: `- [ ] [area] title — file:line — fix`

---

## P0 — blocks usage on a common viewport

- [ ] [layout] Bottom nav overlaps content (safe-area) — `components/layout/MobileShell.tsx:99` `pb-24` → `pb-[calc(6rem+env(safe-area-inset-bottom))]`. Also add page-level bottom padding on pages that render their own trailing CTAs: `pages/bookings/CreateBookingPage.tsx:288`, `pages/bookings/EditBookingPage.tsx:178`, `pages/properties/GanttChartPage.tsx:224`. (V1/DS-2/G1/F15)
- [ ] [shared-ui] Segmented toggles hidden behind scroll — `min-w-max` override defeats base `flex-wrap`. Remove `min-w-max` (and the `overflow-x-auto` wrappers) at all call sites so rows wrap: `CreateBookingPage.tsx:544`, `EditBookingPage.tsx:311`, `BookingListPage.tsx:168,185`, `BookingDetailPage.tsx:500,736`, `PropertyListPage.tsx:70,87`, `GanttChartPage.tsx:276`. (V2/DS-1)
- [ ] [layout] Shell has no horizontal-overflow guard — one wide child scrolls whole viewport — `MobileShell.tsx:99` add `overflow-x-hidden` + `min-w-0` to `<main>`. (layout P1, promoted — last line of defense)
- [ ] [gantt] Booking drag-to-move is dead on touch (whole move feature unusable on mobile) — `components/property/GanttChart.tsx:773-775` — add a touch fallback: a "Move to…" action in the existing touch bottom-sheet (`:921`) or pointer-events drag. (G2)

## P1 — major friction / looks broken

### Shared UI / design system
- [ ] [shared-ui] `SelectTrigger` wraps long value instead of truncating — `components/ui/select.tsx:16-26` — add `min-w-0` to trigger, wrap value in `truncate` span, `shrink-0` on chevron. (V4/DS-6/F19)
- [ ] [shared-ui] `Button` has no focus-visible ring — `components/ui/Button.tsx:39` — add `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/20`. (DS-7)
- [ ] [design] Toasts not announced + error toasts auto-dismiss 3s — `components/ui/Toast.tsx:19,25` — add `role/aria-live` (polite success, assertive error), longer/no dismiss for errors + pause on hover. (DS-5)
- [ ] [design] `color-scheme` unset → native inputs may render dark-on-dark — `index.css` — add `:root { color-scheme: light; }`. (DS-4)
- [ ] [shared-ui] Hardcoded English defaults in primitives — `time-picker.tsx:28,54,75`, `date-picker.tsx:34`, `date-range-picker.tsx:42`, `number-input.tsx:109,119` — route through `t()` (add `common.selectTime/pickDate/selectDates/increment/decrement`). (DS-3/G6/N4)
- [ ] [layout] Desktop top nav (9 items, nowrap) overflows at ~1024px — `routes/__root.tsx:91-109` — wrap in `overflow-x-auto min-w-0` and/or raise shell breakpoint to `max-width:1279px`. (layout P1)

### Booking forms
- [ ] [booking] Edit form silently drops existing notes (`notes:''` hardcoded) — `EditBookingPage.tsx:57` — populate from `detail.booking.notes` (thread through type/read) or remove the field. (N1)
- [ ] [booking] Mobile: price panel renders BELOW submit buttons — `CreateBookingPage.tsx:306,674` — give price panel `order-first lg:order-none`. (N2)
- [ ] [booking] Source toggle: after removing `min-w-max`, let it wrap (2 rows) — `CreateBookingPage.tsx:536-552`, `EditBookingPage.tsx:303-319`. (V2 follow-through)

### Gantt / calendar (the "inconvenient calendar" complaint)
- [ ] [gantt] 180px name column + 40px cells → ~5 days visible at 390px — `GanttChart.tsx:46-47` — make `NAME_W`/`CELL_W` responsive (name ~110px mobile, sticky/collapsible). (G3)
- [ ] [gantt] Cells & booking bars are non-semantic `<div onClick>` — keyboard/SR inaccessible — `GanttChart.tsx:673-697,771-806` — render as `<button>` with `aria-label` + focus ring. (G4)
- [ ] [gantt] No horizontal-scroll affordance — `GanttChart.tsx:558-561` — add edge fade / persistent thin scrollbar. (G5)
- [ ] [gantt] Hourly/same-day bars shrink to ~20px (untappable, name gone) — `GanttChart.tsx:444` — raise min width toward `CELL_W` or render a distinct dot/pill marker. (G14, ties to Phase 5 note)

### Property forms
- [ ] [property] PricingForm is 100% hardcoded English — `components/property/PricingForm.tsx` (all labels 186-293) — replace with `t('properties.pricing.*')` (add keys). (property P1)
- [ ] [property] Seasonal dates render English month names — `PricingForm.tsx:52` — pass i18n date-fns locale or numeric `dd.MM.yyyy`. (property P1)
- [ ] [property] Photos step: English strings + dropzone not keyboard-accessible — `PropertyFormStepPhotos.tsx:57-67,103,117` — wrap in `t()`, make dropzone a real `<button>`/`<label htmlFor>` with key handler. (property P1)

### List / detail
- [ ] [list] Dates hardcoded to `en-US` across list/detail — `BookingListPage.tsx:356`, `TodayPage.tsx:200`, `CleaningListPage.tsx:288`, `BookingDetailPage.tsx:1234` — pass `i18n.language` / shared `formatDate` helper. (F1)
- [ ] [list] Raw enum/UUID shown to users — `CleaningDetailPage.tsx:131,229,300`, `CleanerTaskDetailPage.tsx:259,273`, cleaner ids `CleaningListPage.tsx:174,238` — map via existing `t()` label maps; resolve names; render checklist item `title` not id. (F2/F3)
- [ ] [list] No error state — failed query looks like "empty" — `BookingListPage.tsx:199`, `CleaningListPage.tsx:128`, `PropertyListPage.tsx:153`, `AnalyticsDashboardPage.tsx:80` — handle `isError` with a retry state before empty. (F4)
- [ ] [list] Table rows keyboard-inaccessible — `BookingListPage.tsx:271-315`, `CleaningListPage.tsx:199-245` — make rows focusable buttons/links + Enter/Space. (F5)
- [ ] [cleaner] Photo controls unreadable / sub-min tap targets — `CleanerTaskDetailPage.tsx:310-325` — move room-type select below thumb at `text-xs`, delete btn ≥44px + `aria-label`. (F6)

## P2 — polish / consistency / a11y (batch after P0/P1)

- [ ] [shared-ui] Hit targets < 44px: calendar day `h-9` (`calendar.tsx:45`), number stepper `h-6` (`number-input.tsx:108`), checkbox `h-4` (`checkbox.tsx:13`), time rows `py-1.5` (`time-picker.tsx:68`) — enlarge to ≥44px on mobile.
- [ ] [shared-ui] TimePicker: scroll selected into view on open + allow HH:MM typing; drop redundant "Selected" text — `time-picker.tsx`. (N3/DS-9)
- [ ] [shared-ui] Popover has no viewport width clamp — `popover.tsx:9` — add default `max-w-[calc(100vw-1rem)]`; centralize overlay z-index scale (z-50/z-90/z-120 inconsistent).
- [ ] [shared-ui] Select highlight uses `focus:` not `data-[highlighted]:` — `select.tsx:111`; icon needs `shrink-0` `select.tsx:25`.
- [ ] [booking] `[paused]` hardcoded EN suffix — `CreateBookingPage.tsx:332` → `t()`. Color swatches sub-44px + no `aria-label/aria-pressed` — `:596-615`. Labels lack `htmlFor` — systemic. Guest search phone-only + short rows — `:444-495`.
- [ ] [property] Detail: raw `{property.type}` (`PropertyDetailPage.tsx:267`) → `t()`; rooms/beds blank when null (`:277,285`) → `?? '-'`, suppress "m²" when empty. Basic/Address placeholders hardcoded EN. Photos grip icon implies reorder but none wired (`PropertyFormStepPhotos.tsx:92`). Discount add button 240px icon-only (`PricingForm.tsx:474`). Amenities no error state + long names wrap. Type selector no `flex-wrap`. Create vs Edit submit-feedback inconsistent.
- [ ] [gantt] Agenda uses browser locale not app lang (`GanttAgendaView.tsx:62`); two source i18n namespaces (`:176` vs `GanttChart.tsx:229`); agenda price unformatted (`:179`); 9px price / 10px weekday text; DateRangePicker label omits year (`date-range-picker.tsx:73`); range preview tooltip mouse-only (touch parity).
- [ ] [list] Analytics no empty/no-data state (`:89`); tag filter lone icon no label (`PropertyListPage.tsx:110`); English fallbacks 'Unknown'/'Cleaning Task' + inconsistent name priority; hardcoded "at {time}" + raw `type.replace('_',' ')`; search no debounce (`BookingListPage.tsx:122`); bare `<Spinner/>` drops page chrome (`BookingDetailPage.tsx:170`); persisted table viewMode → wide h-scroll on mobile (`:87`); not-found views dead-end (no back link); payment/deposit enums untranslated (`BookingDetailPage.tsx:633`); cleaning tabs missing tablist roles (`CleaningDetailPage.tsx:75`); verify cleaner routes don't double the bottom nav (F20).
- [ ] [design] ~63 `text-[10px]/[11px]` sites below comfortable mobile legibility (nav labels truncate at 10px); Button variant typography inconsistent (primary `font-semibold` vs secondary `text-xs font-bold`).

---

## Suggested fix order (batches)

1. **Batch A — root causes / cross-cutting** (highest leverage, small diffs): MobileShell safe-area + overflow guard; remove `min-w-max` everywhere; Select truncate; Button focus ring; `color-scheme:light`; Toast aria-live + error dismiss; shared-ui i18n defaults; shared-ui 44px hit targets.
2. **Batch B — booking forms**: page pb, source toggle wrap, price panel order, Edit notes bug, TimePicker scroll-into-view, paused/label a11y.
3. **Batch C — gantt/calendar**: responsive name/cell width, semantic buttons + scroll affordance, touch move fallback, hourly bar min-width, locale formatting.
4. **Batch D — property forms**: PricingForm i18n, month-name locale, photos i18n+a11y, detail null/enum handling, discount button.
5. **Batch E — list/detail**: locale dates, enum/UUID rendering, error states, keyboard rows, cleaner photo controls, skeletons, debounce, viewMode.

Each batch: implement → `npm run build` + browser re-check → one commit.
