#!/bin/bash

set -e

echo "🚀 Starting Jeju Localnet for OTC Agent"
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
  echo "❌ Error: Must run from vendor/otc-desk directory"
  exit 1
fi

# Check for required tools
command -v bun >/dev/null 2>&1 || { echo "❌ Error: bun is required but not installed"; exit 1; }
command -v docker >/dev/null 2>&1 || { echo "❌ Error: docker is required but not installed"; exit 1; }

# Set environment
export NEXT_PUBLIC_JEJU_NETWORK=localnet
export NEXT_PUBLIC_JEJU_RPC_URL=http://127.0.0.1:9545
export NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8545

echo "📋 Environment Check"
echo "  - Jeju Network: localnet"
echo "  - Jeju RPC: $NEXT_PUBLIC_JEJU_RPC_URL"
echo "  - Anvil RPC: $NEXT_PUBLIC_RPC_URL"
echo ""

# Start Jeju localnet from root
echo "🔧 Starting Jeju L2 node..."
cd ../..

# Fail if script doesn't exist
if [ ! -f "scripts/localnet/start.ts" ]; then
  echo "❌ ERROR: scripts/localnet/start.ts not found"
  echo "💡 Make sure you're running from the correct directory"
  exit 1
fi

# Start the node
bun run scripts/localnet/start.ts &
JEJU_PID=$!
echo "  Started Jeju node (PID: $JEJU_PID)"

# Verify it started
sleep 2
if ! kill -0 $JEJU_PID 2>/dev/null; then
  echo "❌ ERROR: Failed to start Jeju node"
  exit 1
fi

cd vendor/otc-desk

# Wait for RPC to be ready
echo ""
echo "⏳ Waiting for Jeju RPC to be ready..."
RETRIES=0
MAX_RETRIES=30
while [ $RETRIES -lt $MAX_RETRIES ]; do
  if curl -s -X POST -H "Content-Type: application/json" \
    --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
    $NEXT_PUBLIC_JEJU_RPC_URL > /dev/null 2>&1; then
    echo "✅ Jeju RPC is ready!"
    break
  fi
  RETRIES=$((RETRIES+1))
  if [ $RETRIES -eq $MAX_RETRIES ]; then
    echo "❌ Timeout waiting for Jeju RPC"
    exit 1
  fi
  sleep 2
  echo "  Retry $RETRIES/$MAX_RETRIES..."
done

# Start Docker services
echo ""
echo "🐳 Starting Docker services (Postgres, worker)..."
if [ ! -f "docker-compose.localnet.yml" ]; then
  echo "❌ ERROR: docker-compose.localnet.yml not found"
  exit 1
fi

docker compose -f docker-compose.localnet.yml up -d || {
  echo "❌ ERROR: Failed to start Docker services"
  exit 1
}
echo "✅ Docker services started"

# Wait for database to be truly healthy
echo ""
echo "⏳ Waiting for database to be ready..."
RETRIES=0
MAX_RETRIES=30
while [ $RETRIES -lt $MAX_RETRIES ]; do
  if docker exec otc-postgres pg_isready -U eliza > /dev/null 2>&1; then
    echo "✅ PostgreSQL is ready!"
    break
  fi
  RETRIES=$((RETRIES+1))
  if [ $RETRIES -eq $MAX_RETRIES ]; then
    echo "❌ Timeout waiting for PostgreSQL"
    exit 1
  fi
  sleep 2
  echo "  Retry $RETRIES/$MAX_RETRIES..."
done

# Give the database an extra moment to fully initialize
sleep 2

# Run database migrations (optional - may not exist in all setups)
echo ""
echo "📝 Running database migrations..."
if [ -f "../../packages/db/scripts/migrate.ts" ]; then
  cd ../../packages/db
  bun run scripts/migrate.ts || {
    echo "❌ ERROR: Database migration failed"
    cd ../../vendor/otc-desk
    exit 1
  }
  cd ../../vendor/otc-desk
  echo "✅ Migrations complete"
else
  echo "⚠️  No migration script found - skipping (this is optional)"
fi

echo ""
echo "✅ Jeju Localnet is ready!"
echo ""
echo "📍 Services:"
echo "  - Jeju RPC:       http://127.0.0.1:9545"
echo "  - Anvil RPC:      http://127.0.0.1:8545"
echo "  - Solana RPC:     http://127.0.0.1:8899"
echo "  - PostgreSQL:     localhost:5439"
echo "  - OTC Agent:      http://localhost:5005 (after 'bun run dev')"
echo "  - Worker Service: http://localhost:3137"
echo ""
echo "🔧 Next steps:"
echo "  1. Run 'bun run dev' to start the frontend"
echo "  2. Open http://localhost:5005 in your browser"
echo "  3. Connect your wallet (Jeju Localnet chain ID: 1337)"
echo ""
echo "💡 To stop localnet: ./scripts/localnet-stop.sh"
echo ""
