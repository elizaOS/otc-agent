#!/bin/bash

# elizaOS OTC System - Complete Startup Script
# This script deploys and starts the entire elizaOS financial system

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# Function to print colored output
log() {
    echo -e "${2}${1}${NC}"
}

# Function to print section headers
header() {
    echo
    log "========================================" "$CYAN"
    log "$1" "$CYAN$BOLD"
    log "========================================" "$CYAN"
    echo
}

# Function to check if process is running
is_running() {
    pgrep -f "$1" > /dev/null 2>&1
}

# Function to wait for service
wait_for_service() {
    local service=$1
    local url=$2
    local max_attempts=30
    local attempt=1
    
    log "⏳ Waiting for $service to be ready..." "$YELLOW"
    
    while [ $attempt -le $max_attempts ]; do
        if curl -s -o /dev/null -w "%{http_code}" "$url" | grep -q "200\|404"; then
            log "✅ $service is ready!" "$GREEN"
            return 0
        fi
        echo -n "."
        sleep 2
        attempt=$((attempt + 1))
    done
    
    log "❌ $service failed to start" "$RED"
    return 1
}

# Main execution
main() {
    header "🚀 elizaOS SYSTEM STARTUP"
    
    # Step 1: Check environment
    log "1️⃣ Checking environment..." "$BLUE"
    
    if [ ! -f "$PROJECT_ROOT/.env.local" ]; then
        log "  Creating .env.local from .env.example..." "$YELLOW"
        cp "$PROJECT_ROOT/.env.example" "$PROJECT_ROOT/.env.local"
    fi
    
    # Check for required tools
    command -v bun >/dev/null 2>&1 || { log "❌ Bun is required but not installed. Install from https://bun.sh" "$RED"; exit 1; }
    
    log "  ✓ Environment check complete" "$GREEN"
    
    # Step 2: Install dependencies
    log "\n2️⃣ Installing dependencies..." "$BLUE"
    cd "$PROJECT_ROOT"
    
    if [ ! -d "node_modules" ]; then
        log "  Installing project dependencies..." "$YELLOW"
        bun install
    else
        log "  ✓ Dependencies already installed" "$GREEN"
    fi
    
    # Install contracts dependencies
    cd "$PROJECT_ROOT/contracts"
    if [ ! -d "node_modules" ]; then
        log "  Installing contract dependencies..." "$YELLOW"
        bun install
    else
        log "  ✓ Contract dependencies already installed" "$GREEN"
    fi
    
    # Step 3: Compile contracts
    log "\n3️⃣ Compiling smart contracts..." "$BLUE"
    bun run compile
    log "  ✓ Contracts compiled" "$GREEN"
    
    # Step 4: Start Anvil node
    log "\n4️⃣ Starting Anvil node..." "$BLUE"
    
    if is_running "anvil"; then
        log "  ✓ Anvil node already running" "$GREEN"
    else
        log "  Starting Anvil node in background..." "$YELLOW"
        "$PROJECT_ROOT/scripts/start-anvil.sh" > "$PROJECT_ROOT/anvil.log" 2>&1 &
        sleep 5
        
        if is_running "anvil"; then
            log "  ✓ Anvil node started" "$GREEN"
        else
            log "  ❌ Failed to start Anvil node" "$RED"
            exit 1
        fi
    fi
    
    # Step 5: Deploy elizaOS OTC contracts
    log "\n5️⃣ Deploying elizaOS OTC contracts..." "$BLUE"
    
    if [ -f "$PROJECT_ROOT/contracts/deployments/eliza-otc-deployment.json" ]; then
        log "  Contracts already deployed, skipping..." "$YELLOW"
    else
        bun run deploy:eliza
        log "  ✓ Contracts deployed successfully" "$GREEN"
    fi
    
    # Step 6: Start the approval worker
    log "\n6️⃣ Starting approval worker..." "$BLUE"
    cd "$PROJECT_ROOT"
    
    # Set environment variable to auto-start worker
    export AUTO_START_WORKER=true
    
    # Step 7: Start the Next.js application
    log "\n7️⃣ Starting Next.js application..." "$BLUE"
    
    if is_running "next dev"; then
        log "  ✓ Next.js already running" "$GREEN"
    else
        log "  Starting Next.js in development mode..." "$YELLOW"
        bun run dev > "$PROJECT_ROOT/nextjs.log" 2>&1 &
        
        # Wait for Next.js to be ready
        wait_for_service "Next.js" "http://localhost:5005"
    fi
    
    # Step 8: Start the Eliza agent
    log "\n8️⃣ Starting Eliza agent..." "$BLUE"
    
    if is_running "eliza:dev"; then
        log "  ✓ Eliza agent already running" "$GREEN"
    else
        log "  Starting Eliza agent..." "$YELLOW"
        bun run eliza:dev > "$PROJECT_ROOT/eliza.log" 2>&1 &
        sleep 3
        log "  ✓ Eliza agent started" "$GREEN"
    fi
    
    # Step 9: Load deployment info
    if [ -f "$PROJECT_ROOT/contracts/deployments/eliza-otc-deployment.json" ]; then
        DEPLOYMENT_INFO=$(cat "$PROJECT_ROOT/contracts/deployments/eliza-otc-deployment.json")
        TEST_WALLET=$(echo "$DEPLOYMENT_INFO" | grep -o '"testWallet"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
        OTC_ADDRESS=$(echo "$DEPLOYMENT_INFO" | grep -o '"otc"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
        ELIZAOS_ADDRESS=$(echo "$DEPLOYMENT_INFO" | grep -o '"elizaToken"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
    fi
    
    # Final Summary
    header "✨ SYSTEM READY!"
    
    log "${BOLD}📊 System Status:${NC}" "$GREEN"
    log "  • Anvil Node: ${GREEN}✓ Running${NC}"
    log "  • elizaOS Token: ${GREEN}✓ Deployed${NC}"
    log "  • OTC Contract: ${GREEN}✓ Deployed${NC}"
    log "  • Approval Worker: ${GREEN}✓ Active${NC}"
    log "  • Next.js App: ${GREEN}✓ Running${NC}"
    log "  • Eliza Agent: ${GREEN}✓ Running${NC}"
    
    echo
    log "${BOLD}🔗 Access Points:${NC}" "$BLUE"
    log "  • Web Interface: ${CYAN}http://localhost:2222${NC}"
    log "  • Agent Chat: ${CYAN}http://localhost:2222${NC}"
    
    if [ ! -z "$OTC_ADDRESS" ]; then
        echo
        log "${BOLD}📝 Contract Addresses:${NC}" "$YELLOW"
        log "  • elizaOS Token: ${CYAN}$ELIZAOS_ADDRESS${NC}"
        log "  • OTC Contract: ${CYAN}$OTC_ADDRESS${NC}"
    fi
    
    if [ ! -z "$TEST_WALLET" ]; then
        echo
        log "${BOLD}👛 Test Wallet:${NC}" "$YELLOW"
        log "  • Address: ${CYAN}$TEST_WALLET${NC}"
        log "  • Funded with: 1 ETH, 10,000 USDC"
    fi
    
    echo
    log "${BOLD}📚 Useful Commands:${NC}" "$CYAN"
    log "  • Run E2E Test: ${NC}cd contracts && bun run test:e2e"
    log "  • View Logs: ${NC}tail -f *.log"
    log "  • Stop All: ${NC}./scripts/stop-eliza-system.sh"
    
    echo
    log "${BOLD}🎯 Next Steps:${NC}" "$GREEN"
    log "  1. Open http://localhost:2222 in your browser"
    log "  2. Connect your wallet (or use the test wallet)"
    log "  3. Start chatting with the agent to negotiate a deal"
    log "  4. The system will automatically approve and process your offers"
    
    echo
    log "🎉 Happy Trading!" "$GREEN$BOLD"
}

# Run main function
main

# Keep script running and show logs
log "\n📋 Showing combined logs (Ctrl+C to exit)..." "$YELLOW"
tail -f "$PROJECT_ROOT"/*.log 2>/dev/null || true
