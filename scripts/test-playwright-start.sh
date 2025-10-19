#!/bin/bash
set -e

echo "🎭 Starting services for Playwright E2E tests on Jeju Localnet..."

# Cleanup any existing processes
pkill -9 -f "anvil" 2>/dev/null || true
pkill -9 -f "geth" 2>/dev/null || true
pkill -9 -f "solana-test-validator" 2>/dev/null || true
pkill -9 -f "next dev" 2>/dev/null || true
lsof -t -i:9545 | xargs kill -9 2>/dev/null || true
lsof -t -i:8545 | xargs kill -9 2>/dev/null || true
lsof -t -i:8899 | xargs kill -9 2>/dev/null || true
lsof -t -i:2222 | xargs kill -9 2>/dev/null || true

echo "✅ Cleaned up existing processes"

# Start Jeju Localnet node in background (port 9545)
echo "⛓️  Starting Jeju Localnet node..."
export NEXT_PUBLIC_JEJU_RPC_URL=http://127.0.0.1:9545
# For now, use anvil on port 9545 as Jeju localnet (until we have dedicated Jeju client)
anvil --port 9545 --chain-id 1337 > jeju-localnet.log 2>&1 &
JEJU_PID=$!

# Wait for Jeju node to be ready
echo "⏳ Waiting for Jeju Localnet node (port 9545)..."
timeout 30 bash -c 'until nc -z 127.0.0.1 9545; do sleep 1; done' || {
  echo "❌ Jeju Localnet node failed to start"
  kill $JEJU_PID 2>/dev/null || true
  exit 1
}
echo "✅ Jeju Localnet node ready"

# Deploy contracts to Jeju Localnet
echo "📝 Deploying contracts to Jeju Localnet..."
cd contracts
# Deploy using Jeju RPC URL
RPC_URL=http://127.0.0.1:9545 bun run deploy:eliza || {
  echo "❌ Contract deployment failed"
  kill $JEJU_PID 2>/dev/null || true
  exit 1
}
cd ..
echo "✅ Contracts deployed to Jeju"

# Start Solana test validator in background
echo "◎ Starting Solana test validator..."
cd solana/otc-program
rm -rf test-ledger/lock 2>/dev/null || true
solana-test-validator --log > ../../solana-test.log 2>&1 &
SOLANA_PID=$!
cd ../..

# Wait for Solana to be ready
echo "⏳ Waiting for Solana validator (port 8899)..."
timeout 60 bash -c 'until nc -z 127.0.0.1 8899; do sleep 1; done' || {
  echo "⚠️  Solana validator failed to start (optional for EVM-only tests)"
}

# Deploy Solana program if validator is running
if nc -z 127.0.0.1 8899 2>/dev/null; then
  echo "📝 Deploying Solana program..."
  cd solana/otc-program
  bun run build 2>/dev/null || true
  solana airdrop 25 ./id.json --url http://127.0.0.1:8899 2>/dev/null || true
  anchor deploy 2>/dev/null || true
  cd ../..
  echo "✅ Solana program deployed"
fi

# Start Next.js in background with Jeju configuration
echo "🚀 Starting Next.js dev server..."
export NEXT_PUBLIC_JEJU_RPC_URL=http://127.0.0.1:9545
export NEXT_PUBLIC_JEJU_NETWORK=localnet
NEXT_PUBLIC_E2E_TEST=1 NODE_ENV=development next dev -p 2222 &
NEXT_PID=$!

# Wait for Next.js to be ready
echo "⏳ Waiting for Next.js (port 2222)..."
timeout 120 bash -c 'until curl -s http://localhost:2222 > /dev/null; do sleep 2; done' || {
  echo "❌ Next.js failed to start"
  kill $JEJU_PID $NEXT_PID 2>/dev/null || true
  kill $SOLANA_PID 2>/dev/null || true
  exit 1
}
echo "✅ Next.js ready"

# Seed test data
echo "🌱 Seeding test data..."
bun scripts/seed-tokens.ts || echo "⚠️  Seed script failed (continuing anyway)"

echo ""
echo "═══════════════════════════════════════════"
echo "✅ All services ready for Playwright tests"
echo "═══════════════════════════════════════════"
echo "  Jeju Localnet:  http://127.0.0.1:9545"
echo "  Solana:         http://127.0.0.1:8899"
echo "  Next.js:        http://localhost:2222"
echo "═══════════════════════════════════════════"
echo ""

# Keep services running
wait $NEXT_PID

