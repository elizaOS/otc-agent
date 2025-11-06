#!/bin/bash

# Ensure PostgreSQL is running for OTC Trading Desk
# Starts the container if it's not running, waits for it to be healthy

set -e

DB_PORT="${VENDOR_OTC_DESK_DB_PORT:-${POSTGRES_DEV_PORT:-5439}}"

echo "🔍 Ensuring PostgreSQL is ready..."

# Check if container exists
if ! docker ps -a --format '{{.Names}}' | grep -q '^otc-postgres$'; then
  echo "📦 PostgreSQL container doesn't exist, creating..."
  cd "$(dirname "$0")/.."
  docker compose -f docker-compose.localnet.yml up -d postgres
else
  # Container exists, check if it's running
  if ! docker ps --format '{{.Names}}' | grep -q '^otc-postgres$'; then
    echo "▶️  Starting PostgreSQL container..."
    docker start otc-postgres
  else
    echo "✅ PostgreSQL container is already running"
  fi
fi

# Wait for database to be ready
echo "⏳ Waiting for PostgreSQL to accept connections..."
RETRIES=0
MAX_RETRIES=30
while [ $RETRIES -lt $MAX_RETRIES ]; do
  if docker exec otc-postgres pg_isready -U eliza -d eliza >/dev/null 2>&1; then
    echo "✅ PostgreSQL is ready on port $DB_PORT!"
    exit 0
  fi
  RETRIES=$((RETRIES+1))
  if [ $RETRIES -eq $MAX_RETRIES ]; then
    echo "❌ Timeout waiting for PostgreSQL"
    echo "💡 Check logs with: docker logs otc-postgres"
    exit 1
  fi
  sleep 1
  if [ $((RETRIES % 5)) -eq 0 ]; then
    echo "  Still waiting... ($RETRIES/$MAX_RETRIES)"
  fi
done

