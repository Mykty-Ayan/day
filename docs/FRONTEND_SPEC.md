# Day PMS — Спецификация для пересборки фронтенда с нуля

Функциональная карта приложения + контракты подключения. Без описания текущего дизайна — только «что должно быть и как подключается». Источник истины по контрактам — OpenAPI бэкенда: `GET /api/v1/openapi.json` (прод: `https://api.daiynsolutions.com/openapi.json`).

---

## 1. Система в двух словах

Мультитенантный SaaS для управления краткосрочной арендой. Тенант = компания (`company_id` зашит в JWT, фронт его никогда не передаёт руками). Пользователи компании имеют роли; роль определяет видимые разделы и доступные действия. Основные домены: объекты (квартиры), брони (посуточные и почасовые), шахматка-календарь, уборки с чек-листами и отчётами, аналитика, AI-импорт объявлений, мессенджеры (Telegram/WhatsApp боты), channel manager (Channex), настройки/команда/API-ключи. Плюс Telegram Mini App — отдельный облегчённый клиент.

## 2. Подключение к API

### 2.1 База

| Параметр | Значение |
|---|---|
| Base URL | `{VITE_API_URL}/api/v1` |
| Прод API | `https://api.daiynsolutions.com/api/v1` |
| Локально | `http://localhost:8000/api/v1` |
| Формат | JSON; файлы — `multipart/form-data` |
| Даты | ISO 8601; брони — `date-time` (посуточные приходят с 14:00/12:00), календарные фильтры — `date` |
| Деньги | строки `"45000.00"` в ответах; в запросах число или строка |

Env-переменные фронта:

```
VITE_API_URL=http://localhost:8000/api/v1   # база API клиента (прод: https://api.daiynsolutions.com/api/v1)
VITE_API_PROXY_TARGET=                      # только dev: цель vite-proxy для /api
PORT=                                       # только прод-serve статики
```

### 2.2 Аутентификация

JWT access + refresh. Email-подтверждений нет, OTP нет.

| Действие | Endpoint | Вход | Выход |
|---|---|---|---|
| Регистрация компании | `POST /auth/register` | `{email, password, company_name}` | `TokenResponse` |
| Логин | `POST /auth/login` | `{email, password}` | `TokenResponse` |
| Обновление | `POST /auth/refresh` | `{refresh_token}` | `TokenResponse` (новая пара) |
| Текущий юзер | `GET /auth/me` | — | `UserResponse` |
| TMA-вход | `POST /auth/telegram-miniapp` | `{init_data}` (сырой initData из Telegram) | `TokenResponse` |

`TokenResponse = {access_token, refresh_token, token_type}`.

Правила клиента:
- Заголовок `Authorization: Bearer <access_token>` на каждый запрос.
- 401 → одна попытка `/auth/refresh` → повтор запроса; refresh тоже 401 → разлогин и редирект на логин. Не устраивать параллельные refresh (single-flight).
- Access живёт 30 мин (прод может отличаться) — политика: refresh по 401, не по таймеру.
- Хранение токенов: ключи localStorage `access_token` / `refresh_token` (те же ключи использует TMA-вход — сохранить имена при пересборке, иначе Mini App отвалится). Root-guard: нет `access_token` и путь не публичный (`/login`, `/register`, `/tma`) → redirect на логин.
- Сервисные интеграции (не браузер) ходят с `X-API-Key` — фронту не нужно, но не удалять заголовок из CORS.

### 2.3 Формат ошибок

- `4xx/5xx` → `{"detail": "текст"}` — показывать текст.
- `422` → `{"detail": [{loc, msg, type}]}` (FastAPI validation) — маппить на поля форм по `loc` (`["body", "field_name"]`).
- `429` — rate limit (только на мутации; OPTIONS и вебхуки исключены) — показать «слишком часто, повторите».

### 2.4 Пагинация и фильтры

Два стиля (исторически):
- **page-style**: `?page=1&per_page=20` → `{items, total, page, per_page, pages}` — bookings, properties, cleaning, ai-import.
- **offset-style**: `?offset=0&limit=50` → `{items, total, offset, limit}` — guests, audit-логи, рейтинги.

