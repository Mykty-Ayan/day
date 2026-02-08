# PMS — Feature Roadmap

---

## Обзор фаз

| Фаза | Название | Спринты | Фокус |
|------|----------|---------|-------|
| 0 | **Foundation** | 1–2 | Инфраструктура, CI/CD, скелет проекта |
| 1 | **Identity & Access** | 3–4 | Регистрация, авторизация, роли, документы |
| 2 | **Property Core** | 5–7 | Объекты, ценообразование, шахматка |
| 3 | **Booking Core** | 8–11 | Брони, гости, платежи, залоги, Gantt |
| 4 | **Cleaning** | 12–14 | Уборки, отчёты, маршруты, KPI |
| 5 | **Analytics** | 15–16 | Финансовая статистика, графики |
| 6 | **AI Migration** | 17–18 | Парсинг объявлений, автозаполнение |
| 7 | **Polish & Launch** | 19–20 | UX, оптимизация, тестирование, деплой |

Спринт = 1 неделя

---

## Фаза 0: Foundation (Спринты 1–2)

### Sprint 1 — Инфраструктура

| # | Фича | Приоритет | Описание |
|---|-------|-----------|----------|
| F-0.1 | Репозиторий и структура | 🔴 Critical | Monorepo: `day-backend/`, `day-frontend/`, `ai-service/`, `docker/` |
| F-0.2 | Docker Compose | 🔴 Critical | PostgreSQL, Redis, MinIO (S3), Backend, Frontend |
| F-0.3 | Backend скелет | 🔴 Critical | FastAPI + Clean Architecture + Alembic + SQLAlchemy |
| F-0.4 | Frontend скелет | 🔴 Critical | React + Vite + TanStack Router + TanStack Query + Tailwind |
| F-0.5 | CI/CD pipeline | 🟡 High | GitHub Actions: lint, test, build, deploy |

### Sprint 2 — Базовые компоненты

| # | Фича | Приоритет | Описание |
|---|-------|-----------|----------|
| F-0.6 | Миграции БД (Identity) | 🔴 Critical | companies, users, otp_codes, invitations, documents, refresh_tokens |
| F-0.7 | Auth middleware | 🔴 Critical | JWT access/refresh + tenant scope (company_id) |
| F-0.8 | RBAC middleware | 🔴 Critical | Role-based access: super_admin видит всё, остальные — свой company_id |
| F-0.9 | S3 file upload | 🟡 High | Базовый сервис загрузки файлов (MinIO dev / S3 prod) |
| F-0.10 | Error handling | 🟡 High | Стандартизация ошибок, validation, logging |

**Deliverable:** Проект запускается, есть auth, можно делать запросы к API.

---

## Фаза 1: Identity & Access (Спринты 3–4)

### Sprint 3 — Регистрация и вход

| # | Фича | Приоритет | Описание |
|---|-------|-----------|----------|
| F-1.1 | Регистрация хоста | 🔴 Critical | email, phone, org_name → OTP → Company + User(role=host) |
| F-1.2 | OTP верификация | 🔴 Critical | SMS/email код, expires, is_used |
| F-1.3 | Логин по OTP | 🔴 Critical | phone/email → OTP → JWT tokens |
| F-1.4 | Logout | 🟡 High | Инвалидация refresh token |
| F-1.5 | Страница регистрации (UI) | 🔴 Critical | Форма: email, phone, название организации |
| F-1.6 | Страница логина (UI) | 🔴 Critical | Ввод phone/email → OTP код → dashboard |

### Sprint 4 — Команда и документы

| # | Фича | Приоритет | Описание |
|---|-------|-----------|----------|
| F-1.7 | Приглашение в команду | 🟡 High | Host отправляет invite (email/phone, role) → токен → регистрация |
| F-1.8 | Управление ролями | 🟡 High | host, hostess, cleaner, sales_manager |
| F-1.9 | Загрузка документов | 🟡 High | Удостоверение, оферта → S3 |
| F-1.10 | Просмотр документов | 🟡 High | Каждый хост видит только свою компанию |
| F-1.11 | Скачивание оферты | 🟢 Medium | Download link |
| F-1.12 | Страница команды (UI) | 🟡 High | Список участников, invite form, роли |
| F-1.13 | Страница документов (UI) | 🟡 High | Upload, preview, download |
| F-1.14 | Super-admin: список компаний (UI) | 🟡 High | Видит все компании, может заходить в любую |

