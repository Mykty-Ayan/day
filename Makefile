.PHONY: up down build logs migrate fresh

# Docker commands
up:
	docker compose -f docker/docker-compose.yml -f docker/docker-compose.dev.yml up -d

down:
	docker compose -f docker/docker-compose.yml -f docker/docker-compose.dev.yml down

build:
	docker compose -f docker/docker-compose.yml build

logs:
	docker compose -f docker/docker-compose.yml -f docker/docker-compose.dev.yml logs -f

# Backend
migrate:
	docker compose -f docker/docker-compose.yml -f docker/docker-compose.dev.yml exec backend alembic upgrade head

migrate-generate:
	docker compose -f docker/docker-compose.yml -f docker/docker-compose.dev.yml exec backend alembic revision --autogenerate -m "$(msg)"

# Development
backend-shell:
	docker compose -f docker/docker-compose.yml -f docker/docker-compose.dev.yml exec backend bash

frontend-shell:
	docker compose -f docker/docker-compose.yml -f docker/docker-compose.dev.yml exec frontend sh

# Fresh start
fresh: down
	docker compose -f docker/docker-compose.yml -f docker/docker-compose.dev.yml up -d --build
