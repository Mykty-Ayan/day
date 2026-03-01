# Implementation Plan: Mobile-First Remediation For `day-frontend`

## Summary
Цель: полностью реализовать mobile-first изменения из `PLAN.md` без изменения backend/API, с поэтапной структурой для безопасного продолжения из нового чата.

Подход: сначала глобальный shell + shared UI, затем page-by-page адаптация, затем mobile e2e и регрессия desktop.

Граница работ: только фронтенд в `/Users/dos/Desktop/ant/day2.0/day-frontend`.

## Public APIs / Interfaces / Types (что меняем)
1. `ButtonProps`: добавить `nowrap?: boolean` (default `false`) в [Button.tsx](/Users/dos/Desktop/ant/day2.0/day-frontend/src/components/ui/Button.tsx).
2. `DateRangePickerProps`: добавить `responsiveMonths?: boolean` (default `true`) и `months?: 1 | 2` (приоритет у `months`) в [date-range-picker.tsx](/Users/dos/Desktop/ant/day2.0/day-frontend/src/components/ui/date-range-picker.tsx).
3. Ввести общий тип `ViewMode = 'cards' | 'table'` в новом файле `/Users/dos/Desktop/ant/day2.0/day-frontend/src/types/view-mode.ts` и использовать на data-экранах.
4. `GanttChartProps`: добавить `mode?: 'gantt' | 'agenda'` в [GanttChart.tsx](/Users/dos/Desktop/ant/day2.0/day-frontend/src/components/property/GanttChart.tsx).
5. Добавить i18n-ключи для mobile shell (`more`, подписи меню/действий) в [translation.json (en)](/Users/dos/Desktop/ant/day2.0/day-frontend/src/locales/en/translation.json), [translation.json (ru)](/Users/dos/Desktop/ant/day2.0/day-frontend/src/locales/ru/translation.json), [translation.json (kz)](/Users/dos/Desktop/ant/day2.0/day-frontend/src/locales/kz/translation.json).

## Полный список задач (execution backlog)

### Milestone A: Foundation + App Shell
1. `[x] A-01` Добавить safe-area utility classes в [index.css](/Users/dos/Desktop/ant/day2.0/day-frontend/src/index.css). DoD: `.safe-area-top` и `.safe-area-bottom` используют `env(safe-area-inset-*)`.
2. `[x] A-02` Внедрить унифицированный mobile spacing policy (`px-4 py-4 sm:px-6 sm:py-6`) как стандарт контейнера во всех page-layout файлах. DoD: удалены “desktop-only” базовые `p-6/p-8` без mobile fallback.
3. `[x] A-03` Перестроить root shell в [__root.tsx](/Users/dos/Desktop/ant/day2.0/day-frontend/src/routes/__root.tsx): desktop-nav только для `lg+`, mobile app bar + bottom tabs для `<lg`. DoD: 9-пунктовый header больше не рендерится на mobile.
4. `[x] A-04` Реализовать mobile bottom tabs + More sheet (не отдельный route, а sheet/overlay) в новом файле `/Users/dos/Desktop/ant/day2.0/day-frontend/src/components/layout/MobileShell.tsx` и подключить в [__root.tsx](/Users/dos/Desktop/ant/day2.0/day-frontend/src/routes/__root.tsx). DoD: tabs `Properties/Bookings/Cleaning/Analytics/More`, в `More` есть `Gantt/Today/Checklists/AI Import/Settings/Logout`.
5. `[x] A-05` Для `/cleaner` и `/cleaner/$taskId` отключить global shell в [__root.tsx](/Users/dos/Desktop/ant/day2.0/day-frontend/src/routes/__root.tsx). DoD: нет двойной навигации.
6. `[x] A-06` Обновить mobile поведение toast в [Toast.tsx](/Users/dos/Desktop/ant/day2.0/day-frontend/src/components/ui/Toast.tsx). DoD: mobile top-center/full-width + safe-area, desktop top-right как сейчас.