Фильтры — обычные query-параметры, перечислены в §5 по разделам. Сортировка серверная фиксированная (параметров нет).

## 3. Роли и доступ (RBAC)

Роль приходит в `UserResponse.role` из `GET /auth/me`. Права вычисляются на фронте по этой карте (сервер дублирует проверки — UI прячет, сервер отказывает):

| Право | owner | manager | cleaner |
|---|---|---|---|
| properties:read | ✅ | ✅ | ✅ (адрес/инструкции для уборки) |
| properties:write | ✅ | ✅ | — |
| bookings:read / write | ✅ | ✅ | — |
| cleaning:read | ✅ | ✅ | ✅ (только свои задачи) |
| cleaning:write | ✅ | ✅ | — (только свой отчёт) |
| analytics:read | ✅ | ✅ | — |
| settings:read | ✅ | ✅ | — |
| settings:write | ✅ | — | — |
| users:manage | ✅ | — | — |
| api_keys:manage | ✅ | — | — |
| ai_import:write | ✅ | ✅ | — |
| messaging:send (каналы) | ✅ | ✅ | — |

Следствия для навигации:
- **cleaner** видит только свой рабочий экран уборок (список назначенных задач + отчёт). Всё остальное скрыто.
- **manager** — всё, кроме «Команда», «API-ключи» и записи в настройки компании.
- **owner** — всё.

## 4. Справочники (enums)

Использовать эти значения буквально; человекочитаемые подписи — через i18n.

```
UserRole:        owner | manager | cleaner
PropertyType:    apartment | house | room
PropertyStatus:  new | active | paused | archived
RentalMode:      daily | hourly | both          # у объекта и у брони; бронь ⊆ объект
BookingStatus:   pending → confirmed → checked_in → checked_out → completed; cancelled из pending/confirmed
BookingSource:   direct | booking | airbnb | other
PaymentType:     payment | refund
PaymentMethod:   cash | card | transfer
PaymentStatus:   pending | completed | failed
DepositStatus:   pending → paid → returned|held|partially_held
CleaningType:    post_checkout | mid_stay | on_demand
CleaningStatus:  pending → assigned → in_progress → done → verified
ReportStatus:    submitted | approved | rejected
RoomType(фото):  bathroom | kitchen | bedroom | other
AmenityCategory: bathroom|kitchen|entertainment|safety|comfort|outdoor|accessibility|other
ImportJobStatus: pending | processing | completed | failed
ImportSource:    booking | airbnb | krisha | text | other
Currency:        KZT | USD | EUR | RUB
Language:        ru | kz | en
Granularity:     day | week | month
PeriodPreset:    week | month | quarter | year | custom
Channel:         telegram | whatsapp
Channex sync_state: pending | active | error
```

Переходы статусов валидируются сервером — UI показывает только допустимые действия (карта переходов выше).

---

## 5. Разделы приложения

Каждый раздел: назначение → подразделы/экраны → действия → эндпоинты. Названия разделов = ключи навигации (i18n-подписи сверху).

### 5.1 Объекты (properties)

Каталог квартир компании.

