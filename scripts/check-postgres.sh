#!/bin/bash

# Check if PostgreSQL is ready for the OTC Trading Desk
# Uses centralized port configuration from config/ports.ts

set -e

# Get the database port (default 5439)
DB_PORT="${VENDOR_OTC_DESK_DB_PORT:-${POSTGRES_DEV_PORT:-5439}}"
DB_HOST="${POSTGRES_HOST:-localhost}"
DB_NAME="${POSTGRES_DB:-eliza}"
DB_USER="${POSTGRES_USER:-eliza}"

echo "🔍 Checking PostgreSQL..."
echo "  Host: $DB_HOST"
echo "  Port: $DB_PORT"
echo "  Database: $DB_NAME"
echo "  User: $DB_USER"
echo ""

# Check if Docker container is running
if command -v docker >/dev/null 2>&1; then
  if docker ps --format '{{.Names}}' | grep -q '^otc-postgres$'; then
    echo "✅ Docker container 'otc-postgres' is running"
    
    # Check if PostgreSQL is ready inside container
    if docker exec otc-postgres pg_isready -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1; then
      echo "✅ PostgreSQL is accepting connections"
      
      # Test actual connection
      if docker exec otc-postgres psql -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1" >/dev/null 2>&1; then
        echo "✅ Database connection successful"
        exit 0
      else
        echo "❌ Database exists but connection failed"
        exit 1
      fi
    else
      echo "❌ PostgreSQL is not ready yet"
      echo "💡 Wait a moment and try again"
      exit 1
    fi
  else
    echo "❌ Docker container 'otc-postgres' is not running"
    echo "💡 Start it with: docker compose -f docker-compose.localnet.yml up -d postgres"
    exit 1
  fi
else
  # No Docker, try direct connection
  if command -v pg_isready >/dev/null 2>&1; then
    if pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1; then
      echo "✅ PostgreSQL is accepting connections"
      exit 0
    else
      echo "❌ PostgreSQL is not responding"
      exit 1
    fi
  else
    echo "⚠️  Cannot verify PostgreSQL (pg_isready not found)"
    echo "💡 Install PostgreSQL client tools or Docker"
    exit 1
  fi
fi