**Deliverable:** Хост регистрируется, входит, приглашает команду, загружает документы.

---

## Фаза 2: Property Core (Спринты 5–7)

### Sprint 5 — CRUD объекта

| # | Фича | Приоритет | Описание |
|---|-------|-----------|----------|
| F-2.1 | Миграции БД (Property) | 🔴 Critical | properties, property_photos, amenities, property_amenities, pricing_configs, seasonal_prices, discount_rules, property_audit_logs |
| F-2.2 | Создание объекта (API) | 🔴 Critical | Все поля, статус=new, UNIQUE(company_id, internal_name) |
| F-2.3 | Редактирование объекта (API) | 🔴 Critical | Partial update + audit log |
| F-2.4 | Загрузка фото (API) | 🔴 Critical | Multi-upload, sort_order, is_cover |
| F-2.5 | Справочник удобств (API) | 🟡 High | CRUD amenities + привязка к объекту |
| F-2.6 | Форма создания объекта (UI) | 🔴 Critical | Многошаговая форма: основное → адрес → детали → цены → фото → правила → удобства |

### Sprint 6 — Ценообразование и статусы

| # | Фича | Приоритет | Описание |
|---|-------|-----------|----------|
| F-2.7 | Настройка цен (API) | 🔴 Critical | base_price, weekend, extra_guest, deposit |
| F-2.8 | Сезонные цены (API) | 🟡 High | CRUD seasonal_prices (название, даты, цена) |
| F-2.9 | Скидки за длительность (API) | 🟡 High | CRUD discount_rules (от N ночей → % или фикс) |
| F-2.10 | Смена статуса (API) | 🔴 Critical | new→active, active→paused, active→archived, paused→active |
| F-2.11 | Приостановка приёма броней | 🔴 Critical | status=paused → блокирует новые брони |
| F-2.12 | Архивирование объекта | 🟡 High | status=archived → read-only |
| F-2.13 | Форма ценообразования (UI) | 🔴 Critical | Базовая цена, сезонные, скидки, доп гости |

### Sprint 7 — Списки, фильтры, шахматка

| # | Фича | Приоритет | Описание |
|---|-------|-----------|----------|
| F-2.14 | Список объектов (API) | 🔴 Critical | Pagination, сортировка по алфавиту, фильтры |
| F-2.15 | Фильтрация по internal_name | 🟡 High | Search/filter |
| F-2.16 | Карточка объекта (API + UI) | 🔴 Critical | Полная информация, фото, цены, статус, правила |
| F-2.17 | История изменений объекта (API + UI) | 🟡 High | property_audit_logs → timeline view |
| F-2.18 | Шахматка / Gantt Chart (UI) | 🔴 Critical | Объекты по Y-оси, даты по X-оси, сортировка по алфавиту |
| F-2.19 | Компонент шахматки | 🔴 Critical | React Gantt chart library (e.g. DHTMLX Gantt / custom) |

**Deliverable:** Хост добавляет объекты, настраивает цены, видит шахматку. Может приостановить/архивировать.

---

## Фаза 3: Booking Core (Спринты 8–11)

### Sprint 8 — Создание брони

| # | Фича | Приоритет | Описание |
|---|-------|-----------|----------|
| F-3.1 | Миграции БД (Booking) | 🔴 Critical | guests, bookings, group_bookings, booking_payments, booking_deposits, booking_files, booking_comments, booking_contracts, booking_audit_logs |
| F-3.2 | Создание брони (API) | 🔴 Critical | check_in/out, source, guest, проверка пересечений, статус=pending |
| F-3.3 | Автосоздание гостя | 🔴 Critical | При бронировании — если гостя нет → создать |
| F-3.4 | Проверка пересечений дат | 🔴 Critical | Нельзя забронировать занятые даты |
| F-3.5 | Калькулятор цены (API) | 🔴 Critical | seasonal + weekend + discount(nights) + extra_guests |
| F-3.6 | Форма создания брони (UI) | 🔴 Critical | Даты, гость, источник, калькулятор |

