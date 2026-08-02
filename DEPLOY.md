# Deploying Day PMS on Hetzner with Dokploy

Everything the stack needs is in `docker-compose.prod.yml`. Dokploy supplies
Traefik, TLS certificates and the deploy trigger; this file describes the parts
that are ours.

## 1. Prepare the repository access

Dokploy pulls from git. Either connect the GitHub account in
**Settings → Git** or add a deploy key for `Mykty-Ayan/day`.

## 2. Create the application

**Projects → Create project** (`day-pms`) → **Create service → Compose**.

| Field | Value |
|---|---|
| Repository | `Mykty-Ayan/day` |
| Branch | `main` |
| Compose path | `docker-compose.prod.yml` |

## 3. Set the variables

Copy `.env.production.example` into the **Environment** tab and fill in every
blank. Generate each secret on the server:

```sh
openssl rand -base64 36
```

`POSTGRES_PASSWORD`, `JWT_SECRET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`,
`TELEGRAM_WEBHOOK_SECRET` and `WHAPI_WEBHOOK_SECRET` have no defaults on
purpose — the stack refuses to start without them rather than booting with a
value someone could guess.

`VITE_API_URL` is compiled into the frontend bundle. Changing it later requires
a rebuild, not a restart.

## 4. Attach the domains

In the **Domains** tab, one entry per service:

| Service | Host | Container port |
|---|---|---|
| `frontend` | `app.<your-domain>` | 80 |
| `backend` | `api.<your-domain>` | 8000 |
| `minio` | `files.<your-domain>` | 9000 |

Enable HTTPS on all three; Dokploy requests the certificates. The `minio` entry
is what makes uploaded photos load in a browser — it must match
`S3_PUBLIC_ENDPOINT`.

Point the DNS A records at the Hetzner box before deploying, or certificate
issuance fails and you will be debugging the wrong layer.

## 5. Deploy

Press **Deploy**. On first boot the backend container runs
`alembic upgrade head` through its entrypoint, so the schema is created before
the API serves a single request. If a migration fails the container exits — the
API never runs against a schema it does not match.

Check `https://api.<your-domain>/api/v1/health` before anything else.

## 6. Create the first account

Registration creates a company and its owner in one step:

```sh
curl -X POST https://api.<your-domain>/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"owner@example.com","password":"<strong-password>","company_name":"Their company"}'
```

Everyone else — managers, cleaners — is created by that owner from
**Settings → Team & API keys**. There is deliberately no second public
registration path.

## 7. Issue the bots' keys

Same page, **Service API keys**. Give each bot only what it needs:

| Bot | Scopes |
|---|---|
| Telegram (host) | `properties:read`, `bookings:read`, `bookings:write`, `analytics:read`, `messaging:send` |
| WhatsApp (guest) | `properties:read`, `bookings:read`, `bookings:write`, `messaging:send` |

The key is shown once. It authenticates as `X-API-Key` and carries no role, so
it can never reach team or key administration regardless of scopes.

## Backups

The `db-backup` service runs `pg_dump -Fc` every `BACKUP_INTERVAL_SECONDS`
(default: daily) into the `postgres_backups` volume and deletes dumps older
than `BACKUP_RETENTION_DAYS`.

**A backup that only exists on the same machine is not a backup.** Pull them
off the host on a schedule, from your own machine:

```sh
ssh root@<host> "docker run --rm -v day-pms_postgres_backups:/b alpine \
  sh -c 'ls -t /b/*.dump | head -1 | xargs cat'" > day-latest.dump
```

Restore into a running stack:

```sh
docker compose -f docker-compose.prod.yml cp day-latest.dump postgres:/tmp/
docker compose -f docker-compose.prod.yml exec postgres \
  pg_restore -U day -d day --clean --if-exists /tmp/day-latest.dump
```

Rehearse the restore once before you need it.

## Updating

Push to `main`; Dokploy redeploys (enable **Auto Deploy** for the webhook).
Migrations run on every boot and are idempotent, so a redeploy with no new
migration is a no-op.

## Operational notes

- **Logs**: Dokploy's log viewer, or `docker compose logs -f backend`. The
  backend emits one JSON line per request with method, path, status and
  duration.
- **Rate limiting** is Redis-backed (100 GET / 30 mutating requests per minute).
  If Redis is unreachable the limiter fails open — requests are served
  unthrottled rather than dropped. Watch for `Redis unavailable for rate
  limiting` in the logs.
- **Deactivating an account** takes effect immediately: account state is checked
  on every request, so an already-issued token stops working.
- **No error tracker is wired up yet.** Until one is, container logs are the
  only place a 500 is visible.
- **AI import is not in this stack.** `ai-service/` needs an LLM provider key
  and is left out deliberately; the AI import screens will fail against this
  deployment until it is added and `AI_SERVICE_URL` points at it.