**Экраны:**
1. **Список** — карточки/таблица: имя, внутреннее имя, тип, статус, фото-обложка, цена. Фильтры: `status`, `search`; пагинация page-style. `GET /properties`.
2. **Карточка объекта** (`/properties/{id}`) — `GET /properties/{property_id}` → `PropertyDetailResponse` (включает `photos[]`, `amenities[]`, `pricing`). Вкладки/блоки:
   - **Детали**: все поля `PropertyCreate` (см. §6.1) — название, внутреннее имя, тип, режим аренды, описание, адрес (address_full + apartment_number/entrance/block/floor + lat/lng), комнаты/кровати/площади, инструкции заезда/выезда, правила дома. `PATCH /properties/{id}`.
   - **Фото**: `POST .../photos` принимает **JSON** `{url, sort_order, is_cover}` — готовый URL, не файл (⚠️ см. §11.1: эндпоинта загрузки файла фото сейчас нет). Удалить — `DELETE .../photos/{photo_id}`; reorder — `PUT .../photos/reorder` `{photo_ids:[...]}` (порядок массива = порядок показа, первый = обложка).
   - **Удобства**: мультивыбор из справочника `GET /amenities` (глобальный + `POST /amenities` создать своё) → `POST .../amenities` `{amenity_ids}` (полная замена набора; отдельного DELETE на одно удобство нет — слать новый полный список).
   - **Цены**: `GET/PUT .../pricing` — base_price, hourly_price, weekend_markup, default_deposit, extra_adult_price/extra_child_price, base_guests. Сезонные цены: список/добавить/удалить `.../pricing/seasonal` (`{name, start_date, end_date, price_per_night}`). Скидки за длительность: `.../pricing/discounts` (`{min_nights, discount_percent | discount_fixed}`).
   - **Теги**: `GET /tags` справочник компании (создание/правка/удаление там же), назначение — по одному: `POST .../tags` `{tag_id}`, снятие — `DELETE .../tags/{tag_id}` (эндпоинта «заменить весь набор» нет — старый фронт зовёт `PUT .../tags {tag_ids}`, это битый вызов, см. §11). Массовое обновление цены по тегу: `POST /tags/{tag_id}/batch-pricing` `{base_price}`.
   - **Статус**: `POST .../status` `{target_status}` (new→active→paused→archived; UI показывает допустимые).
   - **Клонировать**: `POST .../clone` — копия объекта.
   - **История изменений**: `GET .../audit-log` (offset-style).
   - **Каналы (Channex)** — см. §5.9.
3. **Создание** — `POST /properties`, минимум `{name, internal_name, type}`; дальше wizard-ом или сразу карточка.

### 5.2 Шахматка (gantt / календарь занятости)

Главный операционный экран: строки = объекты, столбцы = дни, бары = брони.

- Данные: `GET /gantt?start_date&end_date` → `GanttDataResponse{properties:[{id, name, internal_name, type, status, bookings:[{id, guest_name, check_in, check_out, rental_mode, status, source, gantt_color, gantt_icon, adults/children, total_price}]}]}`. Одним запросом на видимый диапазон.
- Действия: клик по пустой ячейке → создание брони с предзаполненными объектом/датой; клик по бару → карточка брони; перенос брони на другой объект → `POST /bookings/{id}/move` `{target_property_id}`; изменение дат — `PATCH /bookings/{id}`.
- Почасовые брони: у `both`/`hourly` объектов бар может занимать часть дня (check_in/check_out с временем) — рендер суб-суточный.
- Цвет/иконка бара: `gantt_color` (hex, задаётся в брони), `gantt_icon` опционально.

### 5.3 Бронирования (bookings)

1. **Список** — фильтры: `status, property_id, source, search (имя/телефон гостя), date_from, date_to`; page-style. `GET /bookings`.
2. **Создание** — форма:
   - объект (выбор из активных), гость (имя обязательно, телефон/email; автопоиск существующего гостя по телефону делает сервер), даты `check_in/check_out` (посуточно — даты, время подставится 14:00/12:00; почасово — с временем), режим `rental_mode` (виден только если объект `both`/`hourly`), гости adults/children, источник, цвет для шахматки, заметки.
   - **Пересчёт цены на лету**: `POST /bookings/calculate-price` → `PriceCalculateResponse{nights, hours, unit_label, base_total, weekend_surcharge, seasonal_adjustment, extra_guest_surcharge, discount_amount, total}` — показывать разбивку.
   - Сабмит `POST /bookings`. Ошибки: пересечение дат, неактивный объект, режим не разрешён — приходят текстом в `detail`.
3. **Карточка брони** — `GET /bookings/{id}` → `BookingDetailResponse` (booking + guest + payments + deposits + files + comments + audit_logs). Блоки:
   - **Статус**: `POST .../status` `{target_status}` по карте переходов; отмена = `cancelled`.
   - **Платежи**: список + `POST .../payments` `{amount, type(payment|refund), method, note}`. Показывать сумму оплачено vs total_price.
   - **Депозиты**: `POST .../deposits` `{amount}`; действия `POST .../deposits/{id}/action` `{action: "paid"|"returned"|"held"|"partially_held", held_amount?, reason?}`.
   - **Файлы**: multipart `POST .../files` (поле `file`), список, скачивание `GET .../files/{id}/download`, удаление.
   - **Комментарии**: список + `POST .../comments` `{content}`.
   - **История**: audit-log (offset-style).
   - Правка полей: `PATCH /bookings/{id}` (даты, счётчики гостей, цена вручную `total_price`, заметки, цвет).
