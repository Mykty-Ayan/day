# PMS — Доменная модель

---

## Bounded Contexts (6 доменов)

| # | Домен | Ответственность |
|---|-------|----------------|
| 1 | **Identity & Access** | Регистрация, аутентификация (OTP), компании, роли, приглашения, документы, оферта |
| 2 | **Property** | Объекты, ценообразование, фото, удобства, статусы, аудит-лог |
| 3 | **Booking** | Брони (одиночные, групповые), гости, платежи, залоги, файлы, drag-n-drop, оптимизация заполняемости, аудит-лог |
| 4 | **Cleaning** | Уборки, чеклисты, фото-отчёты, верификация метаданных, маршрутизация клинеров, расписание, KPI/оценки |
| 5 | **Analytics** | Финансовая статистика (ADR, RevPAR, доход, расход, прибыль, простои), фильтрация, графики |
| 6 | **AI Migration** | Парсинг данных с сайтов-источников + промт юзера → заполнение Property (отдельный сервис LangGraph) |

---

## Высокоуровневая архитектура

```
┌─────────────────────────────────────────────────┐
│               React Admin (SPA)                 │
│    Host Dashboard  │  Super-Admin Dashboard     │
└──────────┬──────────────────┬───────────────────┘
           │ REST/WS          │
     ┌─────▼─────┐    ┌──────▼──────┐
     │  PMS API  │    │  AI Service │
     │ (FastAPI) │◄──►│ (LangGraph) │
     │  Clean    │    │  FastAPI    │
     │  Arch     │    └─────────────┘
     └─────┬─────┘
           │
     ┌─────▼─────┐
     │ PostgreSQL │  + S3 (фото/файлы)
     │  + Redis   │
     └───────────┘
```

---

## Роли и доступ

| Роль | Scope | Описание |
|------|-------|----------|
| **super-admin** | Все `company_id` | Платформа — видит и управляет всем |
| **host** | Свой `company_id` | Владелец — полный доступ к своей компании |
| **hostess** | Свой `company_id` | Помощник — операционка (брони, уборки, гости) |
| **cleaner** | Свой `company_id` | Горничная — свои задачи, отчёты |
| **sales-manager** | Свой `company_id` | Менеджер продаж — брони, гости |

**Мультитенантность:** `company_id` пронизывает все сущности. Регистрация host → создаётся Company + User(role=host).

---

## Агрегаты и сущности

### Domain 1: Identity & Access

```
Company (Aggregate Root)
├── id: UUID
├── name: string                — Название организации
├── status: CompanyStatus       — active | suspended | deleted
├── created_at: timestamp
└── updated_at: timestamp

User (Aggregate Root)
├── id: UUID
├── company_id: UUID            — FK → Company
├── email: string (unique)
├── phone: string (unique)
├── name: string
├── role: UserRole              — super_admin | host | hostess | cleaner | sales_manager
├── status: UserStatus          — active | invited | blocked
├── password_hash: string
├── created_at: timestamp
└── updated_at: timestamp

OTPCode (Entity)
├── id: UUID
├── user_id: UUID               — FK → User
├── code: string
├── channel: OTPChannel         — sms | email
├── is_used: boolean
├── expires_at: timestamp
└── created_at: timestamp

Invitation (Entity)
├── id: UUID
├── company_id: UUID            — FK → Company
├── invited_by: UUID            — FK → User
├── email: string
├── phone: string
├── role: UserRole
├── token: string (unique)
├── status: InvitationStatus    — pending | accepted | expired
├── expires_at: timestamp
└── created_at: timestamp

Document (Entity)
├── id: UUID
├── company_id: UUID            — FK → Company
├── user_id: UUID               — FK → User
├── type: DocumentType          — identity_doc | offer_agreement
├── file_url: string
├── file_name: string
├── status: DocumentStatus      — pending | verified | rejected
├── created_at: timestamp
└── updated_at: timestamp
```

**Use Cases:**
- Регистрация хоста (email, phone, org_name) → OTP верификация → Company + User
- Логин по OTP
- Приглашение в команду (host → hostess/cleaner/sales_manager)
- Загрузка/просмотр документов (каждый хост видит только свою компанию)
- Загрузка/скачивание оферты

---

### Domain 2: Property