### Milestone B: Shared Components
7. `[x] B-01` Обновить [Button.tsx](/Users/dos/Desktop/ant/day2.0/day-frontend/src/components/ui/Button.tsx): убрать обязательный `whitespace-nowrap`, добавить `nowrap` prop. DoD: длинные label не ломают layout по умолчанию.
8. `[x] B-02` Обновить [toggle-group.tsx](/Users/dos/Desktop/ant/day2.0/day-frontend/src/components/ui/toggle-group.tsx): mobile `flex-wrap` + поддержка `overflow-x-auto` у контейнера использования. DoD: длинные фильтры не выходят за viewport.
9. `[x] B-03` Обновить [date-range-picker.tsx](/Users/dos/Desktop/ant/day2.0/day-frontend/src/components/ui/date-range-picker.tsx): 1 месяц на mobile, 2 на `md+`, плюс новые props. DoD: popover помещается на 320–430px.
10. `[x] B-04` Обновить [calendar.tsx](/Users/dos/Desktop/ant/day2.0/day-frontend/src/components/ui/calendar.tsx): `h-9 w-9` на mobile, `h-10 w-10` на `sm+`. DoD: календарь без горизонтального переполнения.
11. `[x] B-05` Обновить [number-input.tsx](/Users/dos/Desktop/ant/day2.0/day-frontend/src/components/ui/number-input.tsx): увеличить hit-area stepper-кнопок до минимум 20x20 (лучше 24x24). DoD: уверенный tap на телефонах.
12. `[x] B-06` Обновить [ConfirmDialog.tsx](/Users/dos/Desktop/ant/day2.0/day-frontend/src/components/ui/ConfirmDialog.tsx): кнопки вертикально и `w-full` на узких экранах. DoD: нет сжатия action row.
13. `[x] B-07` Ввести правило touch target `>=44px` для ключевых интерактивов во всех shared/UI компонентах (`Button`, табы, filter chips, icon-buttons). DoD: выборочные DOM-проверки показывают min height/width >= 44.

### Milestone C: Base Pages (Home/Auth/Settings/AI Import)
14. `C-01` Уплотнить spacing на [HomePage.tsx](/Users/dos/Desktop/ant/day2.0/day-frontend/src/pages/HomePage.tsx), [LoginPage.tsx](/Users/dos/Desktop/ant/day2.0/day-frontend/src/pages/LoginPage.tsx), [RegisterPage.tsx](/Users/dos/Desktop/ant/day2.0/day-frontend/src/pages/RegisterPage.tsx). DoD: mobile-friendly paddings.
15. `C-02` Обновить [SettingsPage.tsx](/Users/dos/Desktop/ant/day2.0/day-frontend/src/pages/settings/SettingsPage.tsx): spacing + проверка длинных language labels. DoD: labels не ломают строки.
16. `C-03` Обновить [AIImportPage.tsx](/Users/dos/Desktop/ant/day2.0/day-frontend/src/pages/ai-import/AIImportPage.tsx): header/tabs `flex-wrap`, primary actions full-width на mobile. DoD: toolbar не переполняется.
17. `C-04` Обновить [ImportPreviewPage.tsx](/Users/dos/Desktop/ant/day2.0/day-frontend/src/pages/ai-import/ImportPreviewPage.tsx): header stack на mobile, action row column-first. DoD: нет `justify-between` коллизий.
18. `C-05` Обновить [PropertyPreviewForm.tsx](/Users/dos/Desktop/ant/day2.0/day-frontend/src/components/ai-import/PropertyPreviewForm.tsx): `grid-cols-1 sm:grid-cols-2`, убрать hover-only действия на фото (tap/focus/always-visible). DoD: все фото-действия доступны touch.