4. **Гости** — справочник читается: `GET /guests?search=` (offset-style), карточка `GET /guests/{id}`. Создание — только через бронь.

### 5.4 Сегодня (today)

Операционная сводка дня: `GET /bookings/today?date=` → три списка: `check_ins`, `check_outs`, `in_house` (`TodayBookingItem`: гость, объект, времена, статус, гости). Действия — переход в бронь; чек-ин/чек-аут кнопкой = смена статуса брони.

### 5.5 Уборка (cleaning)

1. **Список задач** — фильтры `status, property_id, cleaner_id, date_from, date_to`; page-style. `GET /cleaning`. Задача: объект, тип, статус, клинер (`cleaner_name`), дата/время, привязанная бронь.
2. **Создание** — `POST /cleaning` `{property_id, type, booking_id?, cleaner_id?, scheduled_date?, scheduled_time?, notes?}`. Авто-создание: сервер сам создаёт задачу при чек-ауте брони — UI это просто показывает.
3. **Назначение** — `POST /cleaning/{id}/assign` `{cleaner_id}`; список клинеров `GET /users/cleaners`.
4. **Статусы** — `POST /cleaning/{id}/status` по цепочке pending→assigned→in_progress→done→verified.
5. **Карточка задачи** — `GET /cleaning/{id}` → task + report (фото по комнатам с `metadata_verified`, чек-лист с галочками/заметками).
6. **Отчёт клинера** (экран роли cleaner): `POST /cleaning/{id}/report` `{cleaner_id, notes?, photos:[{url, room_type}], checklist:[{checklist_item_id, is_done, note?}]}`. Фото — сначала S3-upload (§8).
7. **История по объекту** — `GET /cleaning/property/{property_id}`.
8. **Рейтинг клинеров** — `POST /cleaner-ratings` `{cleaner_id, score 1..5, task_id?, review?}`; профиль: `GET /cleaner-ratings/{cleaner_id}` + `GET .../kpi` (avg_score, total_ratings, recent).

### 5.6 Чеклисты (checklists)

Шаблоны для уборок. CRUD шаблонов `GET/POST/PATCH/DELETE /checklists`, карточка с пунктами `GET /checklists/{id}`, пункты: добавить/переименовать/удалить/reorder (`POST .../items/reorder` `{item_ids}`). Привязка к задаче происходит на сервере — в отчёте клинера пункты приходят готовыми.

### 5.7 Аналитика (analytics)

- Фильтры экрана: период (`period` пресет week|month|quarter|year|custom + `date_from/date_to`), `property_id?`, `source?`.
- **Сводка**: `GET /analytics/metrics` → summary (выручка, расходы, прибыль, комиссии, ADR, RevPAR, occupancy %, ср. длительность, брони, ночи, простой) + разбивка по объектам (`properties[]` те же метрики).
- **Графики**: `GET /analytics/time-series?granularity=day|week|month` → точки {period_label, revenue, bookings_count, booked_nights, occupancy_rate}.
- **Экспорт CSV**: `GET /analytics/export` с теми же фильтрами — отдаёт файл (скачивание).
- Деньги в ответах — строки; проценты — строки `"94.5"`.

### 5.8 AI Импорт (ai-import)

Импорт объявлений в объекты.

1. **Запуск**: по URL `POST /ai/import` `{source_url, user_prompt?}`; пачкой `POST /ai/import/batch` `{urls[]}`; из текста `POST /ai/import/text` `{text}`.
2. **Список джобов** `GET /ai/import` (page-style), статусы pending→processing→completed|failed; поллинг активных.
3. **Ревью**: `GET /ai/import/{job_id}` → `extracted_data`/`mapped_property` (JSON-черновик объекта) — форма-предпросмотр с правками.
4. **Подтверждение**: `POST /ai/import/{job_id}/confirm` `{property_data}` → создаёт объект.
5. Прокси фото: `GET /ai/photo/download?url=` — качает внешнее фото через бэкенд (обход CORS), затем стандартный S3-flow.
6. ⚠️ Работает только при поднятом `ai-service` — в прод-стеке его сейчас нет; UI должен переживать 5xx тут gracefully (показ «сервис недоступен»).

