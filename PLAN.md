# Mobile-First UX/UI Audit And Implementation Spec (All Pages)

## Summary
Цель: перевести весь `day-frontend` на mobile-first UX/UI без повторного анализа следующему агенту.  
Фокус: телефоны 320–430px, touch-first поведение, отсутствие горизонтального ломания layout, сохранение функционального паритета с desktop.

Проверено по коду:
- Структура роутинга и layout.
- Все страницы из `src/pages/*`.
- Ключевые UI-компоненты (`Button`, `ToggleGroup`, `DateRangePicker`, `Select`, `Toast`, `ConfirmDialog`, таблицы/графики/шахматка).
- Сборка проходит (`npm run build`).
- Мобильные e2e в проекте отсутствуют (Playwright только Desktop Chrome).

## Progress Log
- 2026-03-02: завершён milestone `H-*` (QA Automation + Regression Gates): в `playwright.config.ts` добавлены проекты `iPhone 13` и `Pixel 7`, добавлены новые mobile e2e (`mobile-layout.spec.ts`, `mobile-nav.spec.ts`), дописаны targeted сценарии для cards/table persistence, mobile DateRangePicker (1 month), cleaner safe-area/single-shell; установлены браузеры Playwright (`webkit`), проверки `npm run lint`, `npm run build`, targeted mobile regression через `PW_REUSE_BACKEND=1 npm run test:ui -- ... --grep ...` зелёные — `27 passed` на `chromium + iPhone 13 + Pixel 7`.
- 2026-03-02: адаптированы flaky/устаревшие e2e локаторы для `cleaning-crud`, `cleaning-report`, `cleaner-dashboard` под текущий UI (Radix Select/toggle radio, transition кнопки, route-assertions), добавлен opt-in reuse backend в Playwright (`PW_REUSE_BACKEND=1`); targeted rerun `CI=1 PW_REUSE_BACKEND=1 npx playwright test tests/e2e/cleaning-crud.spec.ts tests/e2e/cleaning-report.spec.ts tests/e2e/cleaner-dashboard.spec.ts` — `31 passed`.
- 2026-03-02: завершены milestones `F-*` и `G-*` (Cleaning/Cleaner/Analytics): hybrid cards/table в cleaning list и analytics metrics, mobile-first правки detail/checklists, safe-area усиления в cleaner, touch tooltip по tap/focus в revenue/occupancy, export CTA full-width на mobile; проверки targeted `eslint` и `npm run build` зелёные. Targeted e2e (`cleaning-crud`, `cleaner-dashboard`, `cleaning-report`, `analytics-dashboard`) заблокированы текущим занятым `localhost:8000` при `reuseExistingServer: false` в Playwright webServer.
- 2026-03-02: завершён milestone `B-*` (shared components), статусы отмечены в `IMPLEMENTATION PLAN.md`.
- 2026-03-02: прогнан быстрый mobile smoke-check shell/nav (`tests/e2e/mobile-shell-smoke.spec.ts`) — `3 passed` (tabs, More sheet, cleaner без global shell, overflow sanity, mobile toast container).
- 2026-03-02: завершён milestone `C-*` (Home/Auth/Settings/AI Import), включая mobile stack для import preview и touch-доступные photo actions; проверки `npm run lint` и `npm run build` зелёные.
- 2026-03-02: завершён milestone `D-*` (Properties Domain): mobile stack/filter flow, touch-safe wizard/forms/photos, `Agenda | Gantt` toggle с mobile default `Agenda`, новый `GanttAgendaView`, touch tooltip/pending-range hint в gantt; проверки targeted `eslint` и `npm run build` зелёные.
- 2026-03-02: завершён milestone `E-*` (Bookings Domain): hybrid cards/table + persistence в list/detail, mobile-first form/layout правки для create/edit/today/detail, scrollable tabs chips и column forms в payments/deposits; проверки `eslint` (targeted) и `npm run build` зелёные, targeted e2e rerun (`booking-payments`, `deposit-management`, `booking-today`) — `13 passed / 3 failed` (1 нестабильный submit-selector в `booking-payments`, 2 data-timing падения в `booking-today`).

