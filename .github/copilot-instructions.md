# Copilot Instructions for Day PMS

## Repository Overview

This is a **Property Management System (PMS)** for short-term rental businesses. It's a monorepo containing:
- **Backend**: FastAPI with Clean Architecture pattern
- **Frontend**: React + TypeScript + Vite + TanStack Router
- **Infrastructure**: Docker Compose with PostgreSQL, Redis

The system manages properties, bookings, cleaning schedules, analytics, and team access with multi-tenancy (company-scoped).

## Tech Stack

### Backend (day-backend/)
- **Language**: Python 3.12
- **Framework**: FastAPI
- **ORM**: SQLAlchemy 2.0 with async support (asyncpg)
- **Database**: PostgreSQL 16
- **Migrations**: Alembic
- **Authentication**: JWT with python-jose
- **Linting**: Ruff (line length: 120)
- **Testing**: pytest with pytest-asyncio

### Frontend (day-frontend/)
- **Language**: TypeScript 5.9
- **Framework**: React 19
- **Build Tool**: Vite 7
- **Routing**: TanStack Router
- **State Management**: TanStack Query
- **Styling**: Tailwind CSS 4 + Framer Motion
- **UI Components**: Radix UI, Lucide React icons
- **Testing**: Playwright for E2E tests
- **Linting**: ESLint 9

## Architecture

The backend follows **Clean Architecture** with these layers:
- `app/domain/`: Business entities and domain logic
- `app/application/`: Use cases and business rules
- `app/infrastructure/`: Database models, repositories, external services
- `app/presentation/`: API routes and request/response models

Domains: Identity & Access, Property, Booking, Cleaning, Analytics

Multi-tenancy: All entities have `company_id` for data isolation. Roles: super_admin (platform-wide), host (owner), hostess (operations), cleaner, sales_manager.

## Build & Run Instructions

### Prerequisites
- Python 3.12
- Node.js 20
- Docker & Docker Compose (for local development)
- PostgreSQL 16 (if running without Docker)

### Development with Docker (Recommended)

**Start all services:**
```bash
make up
# or: docker compose -f docker/docker-compose.yml -f docker/docker-compose.dev.yml up -d
```

**Stop services:**
```bash
make down
```

**View logs:**
```bash
make logs
```

**Fresh start (rebuild everything):**
```bash
make fresh
```

### Backend Development (Local)

**Setup:**
```bash
cd day-backend
pip install -r requirements.txt
```

**Run migrations:**
```bash
# With Docker:
make migrate

# Local (set DATABASE_URL in environment):
uv run alembic upgrade head
```

**Generate new migration:**
```bash
make migrate-generate msg="your migration message"
```

**Run backend server:**
```bash
cd day-backend
env $(cat local.env | grep -v '^#' | xargs) uv run uvicorn app.main:app --reload
```

**Lint backend:**
```bash
cd day-backend
ruff check .
```

**Run backend tests:**
```bash
cd day-backend
pytest tests/ -v
# Tests require PostgreSQL running on localhost:5432 with DATABASE_URL environment variable
```

### Frontend Development

**Install dependencies:**
```bash
cd day-frontend
npm ci  # Use 'ci' in CI/CD, 'install' for local development
```

**Run dev server:**
```bash
cd day-frontend
npm run dev
```

**Build:**
```bash
cd day-frontend
npm run build
```

**Lint:**
```bash
cd day-frontend
npm run lint
```

**Type check:**
```bash
cd day-frontend
npx tsc --noEmit
```

**Run E2E tests:**
```bash
cd day-frontend
npm run test:e2e  # Run all Playwright tests
npm run test:api  # Run API tests only
npm run test:ui   # Run UI tests only
npm run test:e2e:headed  # Run with browser visible
npm run test:e2e:report  # Show test report
```

## CI/CD Pipeline

The `.github/workflows/ci.yml` runs on push/PR to main:

1. **backend-lint**: Ruff linting
2. **backend-test**: pytest with PostgreSQL service (requires tests to pass)
3. **frontend-lint**: ESLint + TypeScript type checking
4. **frontend-build**: Build frontend bundle
5. **docker-build**: Build Docker images for both services

**Important**: All jobs must pass for CI to succeed. Backend tests require a PostgreSQL service running on port 5432.

## Project Layout

### Root Files
- `Makefile` - Docker commands and development shortcuts
- `STYLES.md` - Design system and UI guidelines (Tailwind classes, colors, spacing)
- `domain-model.md` - Complete domain model with all entities and relationships
- `roadmap.md` - Feature roadmap and sprint planning
- `erd.mermaid` / `erd-summary.md` - Database schema diagrams
- `.editorconfig` - Editor configuration

