#!/bin/sh
# Apply migrations before the API starts serving.
#
# Alembic is the single source of truth for schema on the server — the app never
# creates tables itself. If a migration fails the container exits instead of
# serving against a schema it does not match.
set -e

echo "Running database migrations..."
alembic upgrade head
echo "Migrations complete."

exec "$@"