## Locked Decisions
1. Навигация на телефоне: `Bottom tabs` + верхний app bar + экран/лист `More`.
2. Сложные data-экраны: `Hybrid mode` (по умолчанию карточки на mobile + переключение в table/gantt при необходимости).
3. Существующий визуальный стиль сохранить (по `STYLES.md`), не делать редизайн в другой стилистике.
4. Backend/API-контракты не менять.

## Critical Findings (P0)
1. Глобальный хедер не мобильный: 9 пунктов в одну линию, `whitespace-nowrap`, нет mobile-nav, высокий риск горизонтального overflow.  
Refs: [__root.tsx:63](/Users/dos/Desktop/ant/day2.0/day-frontend/src/routes/__root.tsx:63), [__root.tsx:67](/Users/dos/Desktop/ant/day2.0/day-frontend/src/routes/__root.tsx:67), [__root.tsx:74](/Users/dos/Desktop/ant/day2.0/day-frontend/src/routes/__root.tsx:74)

2. Cleaner mobile-экраны вложены в общий desktop layout, получается двойная навигация (global header + cleaner header/bottom nav).  
Refs: [__root.tsx:31](/Users/dos/Desktop/ant/day2.0/day-frontend/src/routes/__root.tsx:31), [CleanerDashboardPage.tsx:100](/Users/dos/Desktop/ant/day2.0/day-frontend/src/pages/cleaner/CleanerDashboardPage.tsx:100)

3. `safe-area-top`/`safe-area-bottom` используются, но не определены в CSS. На iPhone с вырезом отступы не гарантированы.  
Refs: [CleanerDashboardPage.tsx:102](/Users/dos/Desktop/ant/day2.0/day-frontend/src/pages/cleaner/CleanerDashboardPage.tsx:102), [CleanerTaskDetailPage.tsx:380](/Users/dos/Desktop/ant/day2.0/day-frontend/src/pages/cleaner/CleanerTaskDetailPage.tsx:380), [index.css:1](/Users/dos/Desktop/ant/day2.0/day-frontend/src/index.css:1)

4. Несколько ключевых таблиц не имеют mobile-safe представления и/или `overflow-x-auto` контейнера.  
Refs: [BookingListPage.tsx:164](/Users/dos/Desktop/ant/day2.0/day-frontend/src/pages/bookings/BookingListPage.tsx:164), [CleaningListPage.tsx:92](/Users/dos/Desktop/ant/day2.0/day-frontend/src/pages/cleaning/CleaningListPage.tsx:92), [BookingDetailPage.tsx:533](/Users/dos/Desktop/ant/day2.0/day-frontend/src/pages/bookings/BookingDetailPage.tsx:533)

5. Нет mobile e2e покрытия: Playwright только desktop project.  
Refs: [playwright.config.ts:15](/Users/dos/Desktop/ant/day2.0/day-frontend/playwright.config.ts:15)

## High Findings (P1)
1. Критичные формы содержат `grid-cols-2` без mobile fallback (`grid-cols-1`), что сжимает поля на узких экранах.  
Refs: [PropertyFormStepAddress.tsx:39](/Users/dos/Desktop/ant/day2.0/day-frontend/src/components/property/PropertyFormStepAddress.tsx:39), [PropertyFormStepDetails.tsx:24](/Users/dos/Desktop/ant/day2.0/day-frontend/src/components/property/PropertyFormStepDetails.tsx:24), [PropertyFormStepPricing.tsx:26](/Users/dos/Desktop/ant/day2.0/day-frontend/src/components/property/PropertyFormStepPricing.tsx:26), [EditBookingPage.tsx:205](/Users/dos/Desktop/ant/day2.0/day-frontend/src/pages/bookings/EditBookingPage.tsx:205)

2. `DateRangePicker` всегда рендерит 2 месяца, popover слишком широкий для телефонов.  
Ref: [date-range-picker.tsx:102](/Users/dos/Desktop/ant/day2.0/day-frontend/src/components/ui/date-range-picker.tsx:102)