### Backend Structure (day-backend/)
```
app/
├── domain/          # Domain entities and business logic
│   ├── entities/    # Common entities
│   ├── property/    # Property domain
│   ├── booking/     # Booking domain
│   └── cleaning/    # Cleaning domain
├── application/     # Use cases and business rules
├── infrastructure/  # Database, repositories, external services
├── presentation/    # API routes, DTOs, request/response models
├── config.py        # Settings and configuration
└── main.py          # FastAPI application entry point
alembic/             # Database migrations
tests/               # Backend tests
requirements.txt     # Python dependencies
ruff.toml           # Ruff linter configuration
```

### Frontend Structure (day-frontend/)
```
src/
├── components/      # Reusable React components
├── pages/          # Page components
├── hooks/          # Custom React hooks
├── api/            # API client and types
├── lib/            # Utilities and helpers
└── main.tsx        # Application entry point
tests/
├── api/            # API tests
└── e2e/            # End-to-end UI tests
public/             # Static assets
```

### Docker Structure (docker/)
```
docker/
├── docker-compose.yml       # Production compose file
├── docker-compose.dev.yml   # Development overrides
└── (service configs)
```

## Development Guidelines

### Code Style

**Backend (Python):**
- Line length: 120 characters
- Follow Clean Architecture principles
- Use type hints
- Ruff enforces imports sorting, style (E, F, I rules)

**Frontend (TypeScript/React):**
- Follow design system in `STYLES.md`
- Use Tailwind utility classes
- Prefer composition over inheritance
- Use TanStack Query for data fetching
- Use TanStack Router for navigation

### Design System (STYLES.md)
- **Primary action**: `bg-black text-white hover:bg-gray-800`
- **Border radius**: Cards use `rounded-2xl` or `rounded-3xl`, buttons use `rounded-xl`
- **Shadows**: Default is `shadow-md`, elevated is `shadow-lg`
- **Icons**: Use Lucide React icons
- **Animations**: Framer Motion for smooth transitions

### Database Migrations
- **ALWAYS** create migrations with descriptive names
- Test migrations both up and down
- Review auto-generated migrations for correctness
- Backend tests expect migrations to be applied

### Testing
- Backend: Use pytest with async fixtures
- Frontend: Use Playwright for E2E tests
- Tests must clean up after themselves
- CI runs tests with isolated PostgreSQL database

### Git Workflow
- Main branch is `main`
- CI runs on all pushes and PRs to main
- All CI checks must pass before merge

## Key Facts

1. **Multi-tenancy**: Every query must filter by `company_id` except for super_admin role
2. **Authentication**: JWT-based with access/refresh tokens, OTP verification for login
3. **File storage**: Uses S3-compatible storage (MinIO in dev, S3 in prod)
4. **Database**: PostgreSQL with async SQLAlchemy (asyncpg driver)
5. **Environment files**: Backend uses `.env` and `local.env` for configuration
6. **Port defaults**: Backend runs on 8000, Frontend on 5173 (Vite default)
7. **Build time**: Frontend build takes ~30-60 seconds, backend tests take ~10-20 seconds

## Common Issues & Solutions

1. **Backend won't start**: Ensure PostgreSQL is running and DATABASE_URL is set
2. **Migration conflicts**: If migrations conflict, regenerate after pulling latest
3. **Frontend build fails**: Run `npm ci` to ensure clean dependency installation
4. **Tests fail in CI**: Check PostgreSQL service is configured correctly in workflow
5. **Docker issues**: Use `make fresh` to rebuild everything from scratch

## Validation Steps

Before submitting changes:
1. Run appropriate linter (`ruff check .` for backend, `npm run lint` for frontend)
2. Run type checker for frontend: `npx tsc --noEmit`
3. Run relevant tests (backend: `pytest`, frontend: `npm run test:e2e`)
4. If modifying API, test with Playwright API tests: `npm run test:api`
5. If modifying database, ensure migrations work: `alembic upgrade head`
6. Review STYLES.md if making UI changes to ensure design consistency

## Trust These Instructions

These instructions have been validated against the actual codebase. When in doubt:
- Start with the commands documented here
- Refer to `domain-model.md` for business logic questions
- Check `STYLES.md` for UI/UX decisions
- Only search the codebase if information here is incomplete or appears incorrect