### Sprint 9 — Платежи, залоги, файлы

| # | Фича | Приоритет | Описание |
|---|-------|-----------|----------|
| F-3.7 | Добавить платёж (API) | 🔴 Critical | amount, type=payment, method, status |
| F-3.8 | Вернуть платёж (API) | 🟡 High | type=refund |
| F-3.9 | Добавить залог (API) | 🔴 Critical | amount, status=pending→paid |
| F-3.10 | Вернуть/удержать залог (API) | 🔴 Critical | returned / held / partially_held + reason |
| F-3.11 | Загрузка файлов к брони (API) | 🟡 High | S3 upload |
| F-3.12 | Комментарии к брони (API) | 🟡 High | CRUD |
| F-3.13 | Онлайн договор (API) | 🟡 High | Генерация из шаблона оферты хоста |
| F-3.14 | UI: платежи, залоги, файлы | 🔴 Critical | Табы в карточке брони |

### Sprint 10 — Редактирование, drag-n-drop, аудит

| # | Фича | Приоритет | Описание |
|---|-------|-----------|----------|
| F-3.15 | Редактирование брони (API) | 🔴 Critical | Все поля → audit log на каждое изменение |
| F-3.16 | Смена статуса брони (API) | 🔴 Critical | pending→confirmed→checked_in→checked_out→completed, cancel |
| F-3.17 | Перемещение брони (API) | 🔴 Critical | Move booking to another property → проверка пересечений → audit log (action=move) |
| F-3.18 | Drag-n-drop на шахматке (UI) | 🔴 Critical | Перетаскивание брони между объектами |
| F-3.19 | История изменений брони (API + UI) | 🟡 High | booking_audit_logs → timeline |
| F-3.20 | Цвет и иконка на Gantt (UI) | 🟡 High | gantt_color, gantt_icon → рендеринг на шахматке |

### Sprint 11 — Групповые брони и оптимизация

| # | Фича | Приоритет | Описание |
|---|-------|-----------|----------|
| F-3.21 | Групповое бронирование (API) | 🟡 High | adults + children → подбор объектов по capacity + proximity (геопозиция) |
| F-3.22 | UI: групповое бронирование | 🟡 High | Форма: кол-во людей → предложенные объекты → подтверждение |
| F-3.23 | Алгоритм оптимизации (API) | 🟡 High | Анализ коротких/длинных броней → рекомендации по перемещению |
| F-3.24 | UI: рекомендации оптимизации | 🟢 Medium | Панель с предложениями, подтверждение перемещений |
| F-3.25 | Список клиентов (API + UI) | 🟡 High | Имя, телефон, email |
| F-3.26 | Список заездов/выездов (API + UI) | 🟡 High | Сегодняшние check-in / check-out |
| F-3.27 | Список бронирований (API + UI) | 🟡 High | Таблица с фильтрами и поиском |

**Deliverable:** Полный цикл бронирования — от создания до checkout. Шахматка с drag-n-drop. Групповые брони. Оптимизация заполняемости.

---

## Фаза 4: Cleaning (Спринты 12–14)

### Sprint 12 — Задачи на уборку

| # | Фича | Приоритет | Описание |
|---|-------|-----------|----------|
| F-4.1 | Миграции БД (Cleaning) | 🔴 Critical | cleaning_tasks, cleaning_checklist_templates, cleaning_checklist_items, cleaning_reports, cleaning_report_photos, cleaning_report_checklist, cleaner_routes, cleaner_ratings |
| F-4.2 | Авто-создание задачи на checkout (API) | 🔴 Critical | BookingCheckedOut → CleaningTask(type=post_checkout) |
| F-4.3 | Заказ уборки во время брони (API) | 🟡 High | type=mid_stay / on_demand |
| F-4.4 | Назначение клинера (API) | 🔴 Critical | Assign cleaner → status=assigned |
| F-4.5 | Шаблоны чеклистов (API) | 🟡 High | CRUD templates + items per company |
| F-4.6 | Расписание уборок (API + UI) | 🔴 Critical | По дате + checkout time каждого объекта |

