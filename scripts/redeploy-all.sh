#!/bin/bash
set -e

echo "🔄 Complete System Redeploy"
echo "=========================="
echo ""

# Kill all running processes
echo "1️⃣ Stopping all running processes..."
pkill -f "hardhat node" || true
pkill -f "next dev" || true
pkill -f "solana-test-validator" || true
sleep 2

# Clean contracts
echo ""
echo "2️⃣ Cleaning contract artifacts..."
cd contracts
rm -rf artifacts cache typechain-types deployments/*.json
echo "   ✅ Contract artifacts cleaned"

# Recompile contracts
echo ""
echo "3️⃣ Recompiling contracts..."
bun run compile
echo "   ✅ Contracts compiled"

cd ..

# Clean database/cache
echo ""
echo "4️⃣ Cleaning database and cache..."
rm -f .agent-data/* 2>/dev/null || true
echo "   ✅ Database cleaned"

# Start fresh
echo ""
echo "5️⃣ Starting fresh deployment..."
echo "   Starting Hardhat node..."
cd contracts
npx hardhat node --hostname 127.0.0.1 --port 8545 > /tmp/hardhat.log 2>&1 &
HARDHAT_PID=$!
echo "   Hardhat PID: $HARDHAT_PID"
cd ..

# Wait for Hardhat
echo "   Waiting for Hardhat to be ready..."
for i in {1..30}; do
  if curl -s http://127.0.0.1:8545 > /dev/null 2>&1; then
    echo "   ✅ Hardhat node ready"
    break
  fi
  if [ $i -eq 30 ]; then
    echo "   ❌ Hardhat failed to start"
    exit 1
  fi
  sleep 1
done

# Deploy contracts
echo ""
echo "6️⃣ Deploying OTC contracts..."
cd contracts
npx hardhat run scripts/deploy-eliza-otc.ts --network localhost
echo "   ✅ Contracts deployed"
cd ..

echo ""
echo "✅ System redeployed successfully!"
echo ""
echo "Next steps:"
echo "  1. Start the dev server: bun run dev"
echo "  2. Seed tokens: bun run scripts/seed-tokens.ts"
echo ""

