#!/bin/bash

# Keep prices fresh on both chains for local dev
# Updates every 30 seconds to prevent staleness

# Get project root (script is in scripts/ subdirectory)
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "🔄 Starting price keeper for local dev..."
echo "Updates every 30 seconds to prevent staleness"

while true; do
  # Update Solana prices
  cd "$PROJECT_ROOT/solana/otc-program"
  ANCHOR_PROVIDER_URL=http://127.0.0.1:8899 ANCHOR_WALLET=./id.json \
    bun scripts/set-prices.ts > /dev/null 2>&1 && \
    echo "$(date +%H:%M:%S) ✅ Solana prices updated" || \
    echo "$(date +%H:%M:%S) ⚠️  Solana price update failed"
  
  # Update EVM prices (using cast with Anvil)
  echo "$(date +%H:%M:%S) ⚠️  EVM price update disabled (migrate to cast-based updates)"
  
  # Wait 30 seconds
  sleep 30
done