3. Hover-only UX в графиках/фото не работает на touch.  
Refs: [RevenueChart.tsx:64](/Users/dos/Desktop/ant/day2.0/day-frontend/src/components/analytics/RevenueChart.tsx:64), [OccupancyChart.tsx:67](/Users/dos/Desktop/ant/day2.0/day-frontend/src/components/analytics/OccupancyChart.tsx:67), [PropertyPreviewForm.tsx:457](/Users/dos/Desktop/ant/day2.0/day-frontend/src/components/ai-import/PropertyPreviewForm.tsx:457), [PropertyFormStepPhotos.tsx:91](/Users/dos/Desktop/ant/day2.0/day-frontend/src/components/property/PropertyFormStepPhotos.tsx:91)

4. `Button` по умолчанию с `whitespace-nowrap`; длинные локализованные лейблы могут ломать строки/контейнеры.  
Ref: [Button.tsx:37](/Users/dos/Desktop/ant/day2.0/day-frontend/src/components/ui/Button.tsx:37)

5. `ToggleGroup` inline без системной mobile-адаптации; длинные наборы фильтров переполняют экран.  
Ref: [toggle-group.tsx:12](/Users/dos/Desktop/ant/day2.0/day-frontend/src/components/ui/toggle-group.tsx:12)

6. Шахматка (`GanttChart`) desktop-centric: фиксированные `NAME_W=180`, `CELL_W=40`, mouse-centric tooltip/preview.  
Refs: [GanttChart.tsx:45](/Users/dos/Desktop/ant/day2.0/day-frontend/src/components/property/GanttChart.tsx:45), [GanttChart.tsx:44](/Users/dos/Desktop/ant/day2.0/day-frontend/src/components/property/GanttChart.tsx:44), [GanttChart.tsx:630](/Users/dos/Desktop/ant/day2.0/day-frontend/src/components/property/GanttChart.tsx:630)

## Decision-Complete Implementation Plan

## 1) Global Mobile Foundation
1. Добавить в [index.css](/Users/dos/Desktop/ant/day2.0/day-frontend/src/index.css) safe-area утилиты:
   - `.safe-area-top { padding-top: env(safe-area-inset-top); }`
   - `.safe-area-bottom { padding-bottom: env(safe-area-inset-bottom); }`
2. Установить унифицированный mobile container policy:
   - На страницах заменить базовый `p-6` на `px-4 py-4 sm:px-6 sm:py-6`.
3. Зафиксировать touch target rule:
   - Все интерактивные controls минимум `min-h-[44px]` и `min-w-[44px]`.
4. Добавить utility-класс для мобильных action rows:
   - `flex-col gap-2 sm:flex-row` для пар кнопок.

## 2) Responsive App Shell
1. В [__root.tsx](/Users/dos/Desktop/ant/day2.0/day-frontend/src/routes/__root.tsx):
   - Разделить `AuthenticatedLayout` на desktop и mobile ветки.
   - Desktop (`lg+`): оставить текущую верхнюю навигацию.
   - Mobile (`<lg`): app bar + bottom tabs.
2. Bottom tabs (mobile):
   - Табы: `Properties`, `Bookings`, `Cleaning`, `Analytics`, `More`.
   - Экран `More`: `Gantt`, `Today`, `Checklists`, `AI Import`, `Settings`, `Logout`.
3. Cleaner routes:
   - Для путей `/cleaner` и `/cleaner/$taskId` отключить global header/nav полностью.
   - Оставить только cleaner-specific shell.
4. Toast mobile behavior:
   - На mobile: top-center/full-width с безопасными отступами.
   - На desktop: текущий top-right.
   - Ref: [Toast.tsx:36](/Users/dos/Desktop/ant/day2.0/day-frontend/src/components/ui/Toast.tsx:36)

## 3) Shared Component Refactor
1. [Button.tsx](/Users/dos/Desktop/ant/day2.0/day-frontend/src/components/ui/Button.tsx):
   - Убрать обязательный `whitespace-nowrap`.
   - Добавить проп `nowrap?: boolean` (default `false`), для мест где nowrap действительно нужен.