### Milestone D: Properties Domain
19. `D-01` Обновить [PropertyListPage.tsx](/Users/dos/Desktop/ant/day2.0/day-frontend/src/pages/properties/PropertyListPage.tsx): header stack, filters/tags/view-switch в vertical mobile flow. DoD: нет горизонтального скролла.
20. `D-02` Привести toggle/filters в property flow к mobile-safe контейнерам в [TagSelector.tsx](/Users/dos/Desktop/ant/day2.0/day-frontend/src/components/property/TagSelector.tsx) и [toggle-group.tsx](/Users/dos/Desktop/ant/day2.0/day-frontend/src/components/ui/toggle-group.tsx) местах использования. DoD: длинные наборы прокручиваются/переносятся.
21. `D-03` Обновить формы шагов property wizard: [PropertyFormStepAddress.tsx](/Users/dos/Desktop/ant/day2.0/day-frontend/src/components/property/PropertyFormStepAddress.tsx), [PropertyFormStepDetails.tsx](/Users/dos/Desktop/ant/day2.0/day-frontend/src/components/property/PropertyFormStepDetails.tsx), [PropertyFormStepPricing.tsx](/Users/dos/Desktop/ant/day2.0/day-frontend/src/components/property/PropertyFormStepPricing.tsx). DoD: все `grid-cols-2` имеют mobile fallback.
22. `D-04` Обновить wizard pages [CreatePropertyPage.tsx](/Users/dos/Desktop/ant/day2.0/day-frontend/src/pages/properties/CreatePropertyPage.tsx) и [EditPropertyPage.tsx](/Users/dos/Desktop/ant/day2.0/day-frontend/src/pages/properties/EditPropertyPage.tsx): nav buttons full-width на mobile. DoD: CTA не сжимаются.
23. `D-05` Обновить [PropertyDetailPage.tsx](/Users/dos/Desktop/ant/day2.0/day-frontend/src/pages/properties/PropertyDetailPage.tsx): header actions wrap, details/pricing blocks stack. DoD: long labels помещаются.
24. `D-06` Обновить [PricingForm.tsx](/Users/dos/Desktop/ant/day2.0/day-frontend/src/components/property/PricingForm.tsx): `grid-cols-1 sm:grid-cols-2`, discount/seasonal rows column на mobile. DoD: форма читаема на 320px.
25. `D-07` Обновить [PropertyFormStepPhotos.tsx](/Users/dos/Desktop/ant/day2.0/day-frontend/src/components/property/PropertyFormStepPhotos.tsx): touch-equivalent для hover-only controls. DoD: действия доступны без hover.
26. `D-08` Добавить режимы `Agenda | Gantt` на [GanttChartPage.tsx](/Users/dos/Desktop/ant/day2.0/day-frontend/src/pages/properties/GanttChartPage.tsx). DoD: mobile default = `Agenda`.
27. `D-09` Обновить [GanttChart.tsx](/Users/dos/Desktop/ant/day2.0/day-frontend/src/components/property/GanttChart.tsx): mode prop + touch-friendly tooltip/preview поведение. DoD: на mobile нет зависимости от hover/mouse.
28. `D-10` Создать компонент agenda-представления `/Users/dos/Desktop/ant/day2.0/day-frontend/src/components/property/GanttAgendaView.tsx`. DoD: функциональный паритет ключевых данных с gantt.