```
Property (Aggregate Root)
├── id: UUID
├── company_id: UUID            — FK → Company
├── name: string                — Публичное название
├── internal_name: string       — Внутреннее (UNIQUE per company)
├── type: PropertyType          — apartment | house | room
├── status: PropertyStatus      — new | active | paused | archived
├── description: text
├── source_url: string          — Ссылка на источник объявления
│
├── 📍 Location
│   ├── latitude: float
│   ├── longitude: float
│   ├── address_full: string
│   ├── apartment_number: string
│   ├── entrance: string        — Подъезд
│   ├── block: string
│   └── floor: int
│
├── 🏠 Details
│   ├── rooms: int              — Комнатность
│   ├── beds: int               — Спальные места
│   ├── area_living: float      — Жилая площадь
│   └── area_total: float       — Общая площадь
│
├── 📋 Rules
│   ├── check_in_instructions: text
│   ├── check_out_instructions: text
│   └── house_rules: text
│
├── created_at: timestamp
└── updated_at: timestamp

PropertyPhoto (Entity)
├── id: UUID
├── property_id: UUID
├── url: string
├── sort_order: int
├── is_cover: boolean
└── created_at: timestamp

Amenity (Reference Entity — глобальный справочник)
├── id: UUID
├── name: string (unique)
├── icon: string
└── category: AmenityCategory   — bathroom | kitchen | entertainment | safety | ...

PropertyAmenity (Value Object — many-to-many)
├── property_id: UUID
└── amenity_id: UUID

PricingConfig (Entity — 1:1 с Property)
├── id: UUID
├── property_id: UUID
├── base_price: decimal         — Базовая цена за сутки
├── weekend_markup: decimal     — Наценка на выходные
├── default_deposit: decimal    — Залог по умолчанию
├── extra_adult_price: decimal
├── extra_child_price: decimal
├── base_guests: int            — Гостей в базовой цене
├── created_at: timestamp
└── updated_at: timestamp

SeasonalPrice (Entity)
├── id: UUID
├── pricing_config_id: UUID
├── name: string                — "Новый год", "Лето"
├── start_date: date
├── end_date: date
├── price_per_night: decimal
└── created_at: timestamp

DiscountRule (Entity)
├── id: UUID
├── pricing_config_id: UUID
├── min_nights: int             — От 7 ночей
├── discount_percent: decimal   — 10%
├── discount_fixed: decimal     — или фикс скидка
└── created_at: timestamp

PropertyAuditLog (Entity)
├── id: UUID
├── property_id: UUID
├── changed_by: UUID            — FK → User
├── field_name: string
├── old_value: text
├── new_value: text
├── action: AuditAction         — create | update | status_change
└── created_at: timestamp
```

**State Machine — Property Status:**
```
         ┌──────────┐
         │   NEW    │
         └────┬─────┘
              │ activate
         ┌────▼─────┐
    ┌────►│  ACTIVE  │◄────┐
    │     └──┬────┬──┘     │
    │ resume │    │ pause   │
    │   ┌────▼──┐ │        │
    │   │PAUSED │─┘        │
    │   └───────┘          │
    │                      │
    │         archive      │
    │     ┌──────────┐     │
    └─────│ ARCHIVED │     │
          └──────────┘     │
          (нет возврата)
```

**Constraints:**
- UNIQUE(`company_id`, `internal_name`)
- `paused` → новые брони запрещены
- `archived` → read-only

**Use Cases:**
- Добавить объект → статус `new`
- Редактировать объект → audit log
- Просмотр шахматки (Gantt Chart) — сортировка по алфавиту имени
- Фильтрация по internal_name
- Приостановить приём броней (active → paused)
- Архивировать объект (active → archived)
- Карточка объекта
- AI заполнение через source_url + промт (Domain 6)

---

### Domain 3: Booking

