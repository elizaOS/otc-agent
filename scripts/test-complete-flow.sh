#!/bin/bash
set -e

# Complete Flow E2E Test Runner
# Starts all services, runs comprehensive tests, and cleans up

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                                                               ║"
echo "║       COMPLETE FLOW E2E TESTS - BASE & SOLANA                ║"
echo "║                                                               ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Cleanup function
cleanup() {
  echo ""
  echo -e "${YELLOW}🧹 Cleaning up...${NC}"
  
  # Kill background processes
  if [ ! -z "$HARDHAT_PID" ]; then
    kill $HARDHAT_PID 2>/dev/null || true
    echo "  ✓ Stopped Hardhat node"
  fi
  
  if [ ! -z "$SOLANA_PID" ]; then
    kill $SOLANA_PID 2>/dev/null || true
    echo "  ✓ Stopped Solana validator"
  fi
  
  if [ ! -z "$SERVER_PID" ]; then
    kill $SERVER_PID 2>/dev/null || true
    echo "  ✓ Stopped Next.js server"
  fi
  
  echo ""
}

# Set trap to cleanup on exit
trap cleanup EXIT

# Check if already running
if lsof -Pi :8545 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
  echo -e "${YELLOW}⚠️  Hardhat already running on port 8545${NC}"
  HARDHAT_RUNNING=true
else
  HARDHAT_RUNNING=false
fi

if lsof -Pi :2222 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
  echo -e "${YELLOW}⚠️  Next.js already running on port 2222${NC}"
  SERVER_RUNNING=true
else
  SERVER_RUNNING=false
fi

# Start Hardhat if not running
if [ "$HARDHAT_RUNNING" = false ]; then
  echo -e "${BLUE}1️⃣  Starting Hardhat node...${NC}"
  cd contracts && npx hardhat node > /tmp/hardhat-test.log 2>&1 &
  HARDHAT_PID=$!
  cd ..
  sleep 3
  echo "  ✅ Hardhat started (PID: $HARDHAT_PID)"
fi

# Deploy contracts
echo ""
echo -e "${BLUE}2️⃣  Deploying contracts...${NC}"
cd contracts && npm run deploy:eliza > /tmp/deploy-test.log 2>&1
cd ..
echo "  ✅ Contracts deployed"

# Start Solana validator if not running
if ! pgrep -x "solana-test-val" > /dev/null 2>&1; then
  echo ""
  echo -e "${BLUE}3️⃣  Starting Solana validator...${NC}"
  solana-test-validator --reset > /tmp/solana-test.log 2>&1 &
  SOLANA_PID=$!
  sleep 5
  echo "  ✅ Solana validator started (PID: $SOLANA_PID)"
  
  # Build and deploy Solana program
  echo ""
  echo -e "${BLUE}4️⃣  Building Solana program...${NC}"
  cd solana/otc-program && anchor build > /tmp/solana-build.log 2>&1
  echo "  ✅ Solana program built"
  
  echo ""
  echo -e "${BLUE}5️⃣  Deploying Solana program...${NC}"
  anchor deploy > /tmp/solana-deploy.log 2>&1 || true
  cd ../..
  echo "  ✅ Solana program deployed"
else
  echo ""
  echo -e "${YELLOW}⚠️  Solana validator already running${NC}"
fi

# Start Next.js server if not running
if [ "$SERVER_RUNNING" = false ]; then
  echo ""
  echo -e "${BLUE}6️⃣  Starting Next.js server...${NC}"
  bun run dev > /tmp/nextjs-test.log 2>&1 &
  SERVER_PID=$!
  sleep 10
  echo "  ✅ Next.js server started (PID: $SERVER_PID)"
fi

# Wait for services
echo ""
echo -e "${BLUE}7️⃣  Waiting for all services...${NC}"
sleep 5

# Run tests
echo ""
echo -e "${GREEN}8️⃣  Running comprehensive E2E tests...${NC}"
echo ""

bun run test tests/complete-flow-e2e.test.ts

# Test results
if [ $? -eq 0 ]; then
  echo ""
  echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║                                                               ║${NC}"
  echo -e "${GREEN}║                   ✅ ALL TESTS PASSED                        ║${NC}"
  echo -e "${GREEN}║                                                               ║${NC}"
  echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════╝${NC}"
  echo ""
  exit 0
else
  echo ""
  echo -e "${RED}╔═══════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${RED}║                                                               ║${NC}"
  echo -e "${RED}║                   ❌ TESTS FAILED                            ║${NC}"
  echo -e "${RED}║                                                               ║${NC}"
  echo -e "${RED}╚═══════════════════════════════════════════════════════════════╝${NC}"
  echo ""
  exit 1
fi