### Milestone E: Bookings Domain
29. `E-01` В [BookingListPage.tsx](/Users/dos/Desktop/ant/day2.0/day-frontend/src/pages/bookings/BookingListPage.tsx) реализовать hybrid view (mobile cards default, optional table toggle) + `overflow-x-auto` для table-mode. DoD: список usable на 320px.
30. `E-02` Обновить [CreateBookingPage.tsx](/Users/dos/Desktop/ant/day2.0/day-frontend/src/pages/bookings/CreateBookingPage.tsx): mobile-first grids, action buttons stack, sticky summary только `lg+`. DoD: поля не сжаты.
31. `E-03` Обновить [EditBookingPage.tsx](/Users/dos/Desktop/ant/day2.0/day-frontend/src/pages/bookings/EditBookingPage.tsx): `grid-cols-1 sm:grid-cols-2`, submit full-width mobile. DoD: touch-friendly редактирование.
32. `E-04` Обновить [TodayPage.tsx](/Users/dos/Desktop/ant/day2.0/day-frontend/src/pages/bookings/TodayPage.tsx): action buttons full-width при узкой ширине. DoD: нет поломки CTA.
33. `E-05` Обновить [BookingDetailPage.tsx](/Users/dos/Desktop/ant/day2.0/day-frontend/src/pages/bookings/BookingDetailPage.tsx): header actions wrap, tabs = horizontal-scroll chips на mobile. DoD: tabs не обрезаются.
34. `E-06` В [BookingDetailPage.tsx](/Users/dos/Desktop/ant/day2.0/day-frontend/src/pages/bookings/BookingDetailPage.tsx) перевести payments/deposits forms на column layout на mobile. DoD: ввод без горизонтальной прокрутки.
35. `E-07` В [BookingDetailPage.tsx](/Users/dos/Desktop/ant/day2.0/day-frontend/src/pages/bookings/BookingDetailPage.tsx) добавить cards default для payments/deposits list (table optional). DoD: mobile-first представление данных.
36. `E-08` Добавить persistence view-mode в `localStorage` для bookings экранов в [BookingListPage.tsx](/Users/dos/Desktop/ant/day2.0/day-frontend/src/pages/bookings/BookingListPage.tsx) и [BookingDetailPage.tsx](/Users/dos/Desktop/ant/day2.0/day-frontend/src/pages/bookings/BookingDetailPage.tsx). DoD: режим сохраняется после reload.

### Milestone F: Cleaning + Cleaner Domain
37. `F-01` В [CleaningListPage.tsx](/Users/dos/Desktop/ant/day2.0/day-frontend/src/pages/cleaning/CleaningListPage.tsx) реализовать hybrid view + filter wrap + table overflow fallback. DoD: desktop table сохраняется, mobile cards по умолчанию.
38. `F-02` В [CreateCleaningTaskPage.tsx](/Users/dos/Desktop/ant/day2.0/day-frontend/src/pages/cleaning/CreateCleaningTaskPage.tsx) привести spacing к общей mobile policy. DoD: визуальная консистентность.
39. `F-03` В [CleaningDetailPage.tsx](/Users/dos/Desktop/ant/day2.0/day-frontend/src/pages/cleaning/CleaningDetailPage.tsx) заменить `grid-cols-2` на mobile-first и сделать scrollable tab switch. DoD: контент не обрезается.
40. `F-04` В [ChecklistTemplatesPage.tsx](/Users/dos/Desktop/ant/day2.0/day-frontend/src/pages/cleaning/ChecklistTemplatesPage.tsx) увеличить hit-area + обработать длинные строки названий. DoD: без layout-jump и недоступных tap zones.
41. `F-05` Обновить [CleanerDashboardPage.tsx](/Users/dos/Desktop/ant/day2.0/day-frontend/src/pages/cleaner/CleanerDashboardPage.tsx): корректный safe-area top/bottom, без global header. DoD: single-shell.
42. `F-06` Обновить [CleanerTaskDetailPage.tsx](/Users/dos/Desktop/ant/day2.0/day-frontend/src/pages/cleaner/CleanerTaskDetailPage.tsx): fixed bottom action bar + safe-area bottom, touch-safe CTA. DoD: CTA не перекрывается iOS home-indicator.

### Milestone G: Analytics Domain
43. `G-01` Обновить [AnalyticsDashboardPage.tsx](/Users/dos/Desktop/ant/day2.0/day-frontend/src/pages/analytics/AnalyticsDashboardPage.tsx): filters stack в 2 строки, export CTA full-width на mobile. DoD: toolbar не переполняется.
44. `G-02` Обновить [RevenueChart.tsx](/Users/dos/Desktop/ant/day2.0/day-frontend/src/components/analytics/RevenueChart.tsx) и [OccupancyChart.tsx](/Users/dos/Desktop/ant/day2.0/day-frontend/src/components/analytics/OccupancyChart.tsx): touch tooltip/labels режим. DoD: данные доступны tap-жестом.
45. `G-03` В [MetricsTable.tsx](/Users/dos/Desktop/ant/day2.0/day-frontend/src/components/analytics/MetricsTable.tsx) добавить cards default на mobile + table toggle. DoD: мобильное чтение метрик без zoom.