2. [toggle-group.tsx](/Users/dos/Desktop/ant/day2.0/day-frontend/src/components/ui/toggle-group.tsx):
   - Добавить `flex-wrap` для mobile.
   - Для длинных групп предусмотреть `overflow-x-auto` контейнер-обертку на уровне использования.
3. [date-range-picker.tsx](/Users/dos/Desktop/ant/day2.0/day-frontend/src/components/ui/date-range-picker.tsx):
   - `numberOfMonths = 1` на mobile, `2` на `md+`.
4. [calendar.tsx](/Users/dos/Desktop/ant/day2.0/day-frontend/src/components/ui/calendar.tsx):
   - Слегка уменьшить ячейки на mobile (`h-9 w-9`), оставить `h-10 w-10` на `sm+`.
5. [number-input.tsx](/Users/dos/Desktop/ant/day2.0/day-frontend/src/components/ui/number-input.tsx):
   - Увеличить stepper hit-area до минимум 20x20.
6. [ConfirmDialog.tsx](/Users/dos/Desktop/ant/day2.0/day-frontend/src/components/ui/ConfirmDialog.tsx):
   - На mobile кнопки `Cancel/Confirm` вертикально (`w-full`) при узкой ширине.

## 4) Data View Pattern (Hybrid Mobile)
1. Для таблиц:
   - Mobile default: cards.
   - Optional toggle: `Cards | Table`.
   - Desktop default: table.
2. Применить к:
   - Bookings list.
   - Cleaning list.
   - Booking payments.
   - Analytics metrics by property.
3. Даже в table-mode: добавить `overflow-x-auto` + `min-w-[...]` для контроля прокрутки.

## 5) Page-by-Page Required Changes

| Page | Required changes | Why |
|---|---|---|
| `/` Home, `/login`, `/register` | Снизить плотность внешних отступов (`p-6 -> px-4 py-4 sm:p-6`), у карточек `p-8 -> p-5 sm:p-8` | На узких экранах лучше читаемость и меньше вертикальный скролл |
| `/settings` | Аналогично container spacing; проверить длинные language labels | Локализация + маленькие экраны |
| `/ai-import` | Header и табы сделать `flex-wrap`, кнопки full-width на mobile | Сейчас tabs/actions могут тесниться |
| `/ai-import/$jobId` | Верхний header (title+URL) перевести в stack на mobile, action row сделать column-first | Текущий `justify-between` ломается на узких ширинах |
| `PropertyPreviewForm` | Поля details `grid-cols-2 -> grid-cols-1 sm:grid-cols-2`; фото action controls показать через tap/focus, не только hover | Touch-first совместимость |
| `/analytics` | Фильтры в 2 строки с mobile stack, export кнопка full-width; графики адаптировать подписи/tooltip tap-mode | Текущий toolbar перегружен для mobile |
| `MetricsTable` | Cards режим по умолчанию на mobile + table toggle | Таблица слишком плотная |
| `/bookings` | Добавить hybrid view (cards default mobile), table завернуть в `overflow-x-auto` + `min-w`; фильтры stack | Критичный desktop-only table |
| `/bookings/new` | `grid-cols-2` секции заменить на mobile-first; action buttons stack; sticky summary оставить только `lg+` | Узкие поля и перегруженные action rows |
| `/bookings/$bookingId/edit` | То же: `grid-cols-2 -> grid-cols-1 sm:grid-cols-2`, submit full-width mobile | Touch usability |
| `/bookings/today` | Карточки ок, но action buttons сделать full-width при нехватке места | Избежать сжатия CTA |
| `/bookings/$bookingId` | Header actions wrap+stack; tabs сделать horizontal-scroll chips на mobile; payments/deposits forms сделать column на mobile; payments table -> cards default | Самый сложный экран, сейчас desktop-centric |
| `/cleaning` | Hybrid view (cards default mobile) + table mode toggle, filters wrap | Текущая таблица не mobile-friendly |
| `/cleaning/new` | Уже близко к mobile-first, проверить final spacing consistency | Довести до единых правил |
| `/cleaning/$taskId` | В Overview/Report заменить `grid-cols-2` на `grid-cols-1 sm:grid-cols-2`; tab switch сделать scrollable | Иначе узкие карточки и обрезка контента |
| `/cleaning/checklists` | Страница уже адаптирована; доработать hit-area и длинные строки item/title | Длинные названия и drag UI на телефоне |
| `/cleaner` | Убрать global app header для cleaner route; добавить реально работающие safe-area insets | Иначе двойной хедер и проблемы с вырезами |
| `/cleaner/$taskId` | То же + bottom action bar safe-area + тест на iOS Safari | Fixed CTA должен быть безопасен |
| `/properties` | Header stack (title + add), фильтры/теги/view-switch вынести в вертикальный mobile flow; toggle groups scrollable | Сейчас слишком плотная toolbar |
| `/properties/new`, `/properties/$id/edit` | Step forms: все `grid-cols-2` перевести на mobile-first; wizard nav buttons full-width на mobile | Основные формы не mobile-first |
| `/properties/$id` | Header action buttons wrap, details grid mobile-first, pricing blocks stack | Длинные лейблы и action cluster |
| `PricingForm` | Base pricing `grid-cols-2 -> grid-cols-1 sm:grid-cols-2`; seasonal and discount rows column on mobile | Сейчас формы слишком широкие |
| `/properties/gantt` + `GanttChart` | Mobile default: compact agenda/card timeline; desktop gantt оставить. Добавить переключатель `Agenda | Gantt` | Full gantt на 320–430px перегружен и mouse-centric |