### Sprint 13 — Отчёты горничных

| # | Фича | Приоритет | Описание |
|---|-------|-----------|----------|
| F-4.7 | Отправка отчёта (API) | 🔴 Critical | Фото (bathroom/kitchen/bedroom) + чеклист + notes |
| F-4.8 | Верификация метаданных фото | 🟢 Medium | EXIF: lat/lng + timestamp → сравнение с property location + task time |
| F-4.9 | Статус уборки на шахматке (UI) | 🟡 High | Индикатор: нужна уборка / в процессе / убрано |
| F-4.10 | История уборок объекта (API + UI) | 🟡 High | Timeline по property_id |
| F-4.11 | UI: интерфейс клинера | 🔴 Critical | Мобильно-адаптивный: мои задачи, отправить отчёт, чеклист, фото |
| F-4.12 | UI: список уборок для хоста | 🔴 Critical | Все задачи, фильтры, статусы |

### Sprint 14 — Маршруты и KPI

| # | Фича | Приоритет | Описание |
|---|-------|-----------|----------|
| F-4.13 | Маршрут клинера (API) | 🟡 High | Оптимизация порядка задач по геопозиции объектов |
| F-4.14 | UI: карта маршрута | 🟡 High | Карта с точками + порядок + время |
| F-4.15 | Оценка клинера (API) | 🟡 High | score 1-5, review, после каждой задачи |
| F-4.16 | KPI метрики (API) | 🟢 Medium | Скорость, качество, кол-во задач, средний рейтинг |
| F-4.17 | UI: профиль клинера с KPI | 🟢 Medium | Дашборд с метриками и историей оценок |

**Deliverable:** Авто-уборки после checkout, отчёты горничных с фото и чеклистом, маршрутизация, KPI.

---

## Фаза 5: Analytics (Спринты 15–16)

### Sprint 15 — Финансовая статистика

| # | Фича | Приоритет | Описание |
|---|-------|-----------|----------|
| F-5.1 | Расчёт метрик (API) | 🔴 Critical | Доход, ADR, RevPAR, расходы, прибыль, комиссия, простои, ср. длительность |
| F-5.2 | Фильтрация по периоду | 🔴 Critical | Неделя, месяц, квартал, год, custom range |
| F-5.3 | Детализация | 🟡 High | По дням, неделям, месяцам |
| F-5.4 | Фильтр по объекту | 🟡 High | Выбрать конкретный property |
| F-5.5 | Фильтр по источнику | 🟡 High | booking / airbnb / direct / all |
| F-5.6 | По умолчанию today - 30 days | 🔴 Critical | Default filter |

### Sprint 16 — Дашборд и графики

| # | Фича | Приоритет | Описание |
|---|-------|-----------|----------|
| F-5.7 | Таблица статистики (UI) | 🔴 Critical | Объект → доход, ADR/RevPAR, расходы, прибыль, комиссия, простои, ср. длительность |
| F-5.8 | Графики доходов (UI) | 🟡 High | Line/bar chart по выбранному периоду |
| F-5.9 | Графики заполняемости (UI) | 🟡 High | Occupancy rate по объектам |
| F-5.10 | Экспорт отчётов | 🟢 Medium | CSV / Excel |
| F-5.11 | Super-admin: глобальная аналитика | 🟡 High | Кросс-компанийная статистика |

**Deliverable:** Полноценный аналитический дашборд с фильтрами, графиками, таблицами.

---

## Фаза 6: AI Migration (Спринты 17–18)

### Sprint 17 — AI Service скелет

| # | Фича | Приоритет | Описание |
|---|-------|-----------|----------|
| F-6.1 | AI Service скелет | 🔴 Critical | LangGraph + FastAPI, Docker |
| F-6.2 | Парсинг URL объявления | 🔴 Critical | Scrape: Booking, Airbnb, Krisha → structured data |
| F-6.3 | Маппинг на Property schema | 🔴 Critical | AI извлекает поля → маппит на наш формат |
| F-6.4 | Prompt от пользователя | 🟡 High | Доп контекст хоста → merge с parsed data |