```
Guest (Aggregate Root)
├── id: UUID
├── company_id: UUID
├── name: string
├── phone: string
├── email: string
├── notes: text
├── created_at: timestamp
└── updated_at: timestamp

GroupBooking (Aggregate Root)
├── id: UUID
├── company_id: UUID
├── adults_count: int           — 5 взрослых
├── children_count: int         — 3 ребёнка
├── status: GroupStatus         — pending | confirmed | cancelled
├── notes: text
├── created_at: timestamp
└── updated_at: timestamp
│
└── bookings[]                  — система подбирает подходящие объекты рядом

Booking (Aggregate Root)
├── id: UUID
├── company_id: UUID
├── property_id: UUID           — FK → Property
├── guest_id: UUID              — FK → Guest
├── group_booking_id: UUID?     — FK → GroupBooking (nullable)
├── check_in: date
├── check_out: date
├── source: BookingSource       — direct | booking | airbnb | other
├── status: BookingStatus       — pending | confirmed | checked_in | checked_out | completed | cancelled
├── gantt_color: string         — "#FF5733"
├── gantt_icon: string?
├── total_price: decimal
├── calculated_price: decimal   — Результат калькулятора
├── adults_count: int
├── children_count: int
├── created_at: timestamp
└── updated_at: timestamp

BookingPayment (Entity)
├── id: UUID
├── booking_id: UUID
├── amount: decimal
├── type: PaymentType           — payment | refund
├── method: PaymentMethod       — cash | card | transfer
├── status: PaymentStatus       — pending | completed | failed
├── note: text
├── paid_at: timestamp
└── created_at: timestamp

BookingDeposit (Entity)
├── id: UUID
├── booking_id: UUID
├── amount: decimal
├── status: DepositStatus       — pending | paid | returned | held | partially_held
├── held_amount: decimal        — при частичном удержании
├── reason: text                — причина удержания
├── created_at: timestamp
└── updated_at: timestamp

BookingFile (Entity)
├── id: UUID
├── booking_id: UUID
├── file_url: string
├── file_name: string
├── file_type: string
└── created_at: timestamp

BookingComment (Entity)
├── id: UUID
├── booking_id: UUID
├── author_id: UUID             — FK → User
├── content: text
└── created_at: timestamp

BookingContract (Entity)
├── id: UUID
├── booking_id: UUID
├── template_url: string        — шаблон оферты
├── generated_url: string       — сгенерированный договор
├── status: ContractStatus      — draft | generated | sent | signed
├── signed_at: timestamp
└── created_at: timestamp

BookingAuditLog (Entity)
├── id: UUID
├── booking_id: UUID
├── changed_by: UUID            — FK → User
├── field_name: string
├── old_value: text
├── new_value: text
├── action: AuditAction         — create | update | status_change | move
└── created_at: timestamp
```

**State Machine — Booking Status:**
```
    ┌─────────┐
    │ PENDING │
    └────┬────┘
         │ confirm
    ┌────▼──────┐
    │ CONFIRMED │──────────────┐
    └────┬──────┘              │ cancel
         │ check_in       ┌───▼──────┐
    ┌────▼──────┐         │CANCELLED │
    │CHECKED_IN │         └──────────┘
    └────┬──────┘
         │ check_out
    ┌────▼───────┐
    │CHECKED_OUT │ ──→ triggers CleaningTask
    └────┬───────┘
         │ complete
    ┌────▼──────┐
    │ COMPLETED │
    └───────────┘
```

**State Machine — Deposit:**
```
    ┌─────────┐
    │ PENDING │
    └────┬────┘
         │ pay
    ┌────▼──┐
    │  PAID │
    └──┬────┘
       │
       ├── return ──→ RETURNED
       ├── hold   ──→ HELD
       └── partial ─→ PARTIALLY_HELD (held_amount)
```

**Constraints:**
- Нет пересечения дат broни на одном property (application-level check)
- Paused property → новые брони запрещены
- Редактирование → всё логируется в booking_audit_logs

**Алгоритм оптимизации заполняемости:**
```
Определения:
  - Короткая бронь: < 3 ночей
  - Длинная бронь: ≥ 3 ночей (долгожители)

Правила:
  1. Длинные брони — НЕ ТРОГАТЬ
  2. Короткие брони — можно перемещать по свободным
     объектам аналогичного типа (С СОГЛАСИЯ гостя)
  3. Если заявка на длинную бронь на конкретный объект,
     а там короткая — переместить короткую (С СОГЛАСИЯ)
  4. Групповые — подбор объектов рядом (по геопозиции)
```

**Use Cases:**
- Добавить бронь → проверка пересечений → создать Guest если нет
- Групповое бронирование → подбор объектов по capacity + proximity
- Drag-n-drop бронь между объектами → audit log
- Калькулятор цены (seasonal + discount + extra guests)
- Добавить/вернуть платёж
- Добавить/вернуть залог
- Генерация онлайн договора
- Список заездов и выездов
- Список бронирований
- Список клиентов (имя, номер)

---

### Domain 4: Cleaning