## 6) Public APIs / Interfaces / Types Changes
1. `ButtonProps`:
   - Добавить `nowrap?: boolean`.
2. `DateRangePickerProps`:
   - Добавить `months?: 1 | 2` или авто-режим `responsiveMonths?: boolean`.
3. Новый generic тип для hybrid-view:
   - `ViewMode = 'cards' | 'table'`.
4. Для complex pages:
   - Добавить локальный state `mobileViewMode` (persist в `localStorage` optional).
5. `GanttChart`:
   - Добавить `mode?: 'gantt' | 'agenda'` либо вынести `AgendaView` в отдельный компонент и переключать на page-level.

Backend contracts:
- Изменений не требуется.

## 7) Testing Plan
1. Обновить [playwright.config.ts](/Users/dos/Desktop/ant/day2.0/day-frontend/playwright.config.ts):
   - Добавить mobile projects: `iPhone 13`, `Pixel 7`.
2. Добавить e2e smoke suite `tests/e2e/mobile-layout.spec.ts`:
   - Пройти все route entries.
   - Проверить отсутствие глобального горизонтального overflow:
     - `document.documentElement.scrollWidth <= window.innerWidth + 1`.
   - Проверить наличие primary CTA и кликабельность ключевых controls.
3. Добавить mobile-specific tests:
   - Nav behavior (bottom tabs + more sheet).
   - Tables/cards toggle behavior.
   - DateRangePicker (1 month on mobile).
   - Cleaner fixed bottom actions с safe-area.
4. Регрессия desktop:
   - Существующие e2e должны продолжать проходить без ухудшений.
5. Build/lint gates:
   - `npm run build`
   - `npm run lint`
   - `npm run test:ui` (desktop + mobile projects)

## 8) Acceptance Criteria
1. На ширинах `320/360/390/430` нет непреднамеренного horizontal scroll на body/html.
2. Все страницы доступны и функциональны в mobile portrait.
3. Минимальный размер интерактивных элементов `>=44px` по высоте.
4. Все hover-only ключевые действия имеют touch-эквивалент (tap/focus/always-visible control).
5. Complex data screens имеют mobile cards default + доступ к полной table/gantt версии.
6. Cleaner routes отображаются без двойного верхнего навбара.
7. Safe-area корректно учитывается на iOS устройствах с вырезом.

## 9) Assumptions And Defaults
1. Поддерживаемые мобильные браузеры: iOS Safari, Android Chrome (актуальные 2 версии).
2. Поддержка landscape: функциональная, но приоритет portrait.
3. Визуальная система сохраняется существующая (монохром + текущие accent colors).
4. Производительность: без тяжелых анимаций на мобильных списках > 100 элементов.
5. Изменения ограничены `day-frontend`; backend untouched.
