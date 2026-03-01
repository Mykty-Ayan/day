## Local Run

Backend:
```sh
cd day-backend
env $(cat local.env | grep -v '^#' | xargs) uv run --with-requirements requirements.txt uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Frontend:
```sh
cd day-frontend
npm run dev -- --host 0.0.0.0 --port 3000
```

Migrations:
```sh
cd day-backend
uv run --with-requirements requirements.txt alembic -x sqlalchemy.url=postgresql+asyncpg://day:changeme@localhost:5432/day upgrade head
```

## Seed Kazakhstan Demo Data

Default seed (creates demo user + Kazakhstan data):
```sh
make seed
```

Seed for your existing local account/company:
```sh
cd day-backend
SEED_USER_EMAIL=you@example.com SEED_USER_PASSWORD=your_password env $(cat local.env | grep -v '^#' | xargs) uv run --with-requirements requirements.txt python -m app.infrastructure.seed
```

If the local password is unknown and login fails, force-reset it during seed:
```sh
cd day-backend
SEED_USER_EMAIL=you@example.com SEED_USER_PASSWORD=your_new_password SEED_FORCE_PASSWORD_RESET=true env $(cat local.env | grep -v '^#' | xargs) uv run --with-requirements requirements.txt python -m app.infrastructure.seed
```
