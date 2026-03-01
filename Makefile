.PHONY: up down logs migrate seed backend frontend

DC = docker compose -f docker/docker-compose.yml

# Infrastructure (PostgreSQL, Redis, MinIO)
up:
	$(DC) up -d

down:
	$(DC) down

logs:
	$(DC) logs -f

# Database migrations (run locally)
migrate:
	cd day-backend && uv run alembic -x sqlalchemy.url=postgresql+asyncpg://day:changeme@localhost:5432/day upgrade head

# Seed demo data
seed:
	cd day-backend && env $$(cat local.env | grep -v '^#' | xargs) uv run python -m app.infrastructure.seed

# Local development
backend:
	cd day-backend && env $$(cat local.env | grep -v '^#' | xargs) uv run uvicorn app.main:app --reload

frontend:
	cd day-frontend && npm run dev