### Sprint 18 — UI и Review flow

| # | Фича | Приоритет | Описание |
|---|-------|-----------|----------|
| F-6.5 | UI: вставить ссылку + промт | 🔴 Critical | Форма: URL + textarea для доп инфо |
| F-6.6 | UI: preview заполненной формы | 🔴 Critical | Хост ревьюит → редактирует → подтверждает |
| F-6.7 | Создание объекта из AI данных | 🟡 High | Confirm → create property через PMS API |
| F-6.8 | Batch import | 🟢 Medium | Несколько ссылок → несколько объектов |

**Deliverable:** Хост вставляет ссылку на объявление → AI заполняет форму → хост подтверждает → объект создан.

---

## Фаза 7: Polish & Launch (Спринты 19–20)

### Sprint 19 — UX и оптимизация

| # | Фича | Приоритет | Описание |
|---|-------|-----------|----------|
| F-7.1 | Мобильная адаптация | 🔴 Critical | Responsive: шахматка, формы, дашборд |
| F-7.2 | Нотификации (email/push) | 🟡 High | Новая бронь, checkout reminder, уборка назначена |
| F-7.3 | Оптимизация запросов | 🟡 High | Indexes, query optimization, caching (Redis) |
| F-7.4 | Rate limiting | 🟡 High | API rate limits |
| F-7.5 | Locale / i18n | 🟢 Medium | RU / KZ / EN |

### Sprint 20 — Тестирование и деплой

| # | Фича | Приоритет | Описание |
|---|-------|-----------|----------|
| F-7.6 | E2E тесты | 🔴 Critical | Критические flows: регистрация → объект → бронь → уборка |
| F-7.7 | Load testing | 🟡 High | k6 / locust |
| F-7.8 | Staging deploy | 🔴 Critical | Staging environment |
| F-7.9 | Production deploy | 🔴 Critical | Kubernetes / Docker Swarm |
| F-7.10 | Мониторинг | 🟡 High | Sentry, Prometheus, Grafana |
| F-7.11 | Документация API | 🟡 High | OpenAPI / Swagger (auto from FastAPI) |

**Deliverable:** Production-ready PMS.

---

## Зависимости между фазами

```
Phase 0 (Foundation)
  │
  ▼
Phase 1 (Identity) ──────────────────────────────┐
  │                                               │
  ▼                                               │
Phase 2 (Property) ─────────────┐                 │
  │                              │                 │
  ▼                              ▼                 ▼
Phase 3 (Booking) ──────► Phase 4 (Cleaning)    Phase 6 (AI)
  │                              │
  ▼                              │
Phase 5 (Analytics) ◄────────────┘
  │
  ▼
Phase 7 (Polish & Launch)
```

---

## Сводка

| Метрика | Значение |
|---------|----------|
| Всего фаз | 8 (0–7) |
| Всего спринтов | 20 (по 1 неделе) |
| Всего фич | ~80 |
| 🔴 Critical | ~40 |
| 🟡 High | ~30 |
| 🟢 Medium | ~10 |
| Срок (оценка) | ~5 месяцев |

---

## MVP (Minimum Viable Product)

Если нужен быстрый выход — **MVP за 11 спринтов** (фазы 0–3):

| Что входит | Что НЕ входит |
|------------|---------------|
| ✅ Регистрация, авторизация, роли | ❌ Cleaning (manual) |
| ✅ Объекты со всеми полями | ❌ Analytics (позже) |
| ✅ Шахматка / Gantt Chart | ❌ AI Migration (позже) |
| ✅ Брони + платежи + залоги | ❌ KPI клинеров |
| ✅ Drag-n-drop | ❌ Маршрутизация |
| ✅ Групповые брони | ❌ Нотификации |
| ✅ Audit logs | ❌ i18n |

**MVP срок: ~2.5 месяца**
