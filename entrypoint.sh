#!/bin/sh
set -eu

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is required before starting the server." >&2
  exit 1
fi

echo "Applying database migrations..."
./node_modules/.bin/prisma migrate deploy

echo "Starting server..."
exec "$@"