### 5.9 Каналы продаж (Channex) — НОВЫЙ раздел

Дистрибуция объектов в OTA (Booking, Airbnb, …) через Channex. Бэкенд готов, UI строить с нуля. Для сертификации Channex действия обязаны идти из UI.

1. **Блок на карточке объекта** (или отдельный раздел «Каналы»):
   - Статус листинга: `GET /channex/listings` → items `{property_id, channex_property_id, sync_state (pending|active|error), last_error, last_synced_at}`. Мапить по property_id.
   - Кнопка **«Подключить к каналам»** (объект без листинга): `POST /channex/listings` `{property_id, currency?, country?, city?, zip_code?, timezone?, contact_email?}` (дефолты: KZT/KZ/Asia/Almaty). Состояния: pending/active/error + текст last_error, retry той же кнопкой.
   - Кнопка **«Синхронизировать календарь»**: `POST /channex/listings/{property_id}/sync` `{date_from, date_to, rate?, min_stay?}` → `{days_pushed, blocked_dates[]}`. Дефолт диапазона — сегодня + 90 дней, rate берётся из цены объекта.
2. **Дальше (когда дойдём)**: авто-push при изменении цены/брони, Channel IFrame для маппинга OTA-аккаунтов клиента, экран входящих броней по каналам. Заложить место в навигации.

### 5.10 Мессенджеры (channels — Telegram/WhatsApp)

Раздел в настройках «Подключения»:
- Список подключений: `GET /channels` → `{channel: telegram|whatsapp, external_id, display_name, is_active}`.
- **Telegram (хост-бот)**: `POST /channels/telegram/link-code` → `{code, expires_at, bot_username}` — показать код и ссылку `https://t.me/{bot_username}` с инструкцией «отправьте боту /start CODE». 
- **WhatsApp**: `POST /channels/whatsapp` `{channel_id}` — привязка whapi-канала.
- Отключение: `DELETE /channels/{identity_id}`.

### 5.11 Настройки (settings)

1. **Компания**: `GET/PATCH /settings` — `default_currency (KZT|USD|EUR|RUB)`, `default_language (ru|kz|en)`. Запись — только owner.
2. **Команда** (owner): `GET /users?role=&include_inactive=`, создать `POST /users` `{email, password, role, full_name?, phone?}`, править `PATCH /users/{id}` (вкл. смену пароля и деактивацию), `DELETE /users/{id}` = деактивация.
3. **API-ключи** (owner): `GET /api-keys`, скоупы для формы `GET /api-keys/scopes`, `POST /api-keys` `{name, scopes[]}` → ответ содержит `key` **один раз** — показать с копированием и предупреждением; `DELETE /api-keys/{id}` = отзыв. В списке `key_hint`, `last_used_at`.
4. **Подключения** — §5.10, **Каналы продаж** — §5.9 (если выносится сюда).

### 5.12 Профиль/сессия

- `GET /auth/me` при старте приложения → роль, имя, компания; хранить в глобальном сторе.
- Logout = стереть токены (эндпоинта нет).

### 5.13 Telegram Mini App (`/tma`)

Отдельный облегчённый вход: `POST /auth/telegram-miniapp` `{init_data}` (из `window.Telegram.WebApp.initData`; блоб старше суток сервер отклоняет). После — обычные токены. Экраны (только чтение + минимум):
1. **Сегодня** — `GET /bookings/today` (заезды/проживают/выезды).
2. **Свободно** — `GET /bookings/availability?check_in&check_out` для пресетов «сегодня/завтра/выходные» → объекты с ценами (`total_price` или `price_error`).
3. **Брони (14 дней)** — `GET /bookings?date_from&date_to`.
Уборок в TMA нет (осознанное решение). Роутинг TMA живёт под `/tma`, guard — наличие Telegram WebApp контекста.

---

## 6. Ключевые контракты (полные схемы)

Полный список — 136 схем в OpenAPI. Здесь — опорные для форм.

