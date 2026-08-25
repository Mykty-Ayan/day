# Integrations Plan — WhatsApp (guest bot) + Telegram (host bot)

Design contract for the next two roadmap tracks after UI/UX stabilization. Grounded in the current stack: FastAPI + SQLAlchemy async + PostgreSQL (Clean Architecture / DDD), Redis (already running), multi-tenant by `company_id`.

> **Why this is design-only right now.** Both integrations require external credentials that must be provisioned by the operator and cannot be self-obtained: a Meta WhatsApp Business account + phone number + permanent access token, a Telegram bot token from @BotFather, and a **public HTTPS webhook URL** (prod deploy or a tunnel like ngrok). Everything below is buildable and unit-testable against fakes before those exist; the parts that need live tokens are marked **🔑**.

---

## 0. Shared foundation — a `messaging` bounded context

Both bots are messaging channels over the same core. Build one context both reuse instead of two silos.

```
app/domain/messaging/
  entities.py         # Conversation, Message, ChannelIdentity, OutboundNotification
  value_objects.py    # Channel(whatsapp|telegram), MessageDirection, MessageStatus, ConversationState
  repositories.py     # ConversationRepository, MessageRepository, ChannelIdentityRepository (interfaces)
  services.py         # MessageProvider port (send_text/send_template/send_buttons), IntentRouter port
app/application/messaging/
  handle_inbound.py       # webhook payload -> normalized Message -> route -> reply
  send_notification.py    # OutboundNotification -> provider (with outbox/retry)
  link_channel_identity.py# bind a phone/chat_id to a Guest (WA) or User (TG)
app/infrastructure/messaging/
  whatsapp_provider.py    # 🔑 Meta Cloud API client (implements MessageProvider)
  telegram_provider.py    # 🔑 Telegram Bot API client
  fake_provider.py        # in-memory, records sent messages — used by all unit tests
  models.py               # SQLAlchemy: conversations, messages, channel_identities, outbound_notifications
  repositories.py         # SQL implementations
app/presentation/api/v1/
  webhooks.py             # POST /webhooks/whatsapp, POST/GET /webhooks/telegram (+ signature verify)
```

**Provider port (channel-agnostic):**
```python
class MessageProvider(Protocol):
    async def send_text(self, to: str, text: str) -> str: ...            # returns provider msg id
    async def send_buttons(self, to: str, text: str, buttons: list[Button]) -> str: ...
    async def send_template(self, to: str, template: str, vars: dict) -> str: ...  # WA-only, no-op on TG
```
The application layer never imports Meta/Telegram SDKs — only the port. Swapping/adding channels = one infrastructure class.

**Outbox pattern for reliability.** Notifications (new booking, checkout reminder) are written to `outbound_notifications` in the same DB transaction as the domain change, then a Redis-backed worker drains them to the provider with retry/backoff. Guarantees "booking created ⇒ host notified" survives a provider outage. Redis is already in the stack.

**Webhook security (both channels):** verify signatures before processing — WhatsApp `X-Hub-Signature-256` (HMAC-SHA256 with the app secret), Telegram `X-Telegram-Bot-Api-Secret-Token` (a secret set at `setWebhook`). Reject unsigned. Rate-limit is already CORS-safe (see `fix(api)`), but webhooks should be on the rate-limiter exclude list.

### New tables (one Alembic migration)
| Table | Purpose |
|---|---|
| `channel_identities` | (company_id, channel, external_id[phone/chat_id], guest_id?/user_id?) — binds a WA phone to a Guest, a TG chat to a User |
| `conversations` | (company_id, channel, identity_id, state, last_message_at) — per-contact thread + FSM state |
| `messages` | (conversation_id, direction, provider_msg_id, type, body, payload_json, status, created_at) — full log |
| `outbound_notifications` | (company_id, channel, target, template, vars_json, status, attempts, next_attempt_at) — outbox |

All scoped by `company_id` (NFR-1 isolation). Message bodies may hold PII (guest phones) — same handling as existing `guests`.

---

## Track 2 — WhatsApp: bot ↔ the host's guests

**Goal (from PRD/roadmap):** a guest messages the operator's WhatsApp number; the bot answers, checks availability, takes a booking request, and later sends check-in instructions / deposit info. Reduces the operator's manual chat load.

**API:** Meta **WhatsApp Business Cloud API** (Graph API `graph.facebook.com/v20+/{phone_number_id}/messages`). Inbound arrives as webhooks; outbound is a POST. Note the **24-hour customer-service window**: outside it you may only send pre-approved **message templates**, inside it free-form text — the provider port already separates `send_text` from `send_template`.

### Architecture
```
Guest WA ──▶ Meta ──▶ POST /webhooks/whatsapp ──▶ handle_inbound
   ▲                                                   │
   └────────── whatsapp_provider.send_* ◀── IntentRouter (FSM)
```
- **handle_inbound**: verify signature → normalize Meta payload to `Message` → upsert `channel_identity` (phone) + `conversation` → `IntentRouter`.
- **IntentRouter (conversation FSM)** states: `idle → collecting_dates → awaiting_confirm → done`. MVP is a deterministic rule/keyword router; an LLM intent layer can slot in later (the `ai-service` already exists and speaks OpenAI/OpenRouter — reuse it as the NLU backend).

