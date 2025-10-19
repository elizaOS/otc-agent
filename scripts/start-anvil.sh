#!/bin/bash

echo "🔨 Starting Anvil (Foundry) for Local Development..."
echo ""

# Get project root
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

# Kill any existing Anvil or Hardhat processes
pkill -9 -f "anvil" 2>/dev/null || true
pkill -9 -f "hardhat node" 2>/dev/null || true
sleep 1

# Clear port 8545
lsof -t -i:8545 | xargs kill -9 2>/dev/null || true
sleep 1

echo "Starting Anvil with default test accounts..."
echo ""

# Start Anvil with compatible settings
# --host 127.0.0.1 for local development
# --port 8545 for compatibility with existing configs
# --chain-id 31337 matches Hardhat default
# --accounts 20 provides enough test accounts
# --balance 10000 gives 10000 ETH per account
# No --block-time flag = instant mining (default behavior)
anvil \
  --host 127.0.0.1 \
  --port 8545 \
  --chain-id 31337 \
  --accounts 20 \
  --balance 10000 \
  --gas-limit 30000000 \
  --gas-price 0