```
CleaningTask (Aggregate Root)
├── id: UUID
├── company_id: UUID
├── property_id: UUID           — FK → Property
├── booking_id: UUID?           — FK → Booking (для post_checkout)
├── cleaner_id: UUID            — FK → User (role=cleaner)
├── type: CleaningType          — post_checkout | mid_stay | on_demand
├── status: CleaningStatus      — pending | assigned | in_progress | done | verified
├── scheduled_date: date
├── scheduled_time: time        — привязка к checkout time
├── notes: text
├── started_at: timestamp
├── completed_at: timestamp
├── verified_at: timestamp
├── created_at: timestamp
└── updated_at: timestamp

CleaningChecklistTemplate (Entity)
├── id: UUID
├── company_id: UUID
├── name: string                — "Стандартная уборка"
└── created_at: timestamp
│
└── items[]
    ├── id: UUID
    ├── title: string           — "Помыть ванную"
    └── sort_order: int

CleaningReport (Entity)
├── id: UUID
├── task_id: UUID               — FK → CleaningTask
├── cleaner_id: UUID            — FK → User
├── status: ReportStatus        — submitted | approved | rejected
├── notes: text
├── submitted_at: timestamp
└── created_at: timestamp
│
├── photos[]
│   ├── id: UUID
│   ├── url: string
│   ├── room_type: RoomType     — bathroom | kitchen | bedroom | other
│   ├── metadata: JSONB         — EXIF: lat, lng, timestamp
│   └── metadata_verified: boolean
│
└── checklist[]
    ├── checklist_item_id: UUID
    ├── is_done: boolean
    └── note: text?

CleanerRoute (Entity)
├── id: UUID
├── company_id: UUID
├── cleaner_id: UUID            — FK → User
├── route_date: date
├── ordered_task_ids: JSONB     — упорядоченный список
├── route_polyline: JSONB       — оптимизированный маршрут
├── created_at: timestamp
└── updated_at: timestamp

CleanerRating (Entity)
├── id: UUID
├── company_id: UUID
├── cleaner_id: UUID            — FK → User
├── task_id: UUID?              — FK → CleaningTask
├── rated_by: UUID              — FK → User
├── score: int                  — 1-5
├── review: text
├── kpi_metrics: JSONB          — скорость, качество, и тд
└── created_at: timestamp
```

**State Machine — Cleaning Task:**
```
    ┌─────────┐
    │ PENDING │ ← auto-created on checkout
    └────┬────┘
         │ assign
    ┌────▼─────┐
    │ ASSIGNED │
    └────┬─────┘
         │ start
    ┌────▼───────────┐
    │  IN_PROGRESS   │
    └────┬───────────┘
         │ complete + submit report
    ┌────▼──┐
    │  DONE │
    └────┬──┘
         │ verify (metadata check optional)
    ┌────▼─────┐
    │ VERIFIED │
    └──────────┘
```

**Domain Events:**
- `BookingCheckedOut` → auto-create `CleaningTask(type=post_checkout, status=pending)`
- `CleaningReportSubmitted` → verify metadata → `CleaningTask.status = verified`

**Use Cases:**
- Авто-создание задачи на уборку после выезда
- Заказать уборку во время брони (mid_stay / on_demand)
- Горничная отправляет отчёт (фото + чеклист)
- Верификация метаданных фото (EXIF — время, геолокация)
- Расписание уборок по времени выезда
- Маршрут уборки для клинера (оптимизация)
- Оценка клинера + KPI
- История уборок объекта

---

### Domain 5: Analytics (Read Models)

```
PropertyStats (Read Model — materialized view / query)
├── property_id
├── period_start / period_end
├── revenue: decimal            — Доход
├── adr: decimal                — Average Daily Rate
├── revpar: decimal             — Revenue Per Available Room
├── expenses: decimal           — Расходы
├── profit: decimal             — Прибыль
├── platform_commission: decimal — Комиссия площадки
├── vacancy_days: int           — Простои
└── avg_stay_duration: float    — Средняя длительность

Фильтры:
├── period: week(-7d) | month(-30d) | quarter | year | custom
├── granularity: day | week | month
├── property_id: UUID?
└── source: booking | airbnb | all
```

По умолчанию: today - 30 days.

---

### Domain 6: AI Migration (отдельный сервис — прогруммим позже)

```
Сценарий:
1. Хост вставляет ссылку на объявление (Booking/Airbnb/Krisha и тд)
2. Хост добавляет промт с доп информацией
3. AI парсит страницу → извлекает данные → маппит на Property schema
4. Хост ревьюит и подтверждает → создаётся Property

Стек: LangGraph + FastAPI (отдельный сервис)
```

