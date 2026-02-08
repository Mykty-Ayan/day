backend
```sh
env $(cat local.env | grep -v '^#' | xargs) uv run uvicorn app.main:app --reload
```

alembic
```sh
 uv run alembic -x sqlalchemy.url=postgresql+asyncpg://day:changeme@localhost:5432/day upgrade head
 ```

 frontend
 ```sh
 npm run dev
 ```