### 6.1 PropertyCreate / PropertyUpdate

```
name: string                     internal_name: string
type: apartment|house|room       rental_mode: daily|hourly|both = daily
description?: string             source_url?: string
latitude?/longitude?: number     address_full?: string
apartment_number?/entrance?/block?: string   floor?: int
rooms?/beds?: int                area_living?/area_total?: number
check_in_instructions?/check_out_instructions?/house_rules?: string
```
Update — те же поля, все опциональные (PATCH-семантика: слать только изменённое).

### 6.2 BookingCreate

```
property_id: uuid                guest_name: string
guest_phone?/guest_email?: string
check_in/check_out: datetime     rental_mode?: daily|hourly = daily
source?: direct|booking|airbnb|other = direct
adults_count?: int = 1           children_count?: int = 0
gantt_color?: string = #3B82F6   notes?: string
```

### 6.3 PricingConfigCreate (PUT, upsert целиком)

```
base_price: money                hourly_price?: money
weekend_markup?: money           default_deposit?: money
extra_adult_price?/extra_child_price?: money
base_guests?: int = 2            # с какого гостя начинается доплата
```

### 6.4 UserResponse (глобальный стор)

```
id, email, company_id, role: owner|manager|cleaner, is_active, full_name?, phone?
```

Остальные схемы — по именам из §5 в OpenAPI (`BookingResponse`, `CleaningTaskResponse`, `AnalyticsMetricsResponse`, `ImportJobResponse`, `ListingResponse`, …).

## 7. i18n

- Языки: **ru** (основной/fallback), **kz**, **en**. Полный паритет ключей (сейчас 706/706/706) — правило «ключ добавляется сразу во все три файла», CI-проверка паритета желательна.
- 18 групп ключей верхнего уровня (переносить структуру): `nav, common, home, properties, bookings, today, gantt, cleaning, checklists, analytics, cleaner, aiImport, audit, settings, team, channels, miniapp` (+ добавить `channex`).
- Определение языка: `localStorage['language']` → `navigator.language` (kk→kz) → `ru`. Выбор в настройках; `default_language` из `GET /settings` — серверное значение компании.
- Все подписи enum'ов (§4) — через словарь, не хардкод. ⚠️ В старом фронте Login/Register не переведены — в новом перевести.

## 8. Файлы и фото (S3)

Что реально умеет бэкенд сегодня:
1. **Файлы броней** — единственный настоящий upload: multipart `POST /bookings/{id}/files` (поле `file`, один файл). Скачивание `GET .../download` — стрим **с авторизацией**: обычный `<a href>` не пройдёт (старый фронт так делает — битая ссылка, §11), качать fetch'ем с Bearer → blob → objectURL.
2. **Фото объектов** — только JSON `{url}` (готовый публичный URL). Файловой загрузки нет — см. §11.1, нужен новый эндпоинт на бэке.
3. **Фото отчётов уборки** — аналогично `ReportPhotoInput{url}`; загрузки нет (§11.2).
4. AI-импорт умеет проксировать внешние фото: `GET /ai/photo/download?url=` (лимит 25MB).
5. Прод-домен файлов: `https://files.daiynsolutions.com` — URL приходят готовыми, фронт их не собирает.

## 9. Нефункциональные требования к новому фронту

- **Мобайл-фёрст**: основной пользователь — хост с телефона. Шахматка — единственный сложный desktop-экран, но должна работать тачем.
- **Оптимистичные обновления** необязательны; обязательна инвалидация запросов после мутаций (TanStack Query: инвалидировать список + карточку + шахматку + «сегодня» после любой мутации брони; уборки — после смены статуса брони на checked_out).
- **Поллинг**: AI-джобы (активные) каждые ~3с; шахматка/сегодня — refetch on focus.
- Ошибка сети/5xx — не белый экран: retry-кнопка на уровне экрана.
- Роут-гарды: нет токена → /login; роль cleaner → только раздел уборок; TMA — отдельная ветка роутинга.
- Часовой пояс: всё в Asia/Almaty, сервер отдаёт наивные datetime — **не** конвертировать через UTC.

## 10. Карта роутов (референс структуры)

Целевая структура URL — сохранить (закладки, ссылки из ботов):