### Milestone H: QA Automation + Regression Gates
46. `H-01` Обновить [playwright.config.ts](/Users/dos/Desktop/ant/day2.0/day-frontend/playwright.config.ts): проекты `iPhone 13`, `Pixel 7` + сохранить desktop chromium. DoD: все 3 проекта запускаются.
47. `H-02` Создать `mobile smoke` файл `/Users/dos/Desktop/ant/day2.0/day-frontend/tests/e2e/mobile-layout.spec.ts`. DoD: проверяет ключевые route entries и отсутствие horizontal overflow.
48. `H-03` Добавить e2e-сценарии для mobile nav + More sheet в `/Users/dos/Desktop/ant/day2.0/day-frontend/tests/e2e/navigation.spec.ts` или отдельный `mobile-nav.spec.ts`. DoD: переходы по tabs и действия из More стабильны.
49. `H-04` Добавить e2e на cards/table toggle для bookings/cleaning/analytics в соответствующие spec-файлы `/Users/dos/Desktop/ant/day2.0/day-frontend/tests/e2e/*.spec.ts`. DoD: режимы переключаются и сохраняются.
50. `H-05` Добавить e2e для DateRangePicker mobile-month behavior в `/Users/dos/Desktop/ant/day2.0/day-frontend/tests/e2e/booking-crud.spec.ts` или отдельный `mobile-date-picker.spec.ts`. DoD: на mobile один месяц.
51. `H-06` Добавить e2e на cleaner safe-area и отсутствие двойного хедера в `/Users/dos/Desktop/ant/day2.0/day-frontend/tests/e2e/cleaner-dashboard.spec.ts` и `/Users/dos/Desktop/ant/day2.0/day-frontend/tests/e2e/cleaning-report.spec.ts`. DoD: fixed actions не перекрыты.
52. `H-07` Прогнать regression gates: `npm run lint`, `npm run build`, `npm run test:ui`. DoD: green на desktop+mobile проектах.

## Test Cases And Scenarios (обязательный минимум)
1. Width matrix: 320/360/390/430 px, portrait, без horizontal overflow (`scrollWidth <= innerWidth + 1`).
2. Shell matrix: mobile tabs отображаются на `<lg`, desktop header на `lg+`, cleaner routes без global shell.
3. Hybrid views: cards default на mobile для bookings/cleaning/metrics/payments, table-mode доступен и работает.
4. Date controls: DateRangePicker показывает 1 месяц на mobile и 2 на desktop.
5. Touch parity: все критичные hover-only действия имеют tap/focus эквивалент.
6. Safe-area: iOS Safari (notch) корректно учитывает top/bottom insets в cleaner и toast.
7. Desktop regression: текущие e2e-флоу не деградируют после mobile-first изменений.

## Assumptions And Defaults (зафиксировано)
1. Backend/API не меняются; работаем только во фронтенде.
2. Breakpoints: mobile shell `<lg`, desktop shell `lg+`.
3. `More` реализуется как sheet/overlay в shell, не как новый route.
4. View-mode persistence включена по умолчанию через `localStorage`.
5. Mobile browsers scope: последние 2 версии iOS Safari и Android Chrome.
6. Landscape поддерживается функционально, но acceptance приоритезирует portrait.
7. Визуальная система из [STYLES.md](/Users/dos/Desktop/ant/day2.0/STYLES.md) сохраняется, редизайн не делаем.

## Checkpoints For Continuation (для нового чата)
1. Checkpoint 1: завершены `A-*` и `B-*`.
2. Checkpoint 2: завершены `C-*` и `D-*`.
3. Checkpoint 3: завершены `E-*` и `F-*`.
4. Checkpoint 4: завершены `G-*` и `H-*`, regression green.
