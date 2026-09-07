# Day PMS — Property Management System

Multi-tenant SaaS for short-term rental management: bookings, properties, cleaning, analytics,
dynamic pricing, an AI assistant (Telegram bot + Mini App), lead exchange with colleague groups,
and channel management via Channex. Six live apartments run on it in production.

## Architecture

- **Backend:** FastAPI + SQLAlchemy async + PostgreSQL, Clean Architecture with DDD
- **Frontend:** React 19 + TypeScript + TanStack Router/Query + Tailwind CSS 4
- **AI service:** separate FastAPI app in `ai-service/` (`:8001`, `AI_SERVICE_URL`) that parses OTA listings for import. Same ruff/pytest setup as the backend.
- **Infra:** Docker Compose (PostgreSQL 16, Redis, MinIO); production via Dokploy on Hetzner, see `DEPLOY.md`
- **Other dirs:** `docs/` (specs, PRD, Channex design), `openrouter-agent/` (standalone TypeScript agent experiment, not wired into the product), `scripts/`, `docker/`

## Backend (`day-backend/`)

```
app/
├── domain/           # Entities, value objects, repository interfaces (per bounded context)
├── application/      # Use-case services (orchestrate domain logic)
├── infrastructure/   # SQLAlchemy models, repository implementations, database setup
└── presentation/     # FastAPI routes (api/v1/) and Pydantic schemas
```

