#!/bin/bash
set -e

echo "🎭 Starting services for Playwright E2E tests..."

# Cleanup any existing processes
pkill -9 -f "hardhat node" 2>/dev/null || true
pkill -9 -f "solana-test-validator" 2>/dev/null || true
pkill -9 -f "next dev" 2>/dev/null || true
lsof -t -i:8545 | xargs kill -9 2>/dev/null || true
lsof -t -i:8899 | xargs kill -9 2>/dev/null || true
lsof -t -i:2222 | xargs kill -9 2>/dev/null || true

echo "✅ Cleaned up existing processes"

# Start Hardhat node in background
echo "⛓️  Starting Hardhat node..."
cd contracts
npx hardhat node &
HARDHAT_PID=$!
cd ..

# Wait for Hardhat to be ready
echo "⏳ Waiting for Hardhat node (port 8545)..."
timeout 30 bash -c 'until nc -z 127.0.0.1 8545; do sleep 1; done' || {
  echo "❌ Hardhat node failed to start"
  kill $HARDHAT_PID 2>/dev/null || true
  exit 1
}
echo "✅ Hardhat node ready"

# Deploy contracts
echo "📝 Deploying contracts..."
cd contracts
npm run deploy:eliza || {
  echo "❌ Contract deployment failed"
  kill $HARDHAT_PID 2>/dev/null || true
  exit 1
}
cd ..
echo "✅ Contracts deployed"

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
  npm run build 2>/dev/null || true
  solana airdrop 25 ./id.json --url http://127.0.0.1:8899 2>/dev/null || true
  anchor deploy 2>/dev/null || true
  cd ../..
  echo "✅ Solana program deployed"
fi

# Start Next.js in background
echo "🚀 Starting Next.js dev server..."
NEXT_PUBLIC_E2E_TEST=1 NODE_ENV=development next dev -p 2222 &
NEXT_PID=$!

# Wait for Next.js to be ready
echo "⏳ Waiting for Next.js (port 2222)..."
timeout 120 bash -c 'until curl -s http://localhost:2222 > /dev/null; do sleep 2; done' || {
  echo "❌ Next.js failed to start"
  kill $HARDHAT_PID $NEXT_PID 2>/dev/null || true
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
echo "  Hardhat:  http://127.0.0.1:8545"
echo "  Solana:   http://127.0.0.1:8899"
echo "  Next.js:  http://localhost:2222"
echo "═══════════════════════════════════════════"
echo ""

# Keep services running
wait $NEXT_PID