```
/                       дашборд/редирект
/login /register        публичные
/tma                    Telegram Mini App (свой auth, без общего layout)
/properties             список          /properties/new         мастер создания
/properties/gantt       шахматка        /properties/{id}        карточка
/properties/{id}/edit   правка
/bookings               список          /bookings/new           создание
                                        (search-параметры prefill: property_id, check_in, check_out, from)
/bookings/today         сегодня         /bookings/{id}          карточка (+/edit)
/cleaning               задачи          /cleaning/new           создание
/cleaning/checklists    шаблоны         /cleaning/{id}          карточка задачи
/cleaner                дашборд клинера (свой layout без общей навигации)
/cleaner/{taskId}       задача клинера + отчёт
/analytics              аналитика
/ai-import              импорт          /ai-import/{jobId}      превью/подтверждение
/settings               настройки       /settings/team          команда+ключи (owner)
/channels               каналы продаж (Channex) — НОВЫЙ (или блок в /settings)
```

Гарды: сейчас единственный — в root (нет токена → /login). В новом фронте добавить: `/cleaner/*` только роль cleaner (и авто-редирект клинера туда), `/settings/team` только owner — на уровне роутера, не только UI.

Шелл: desktop — верхняя навигация; mobile (<1024px) — нижние табы (4 основных + «Ещё»), safe-area. Клинер и TMA — собственные упрощённые шеллы.

Конвенции localStorage (сохранить имена ключей): `access_token`, `refresh_token`, `language`, `gantt-view-mode`, view-mode ключи списков (`cards|table`).

## 11. Известные разрывы фронт↔бэк (закрыть при пересборке)

Найдены сверкой старого фронта с OpenAPI. Новый фронт строить по **OpenAPI**, а на бэке добавить недостающее:

1. **Загрузка фото объектов**: бэк принимает только `{url}`, эндпоинта загрузки файла нет; старый фронт шлёт multipart `files` — вызов битый. → Нужен бэк-эндпоинт `POST /uploads` (multipart → S3 → url) или multipart-вариант photos; до тех пор фото — только по URL (AI-импорт работает именно так).
2. **Фото отчёта уборки**: `SubmitReportInput.photos[{url}]` — загрузки нет, старый фронт держит файлы локально и не отправляет. → Тот же общий upload-эндпоинт.
3. **Скачивание файлов брони**: старый фронт даёт прямой `<a href>` без Authorization — не работает. → fetch с Bearer → blob.
4. **Теги объекта**: старый фронт зовёт `PUT /properties/{id}/tags {tag_ids}` — такого роута нет; правильные: `POST .../tags {tag_id}` / `DELETE .../tags/{tag_id}` по одному.
5. **Amenities**: старый фронт зовёт `DELETE /properties/{id}/amenities/{amenityId}` — роута нет; правильное — полный набор через `POST .../amenities {amenity_ids}`.
6. **Настройки**: старый фронт ждёт `{language, timezone, notifications_enabled, default_currency}` — реальная схема `SettingsResponse{default_currency, default_language}`. timezone/notifications на бэке нет.
7. **AI-импорт**: старый фронт зовёт `DELETE /ai/import/{id}` — роута нет (джобы не удаляются).
8. **RBAC в UI**: старый фронт проверяет роль всего в 2 местах; клинер видит всю навигацию. Новый — полная карта §3 на уровне роутера и навигации.

## 12. Чек-лист подключения нового фронта

1. `VITE_API_URL` → API поднят, `GET /api/v1/health` отвечает.
2. API-клиент: Bearer-заголовок, single-flight refresh, обработка 401/422/429.
3. `GET /auth/me` при старте, стор пользователя, RBAC-навигация по §3.
4. Роуты по §5 (разделы), гарды по ролям.
5. Enum-словари и i18n по §4/§7.
6. Формы — схемы по §6 (или кодогенерация типов из `openapi.json`: `openapi-typescript` — рекомендуется, контракт всегда свежий).
7. Прогон сценария: регистрация → объект → цены → фото → бронь (с калькуляцией) → статусы → уборка → отчёт → аналитика.
8. Channex-блок (§5.9) — обязателен для сертификации channel manager.