---

## Clean Architecture — структура PMS Backend

```
pms-backend/
├── app/
│   ├── domain/                     # Entities, Value Objects, Enums, Interfaces
│   │   ├── identity/
│   │   │   ├── entities.py         # Company, User, Invitation, Document
│   │   │   ├── value_objects.py    # UserRole, UserStatus, CompanyStatus
│   │   │   ├── repositories.py     # Abstract repos (interfaces)
│   │   │   └── events.py           # Domain events
│   │   ├── property/
│   │   │   ├── entities.py         # Property, PricingConfig, SeasonalPrice...
│   │   │   ├── value_objects.py    # PropertyType, PropertyStatus, Location
│   │   │   ├── repositories.py
│   │   │   └── events.py
│   │   ├── booking/
│   │   │   ├── entities.py         # Booking, Guest, GroupBooking, Payment...
│   │   │   ├── value_objects.py    # BookingStatus, DepositStatus, Source
│   │   │   ├── repositories.py
│   │   │   ├── services.py         # PriceCalculator, OccupancyOptimizer
│   │   │   └── events.py          
│   │   ├── cleaning/
│   │   │   ├── entities.py         # CleaningTask, Report, Route, Rating
│   │   │   ├── value_objects.py    # CleaningType, CleaningStatus
│   │   │   ├── repositories.py
│   │   │   └── events.py
│   │   └── analytics/
│   │       └── read_models.py      # PropertyStats
│   │
│   ├── application/                # Use Cases (interactors)
│   │   ├── identity/
│   │   │   ├── register_host.py
│   │   │   ├── login_otp.py
│   │   │   ├── invite_member.py
│   │   │   └── manage_documents.py
│   │   ├── property/
│   │   │   ├── create_property.py
│   │   │   ├── update_property.py
│   │   │   ├── change_status.py
│   │   │   └── list_properties.py
│   │   ├── booking/
│   │   │   ├── create_booking.py
│   │   │   ├── update_booking.py
│   │   │   ├── move_booking.py
│   │   │   ├── group_booking.py
│   │   │   ├── manage_payments.py
│   │   │   ├── manage_deposits.py
│   │   │   └── optimize_occupancy.py
│   │   ├── cleaning/
│   │   │   ├── create_task.py
│   │   │   ├── submit_report.py
│   │   │   ├── build_route.py
│   │   │   ├── rate_cleaner.py
│   │   │   └── schedule_cleanings.py
│   │   └── analytics/
│   │       └── get_property_stats.py
│   │
│   ├── infrastructure/             # Implementations
│   │   ├── persistence/
│   │   │   ├── database.py         # SQLAlchemy engine/session
│   │   │   ├── models/             # ORM models
│   │   │   ├── repositories/       # Concrete repo implementations
│   │   │   └── migrations/         # Alembic
│   │   ├── storage/
│   │   │   └── s3.py               # Фото, файлы
│   │   ├── external/
│   │   │   ├── sms_provider.py     # OTP SMS
│   │   │   └── email_provider.py   # OTP Email
│   │   └── event_bus.py            # Domain event dispatcher
│   │
│   └── presentation/               # FastAPI layer
│       ├── api/
│       │   ├── v1/
│       │   │   ├── identity.py
│       │   │   ├── properties.py
│       │   │   ├── bookings.py
│       │   │   ├── cleaning.py
│       │   │   └── analytics.py
│       │   └── deps.py             # Dependencies (auth, company scope)
│       ├── schemas/                # Pydantic request/response
│       │   ├── identity.py
│       │   ├── property.py
│       │   ├── booking.py
│       │   ├── cleaning.py
│       │   └── analytics.py
│       └── middleware/
│           ├── auth.py
│           └── tenant.py           # company_id scope
│
├── tests/
├── alembic.ini
├── pyproject.toml
└── main.py
```

---

## Сводка

| Показатель | Значение |
|------------|----------|
| Bounded Contexts | 6 |
| Aggregate Roots | 8 (Company, User, Property, Booking, Guest, GroupBooking, CleaningTask, CleanerRoute) |
| Entities | 22 |
| State Machines | 4 (Property, Booking, Deposit, Cleaning) |
| Таблиц в БД | 30 |
| Ролей | 5 (super_admin, host, hostess, cleaner, sales_manager) |
