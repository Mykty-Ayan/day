# Day PMS — Property Management System

Multi-tenant SaaS for short-term rental management (bookings, properties, cleaning, analytics).

## Architecture

- **Backend:** FastAPI + SQLAlchemy async + PostgreSQL, Clean Architecture with DDD
- **Frontend:** React 19 + TypeScript + TanStack Router/Query + Tailwind CSS 4
- **Infra:** Docker Compose (PostgreSQL 16, Redis, MinIO)

## Backend (`day-backend/`)

```
app/
├── domain/           # Entities, value objects, repository interfaces (per bounded context)
├── application/      # Use-case services (orchestrate domain logic)
├── infrastructure/   # SQLAlchemy models, repository implementations, database setup
└── presentation/     # FastAPI routes (api/v1/) and Pydantic schemas
```

Bounded contexts: `property`, `booking`, `cleaning`, `analytics`, identity/access.

- Linter: `ruff` (line-length 120, Python 3.12, rules: E, F, I)
- Migrations: Alembic (`alembic/`)
- Config: `app/config.py` (Pydantic settings from env vars)
- Entry point: `app/main.py` → `create_app()`

### Testing

```bash
pytest                    # Unit tests only (integration excluded by default)
pytest -m integration     # Integration tests only (require running DB)
pytest -m ""              # All tests
```

- Unit tests use in-memory fakes (no DB required)
- Integration tests (`@pytest.mark.integration`) need PostgreSQL
- Config: `pyproject.toml` — `addopts = "-m 'not integration'"`

## Frontend (`day-frontend/`)

```
src/
├── routes/        # TanStack Router file-based routes (auto-generates routeTree.gen.ts)
├── pages/         # Page components
├── components/    # UI components organized by domain
├── api/           # Axios API client (client.ts + per-domain modules)
├── hooks/         # TanStack Query hooks (useProperties, useBookings, etc.)
├── types/         # TypeScript interfaces
└── stores/        # Global state
```

```bash
npm run dev        # Vite dev server
npm run build      # TypeScript check + Vite build
npm run lint       # ESLint
npm run test:e2e   # Playwright (all)
npm run test:api   # Playwright API tests
npm run test:ui    # Playwright E2E UI tests
```

## Running

```bash
make up            # Start all services via Docker Compose
make migrate       # Run Alembic migrations
make down          # Stop services
```

Ports: Backend `:8000` (API at `/api/v1`), Frontend `:3000`, PostgreSQL `:5432`, Redis `:6379`, MinIO `:9000`

## Phases

- Phase 0-1: Foundation + Auth (complete)
- Phase 2: Property Core (complete)
- Phase 3: Booking Core (complete)
- Phase 4: Cleaning (complete)
- Phase 5: Analytics (complete)
- Phase 6: AI Migration (planned)
- Phase 7: Polish & Launch (planned)

## Key Patterns

- Multi-tenancy: all queries scoped by `company_id` header
- Repository pattern with abstract interfaces in domain, SQL implementations in infrastructure
- Dependency injection: services receive repository instances
- Audit logging on domain changes
- Commission rates: Booking.com 15%, Airbnb 3%