### Guest flows (MVP)
1. **Availability**: guest asks for dates → router calls the existing booking/property services (`get_gantt_data` / an availability check) scoped to the company → replies free/busy + price (reuses `PriceCalculatorService`, incl. the new **hourly** path).
2. **Booking request**: guest confirms → create a `pending` booking via `CreateBookingService` with `source = whatsapp` (extend the `BookingSource` enum) and the guest auto-created/linked → operator sees it in the PMS.
3. **Check-in instructions / access code**: on `confirmed`/day-of, send the property's `check_in_instructions` + current access code (Property already stores these; the door-code field is in the PRD).
4. **Deposit reminder / house rules**: templated messages.

### Data touchpoints (reuse, minimal new)
- `BookingSource` enum += `whatsapp`. Guests already carry a phone → `channel_identities` binds phone → `guests.id`.
- No change to booking/pricing core — the bot is a client of existing use-cases.

### 🔑 Credentials to provision
Meta Business + WhatsApp Business Account, a phone number, `WHATSAPP_PHONE_NUMBER_ID`, permanent `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET` (signature), a verify token, and approved templates for out-of-window sends.

### Phasing
- **W1 (no token):** messaging context + models + migration + fake provider + webhook route with signature verify + inbound normalization + FSM skeleton + unit tests. **Fully testable now.**
- **W2 (🔑):** live Meta client, template registration, availability+booking flow end-to-end on a sandbox number.
- **W3:** LLM NLU via `ai-service`, richer flows (reschedule, cancel), blacklist check on inbound (PRD чёрный список).

---

## Track 3 — Telegram: bot ↔ the host

**Goal:** notify the host (new booking, checkout, cleaning assigned, owner-payment due) and let the host **create bookings and manage the system from Telegram** — effectively a second, chat-based client over the existing API.

**API:** **Telegram Bot API** (token from @BotFather). Webhook mode (`setWebhook` with a secret token) preferred over long-polling for a deployed service. Inline keyboards + commands drive the UX.

### Architecture
```
Host TG ──▶ Telegram ──▶ POST /webhooks/telegram ──▶ handle_inbound ──▶ command router
   ▲                                                                        │
   └── telegram_provider.send_* ◀── (reuses booking/property/analytics services)
                    ▲
outbound worker ◀── outbound_notifications (outbox) ◀── domain events
```
- **Host linkage / auth:** a host runs `/start <link-code>` (code minted in PMS Settings); `link_channel_identity` binds `telegram chat_id → users.id` + `company_id`. Every subsequent update is authenticated and tenant-scoped by that binding. Unlinked chats get only the linking prompt — preserves NFR-1 isolation.

### Notifications (outbox → push)
Emit an `OutboundNotification` inside the existing use-cases' transactions:
- new booking created, booking `checked_out`, cleaning task assigned/verified, owner-payment-due (from the property's owner-rent terms — a PRD field), advertising-renewal reminder (later).
Wording via templates + i18n (ru/kz/en already in the app).

### Host management (commands / inline)
- `/today` → today's check-ins/outs (reuses `TodayPage`'s service).
- `/new` → guided booking: pick property (inline keyboard) → dates/times (supports **hourly** now) → guest → confirm → `CreateBookingService`.
- `/bookings`, `/book <id>` → view/act (confirm, check-in, cancel) via `ChangeBookingStatusService`.
- `/stats` → this week's P&L/occupancy via `analytics` (now correct after the occupancy fix).
All commands call the SAME application services the web UI uses — no business logic duplicated.

### 🔑 Credentials
`TELEGRAM_BOT_TOKEN`, a webhook secret, and a public HTTPS URL for `setWebhook`.

### Phasing
- **T1 (no token):** messaging context reuse + telegram webhook route + secret verify + update normalization + link-code flow + command router skeleton + outbox worker + fakes + unit tests. **Testable now.**
- **T2 (🔑):** live bot — notifications first (highest value, one-way), then `/today` + `/stats` (read), then `/new` + status actions (write).
- **T3:** rich inline flows, per-role access (hostess/cleaner limited commands), quiet hours.

---

## Cross-cutting decisions
- **One context, two providers** — avoids duplicating conversation/outbox logic.
- **Bots are clients of existing use-cases** — no parallel booking/pricing logic; hourly rental and the analytics fix are inherited for free.
- **Outbox + Redis worker** for at-least-once notification delivery.
- **Signature/secret verification is mandatory** and webhooks bypass the user rate-limiter (add to `_EXCLUDED_PATHS`).
- **Isolation:** every identity/conversation/message row carries `company_id`; Telegram host binding and WhatsApp phone binding both resolve to a single company.
- **NLU later, deterministic first** — ship keyword/command routing; graft the existing `ai-service` (OpenAI/OpenRouter) as the intent classifier when flows justify it.

## Suggested build order
1. `messaging` bounded context + models + migration + fake provider + webhook routes with signature verify (both channels) + unit tests. *(no credentials)*
2. Outbox table + Redis worker + emit notifications from booking/cleaning use-cases. *(no credentials, fake provider in tests)*
3. 🔑 Telegram live: link flow → notifications → read commands → write commands.
4. 🔑 WhatsApp live: sandbox number → availability + booking request → templates → check-in instructions.
5. LLM NLU (WhatsApp) + richer flows + blacklist enforcement.

## What can be delivered before any credentials arrive
Steps 1–2 in full: the `messaging` domain, DB schema/migration, provider **port + fake**, both webhook endpoints (signature-verified), inbound normalization, the conversation FSM / command router skeletons, the outbox worker, `BookingSource.whatsapp/telegram`, and a complete unit-test suite driving flows through the fake provider. When tokens land, only the two `*_provider.py` classes + config are new.
