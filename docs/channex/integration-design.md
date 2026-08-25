# Channex Integration — Design

Бounded context `channels` в day-backend. Channex = внешний channel manager (white-label API).
Проверено на staging: property → room_type(count_of_rooms=1) → rate_plan(per_room) → ARI → webhook → revisions feed + ack.

## Маппинг сущностей

| Day PMS | Channex | Хранение |
|---|---|---|
| Company (tenant) | Group | `channel_connections.channex_group_id` |
| Property (квартира) | Property + RoomType(1) + RatePlan | `channel_listings` (property_id → channex_ids) |
| Календарь/цены | Availability & Rates (async tasks) | push при изменении цены/брони |
| Внешняя бронь | Booking Revision (webhook + feed + ack) | создаёт Booking c source=канал |

## Модель БД

```
channel_connections           # 1 строка на company
  id, company_id (uniq), provider ('channex'),
  channex_group_id, api_key_encrypted?, is_active, created_at

channel_listings              # 1 строка на property
  id, company_id, property_id (uniq),
  channex_property_id, channex_room_type_id, channex_rate_plan_id,
  sync_state ('pending'|'active'|'error'), last_synced_at, created_at

channel_bookings              # входящие брони (идемпотентность по unique_id)
  id, company_id, property_id, booking_id (nullable FK на брони),
  channex_booking_id, revision_id, unique_id (uniq), ota_name, status,
  payload (jsonb), ack_at, created_at
```

## Поток данных

1. **Онбординг property**: POST /channels/listings {property_id} → ChannexClient создаёт group(если нет)/property/room_type/rate_plan → сохраняем ids.
2. **Push ARI**: при изменении цены/availability в Day PMS → POST availability + restrictions (батчем через values[]). Fire-and-forget + task id в лог.
3. **Приём брони**: POST /webhooks/channex (без auth, но с secret query token) → сохранить событие → pull revisions feed → upsert channel_booking → создать/изменить/отменить Booking в booking-контексте → ack ревизии. Webhook = триггер, feed = источник истины.
4. **Fallback**: периодический pull feed (на случай пропущенных webhook) — Phase 2.

## Конфиг (env)

```
CHANNEX_API_URL=https://staging.channex.io   # prod: https://secure.channex.io
CHANNEX_API_KEY=...
CHANNEX_WEBHOOK_SECRET=...                    # свой токен в query webhook URL
```

## API (presentation)

```
POST   /api/v1/channels/listings              # завести property в Channex
GET    /api/v1/channels/listings              # статус синка по компаниям
POST   /api/v1/channels/listings/{id}/sync    # ручной push ARI
POST   /api/v1/webhooks/channex?secret=...    # приём событий (booking, ari)
```

## Слои

- `domain/channels/`: entities (ChannelConnection, ChannelListing, ChannelBooking), repository-интерфейсы, port `ChannelManagerClient` (abstract)
- `application/channels/`: ChannelSyncService (онбординг, ARI push), ChannelBookingService (обработка ревизий → booking-контекст)
- `infrastructure/channels/`: ChannexClient (httpx), SQLAlchemy-модели, repo-импл
- `presentation/api/v1/channels.py`, `webhooks.py`

## Решения

- Rate в KZT строкой "45000.00" — Channex принимает decimal string.
- `allow_availability_autoupdate_*: true` — Channex сам держит календарь по броням; Day PMS дополнительно блокирует даты своей бронью через ARI push.
- Модификация/отмена: revision с тем же unique_id, status modified|cancelled — upsert по unique_id.
- ota_commission приходит в ревизии — писать в Booking для аналитики (Booking.com 15%, Airbnb 3%).
- Листинги на OTA создаются вручную (Channex — mapping-only), см. listing-onboarding-agent-prompt.md.