Bounded contexts (`app/domain/`): `auth`, `property`, `booking`, `cleaning`, `analytics`, `pricing`,
`assistant` (AI agent + tools), `messaging` (Telegram / WhatsApp via Whapi), `leads` (colleague lead
exchange + guest blacklist), `channex`, `settings`, `ai_migration` (listing import via `ai-service`).

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
├── stores/        # Global state
└── locales/       # i18n strings (i18n.ts)
```

`routes/tma.tsx` is the Telegram Mini App entry.

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

## Status

Core PMS (auth, properties, bookings, cleaning, analytics) is complete and in production.
Shipped on top of it: pricing suggestions, AI assistant with Telegram bot and Mini App, lead
exchange + guest blacklist, listing import through `ai-service`. Channex integration works on
staging and waits on certification before production. Curated project knowledge lives in
`.omc/wiki/` (see below).

## Key Patterns

- Multi-tenancy: all queries scoped by `company_id` header
- Repository pattern with abstract interfaces in domain, SQL implementations in infrastructure
- Dependency injection: services receive repository instances
- Audit logging on domain changes
- Commission rates: Booking.com 15%, Airbnb 3%

## Git Workflow (GitFlow)

Full rules live in `CONTRIBUTING.md`. The short version an agent needs:

- `main` — production only. Every commit is a tagged release. Never commit or push here.
- `develop` — integration branch. Next release accumulates here. Never push directly.
- `feature/*`, `fix/*`, `refactor/*`, `test/*`, `docs/*`, `ci/*` — branch off `develop`, PR back into `develop`.
- `release/<version>` — branch off `develop`, PR into `main`, then a second PR back into `develop`. Tag `v<version>` on `main` after merge.
- `hotfix/<version>` — branch off `main`, PR into `main`, then a second PR back into `develop`. The back-merge is mandatory.

Before editing anything, confirm the current branch. If it is `main` or `develop`, create a
working branch first — do not start editing in place.

```bash
git status --short --branch
git checkout develop && git pull && git checkout -b feature/<slug>
```

Commits: Conventional Commits — `<type>(<scope>): <what changed>`.
Scopes in use: `booking`, `property`, `cleaning`, `analytics`, `pricing`, `leads`, `assistant`, `bot`,
`miniapp`, `messaging`, `channex`, `ai-service`, `ui`, `api`, `db`, `deploy`, `ci`.

Commit and push only when the user asks. Open PRs against `develop`, not `main`
(except `release/*` and `hotfix/*`).

## Working with AI agents on this repo

Rules that came out of things going wrong here, not generic advice.

**Read the graph before reading files, when it is up.** `semantic_search_nodes` / `query_graph`
beat Grep for anything structural. See the MCP section below. If the `code-review-graph` server
failed to connect this session, go straight to Grep/Glob and say so; do not wait on it.

**Small, reviewable diffs.** One PR = one intent. A 1000-line AI-written PR gets rubber-stamped,
and rubber-stamped code is how bugs reach the six live apartments in production. If a task grows
past ~400 lines of diff, split it into PRs that each stand on their own.

**Never claim done without evidence.** "Done" means a command was run and its output seen:
`ruff check .`, `pytest`, `pytest -m integration`, `npm run build`, `npm run lint`. Compiling is
not passing. Passing unit tests is not passing integration tests.

**Placeholders are blockers, not progress.** `TODO`, `pass  # implement later`, `test.skip`,
`.only`, an empty `except`, a hardcoded return that makes a test green — none of these ship.
Before reporting completion, grep the diff for them.

**Tests belong in the same commit as the change.** A bug fix without a test that fails before
the fix is not a fix — it is a coincidence.

**Multi-tenancy is not optional.** Every new query, repository method, and endpoint scopes by
`company_id`. A missing filter leaks one client's bookings into another client's screen. This is
the single most damaging class of bug in this codebase — check it on every data-access change.

**Money and destructive actions need a guard.** Anything that changes a price, a paid amount, a
deposit, or deletes a record goes through explicit confirmation — this is already the contract
for the assistant tools (see the assistant wiki page). New tools follow it.

**Migrations: one head, tested against real data.** Generate the Alembic revision in the same
branch as the model change. After merging, check `alembic heads` — two heads means someone
merged two branches with migrations and a merge revision is needed. Test against a copy of the
production dump, not an empty database.

**Don't invent API surface.** Before using an SDK, framework, or library API, check the actual
docs (context7) or the installed source. A plausible-looking method name that does not exist
costs more than the lookup did.

**Say what was not done.** Partial work reported as complete is worse than partial work reported
honestly. Name the skipped part and why.

## MCP Tools: code-review-graph

**This project has a knowledge graph. When the `code-review-graph` server is connected, use its
tools BEFORE Grep/Glob/Read to explore the codebase.** The graph is faster, cheaper (fewer tokens), and gives
you structural context (callers, dependents, test coverage) that file
scanning cannot.

### When to use graph tools FIRST

- **Exploring code**: `semantic_search_nodes` or `query_graph` instead of Grep
- **Understanding impact**: `get_impact_radius` instead of manually tracing imports
- **Code review**: `detect_changes` + `get_review_context` instead of reading entire files
- **Finding relationships**: `query_graph` with callers_of/callees_of/imports_of/tests_for
- **Architecture questions**: `get_architecture_overview` + `list_communities`

Fall back to Grep/Glob/Read when the graph doesn't cover what you need (migrations, configs, comments, free-text search).

### Key Tools

| Tool | Use when |
|------|----------|
| `detect_changes` | Reviewing code changes — gives risk-scored analysis |
| `get_review_context` | Need source snippets for review — token-efficient |
| `get_impact_radius` | Understanding blast radius of a change |
| `get_affected_flows` | Finding which execution paths are impacted |
| `query_graph` | Tracing callers, callees, imports, tests, dependencies |
| `semantic_search_nodes` | Finding functions/classes by name or keyword |
| `get_architecture_overview` | Understanding high-level codebase structure |
| `refactor_tool` | Planning renames, finding dead code |

### Workflow

1. The graph auto-updates on file changes (via hooks).
2. Use `detect_changes` for code review.
3. Use `get_affected_flows` to understand impact.
4. Use `query_graph` pattern="tests_for" to check coverage.

## Project wiki (`.omc/wiki/`)

Curated knowledge that is not derivable from the code lives in `.omc/wiki/` (gitignored, local).
Search it with `wiki_query`, browse with `wiki_list`, read with `wiki_read`. Pages worth knowing:

- `assistant.md` — the assistant contract: reads on its own, changes only with confirmation
- `hetzner-dokploy.md` — production layout and the deploy order (dump first)
- `ota.md` — what OTAs expose automatically and what they do not
- `page-18dc03da.md` — which tests check what, and where they trip

When the user says "обнови wiki" / "update wiki": promote findings from this session into the
relevant page via `wiki_ingest`, and add a new page only for a fact that has no home yet.
