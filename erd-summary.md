# PMS — Entity Relationship Diagram

## Сводка: 30 таблиц по 4 доменам

---

## Domain 1: Identity & Access (6 таблиц)

| Таблица | Описание |
|---------|----------|
| `companies` | Тенант — организация хоста |
| `users` | Все пользователи (host, hostess, cleaner, sales_manager, super_admin) |
| `otp_codes` | OTP верификация при регистрации/логине |
| `invitations` | Приглашения от хоста для команды |
| `documents` | Документы (удостоверение, оферта) — привязаны к company + user |
| `refresh_tokens` | JWT refresh tokens |

**Мультитенантность:** `company_id` на всех таблицах. Super-admin видит все company.

---

## Domain 2: Property (9 таблиц)

| Таблица | Описание |
|---------|----------|
| `properties` | Объекты недвижимости — основной агрегат |
| `property_photos` | Фото объекта с сортировкой и обложкой |
| `amenities` | Справочник удобств (глобальный) |
| `property_amenities` | Many-to-many связь |
| `pricing_configs` | Конфиг цен: базовая, выходные, залог, доп гости |
| `seasonal_prices` | Сезонные цены (Новый год, Лето...) |
| `discount_rules` | Скидки от N ночей |
| `property_audit_logs` | История изменений объекта |

**Статусы:** `new → active → paused → archived`

---

## Domain 3: Booking (9 таблиц)

| Таблица | Описание |
|---------|----------|
| `guests` | Гости — создаются при бронировании |
| `group_bookings` | Групповое бронирование (5 взр + 3 дет) |
| `bookings` | Бронирования — основной агрегат |
| `booking_payments` | Платежи и возвраты |
| `booking_deposits` | Залоги (paid/returned/held/partially_held) |
| `booking_files` | Файлы прикреплённые к брони |
| `booking_comments` | Комментарии к брони |
| `booking_contracts` | Онлайн договоры |
| `booking_audit_logs` | История изменений бронирования |

**Статусы:** `pending → confirmed → checked_in → checked_out → completed | cancelled`

**Deposit статусы:** `pending → paid → returned | held | partially_held`

**Групповые брони:** `group_bookings` содержит мета (кол-во людей), `bookings` ссылается через `group_booking_id`.

---

## Domain 4: Cleaning (8 таблиц)

| Таблица | Описание |
|---------|----------|
| `cleaning_tasks` | Задачи на уборку (post_checkout / mid_stay / on_demand) |
| `cleaning_checklist_templates` | Шаблоны чеклистов уборки |
| `cleaning_checklist_items` | Пункты шаблона |
| `cleaning_reports` | Отчёт горничной |
| `cleaning_report_photos` | Фото уборки (ванная, кухня, спальня) + EXIF metadata |
| `cleaning_report_checklist` | Заполненный чеклист |
| `cleaner_routes` | Маршрут клинера на день (оптимизированный) |
| `cleaner_ratings` | Оценки и KPI клинера |

**Статусы:** `pending → assigned → in_progress → done → verified`

**Автоматика:**
- Booking `checked_out` → создаётся `cleaning_task` (type=post_checkout, status=pending)
- `cleaning_report` submitted + metadata OK → task status → `verified`

---

## Domain 5: Analytics (read models — без отдельных таблиц)

Строятся SQL запросами / materialized views поверх:
- `bookings` + `booking_payments` → доход, ADR, RevPAR
- `properties` + `bookings` → простои, средняя длительность
- `booking_payments` → расходы, комиссии
- Фильтры: период, гранулярность, объект, источник

---

## Ключевые связи

```
Company ──┬── Users
          ├── Properties ──┬── Photos
          │                ├── Amenities (m2m)
          │                ├── PricingConfig ──┬── SeasonalPrices
          │                │                   └── DiscountRules
          │                ├── Bookings ──┬── Payments
          │                │              ├── Deposits
          │                │              ├── Files
          │                │              ├── Comments
          │                │              ├── Contracts
          │                │              └── AuditLogs
          │                ├── CleaningTasks ── Reports ── Photos + Checklist
          │                └── AuditLogs
          ├── Guests
          ├── GroupBookings
          ├── Documents
          ├── Invitations
          ├── CleanerRoutes
          ├── CleanerRatings
          └── ChecklistTemplates
```

---

## Constraint-ы

1. **Уникальность объекта**: UNIQUE(`company_id`, `internal_name`)
2. **Нет пересечения броней**: CHECK constraint или application-level — один property не может иметь пересекающиеся даты для active bookings
3. **Паузированные объекты**: property.status = `paused` → новые брони запрещены
4. **Архивированные объекты**: property.status = `archived` → read-only
5. **Каскадное удаление**: Soft-delete через статусы, никакого физического удаления
