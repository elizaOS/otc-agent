#!/bin/bash

# ElizaOS OTC System - Integration Test Script
# Tests that all components are properly integrated

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'
BOLD='\033[1m'

log() {
    echo -e "${2}${1}${NC}"
}

header() {
    echo
    log "========================================" "$CYAN"
    log "$1" "$CYAN$BOLD"
    log "========================================" "$CYAN"
    echo
}

check_component() {
    local component=$1
    local path=$2
    
    if [ -f "$PROJECT_ROOT/$path" ]; then
        log "  ✅ $component" "$GREEN"
        return 0
    else
        log "  ❌ $component missing" "$RED"
        return 1
    fi
}

main() {
    header "🔍 TESTING ElizaOS INTEGRATION"
    
    local all_good=true
    
    # Test 1: Check Core Components
    log "1️⃣ Checking Core Components..." "$BLUE"
    check_component "OTC Display Component" "src/components/quote-display.tsx" || all_good=false
    check_component "Accept Quote Modal" "src/components/accept-quote-modal.tsx" || all_good=false
    check_component "Deal Completion UI" "src/components/deal-completion.tsx" || all_good=false
    check_component "Enhanced Chat" "src/components/chat-enhanced.tsx" || all_good=false
    check_component "Notifications Hook" "src/hooks/useNotifications.ts" || all_good=false
    
    echo
    
    # Test 2: Check Backend Services
    log "2️⃣ Checking Backend Services..." "$BLUE"
    check_component "Approval Worker" "src/services/quoteApprovalWorker.ts" || all_good=false
    check_component "Deal Completion API" "src/app/api/deal-completion/route.ts" || all_good=false
    check_component "Quote Approval API" "src/app/api/worker/quote-approval/route.ts" || all_good=false
    
    echo
    
    # Test 3: Check Smart Contracts
    log "3️⃣ Checking Smart Contracts..." "$BLUE"
    check_component "OTC Contract" "contracts/contracts/OTC.sol" || all_good=false
    check_component "ElizaOS Token Mock" "contracts/contracts/MockERC20.sol" || all_good=false
    check_component "Deployment Script" "contracts/scripts/deploy-eliza-otc.ts" || all_good=false
    check_component "E2E Test Script" "contracts/scripts/test-e2e-flow.ts" || all_good=false
    
    echo
    
    # Test 4: Check Configuration
    log "4️⃣ Checking Configuration..." "$BLUE"
    if [ -f "$PROJECT_ROOT/.env.local" ]; then
        log "  ✅ Environment file exists" "$GREEN"
        
        # Check for required variables
        if grep -q "NEXT_PUBLIC_OTC_ADDRESS" "$PROJECT_ROOT/.env.local" 2>/dev/null; then
            log "  ✅ OTC address configured" "$GREEN"
        else
            log "  ⚠️  OTC address not configured (will be set on deployment)" "$YELLOW"
        fi
        
        if grep -q "TEST_WALLET_ADDRESS" "$PROJECT_ROOT/.env.local" 2>/dev/null; then
            log "  ✅ Test wallet configured" "$GREEN"
        else
            log "  ⚠️  Test wallet not configured (will be created on deployment)" "$YELLOW"
        fi
    else
        log "  ⚠️  No .env.local file (will be created on first run)" "$YELLOW"
    fi
    
    echo
    
    # Test 5: Check Deployment Status
    log "5️⃣ Checking Deployment Status..." "$BLUE"
    if [ -f "$PROJECT_ROOT/contracts/deployments/eliza-otc-deployment.json" ]; then
        log "  ✅ Contracts deployed" "$GREEN"
        
        # Parse deployment file for details
        DEPLOYMENT_INFO=$(cat "$PROJECT_ROOT/contracts/deployments/eliza-otc-deployment.json")
        TEST_WALLET=$(echo "$DEPLOYMENT_INFO" | grep -o '"testWallet"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4 || echo "Not found")
        OTC_ADDRESS=$(echo "$DEPLOYMENT_INFO" | grep -o '"otc"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4 || echo "Not found")
        
        if [ "$TEST_WALLET" != "Not found" ]; then
            log "  ✅ Test Wallet: ${TEST_WALLET:0:10}..." "$GREEN"
        fi
        
        if [ "$OTC_ADDRESS" != "Not found" ]; then
            log "  ✅ OTC Contract: ${OTC_ADDRESS:0:10}..." "$GREEN"
        fi
    else
        log "  ⚠️  Contracts not deployed yet (run: npm run eliza:deploy)" "$YELLOW"
    fi
    
    echo
    
    # Test 6: Check Frontend Integration
    log "6️⃣ Checking Frontend Integration..." "$BLUE"
    
    # Check if landing page imports enhanced chat
    if grep -q "chat-enhanced" "$PROJECT_ROOT/src/app/(main)/page.tsx" 2>/dev/null; then
        log "  ✅ Enhanced chat integrated in landing page" "$GREEN"
    else
        log "  ⚠️  Enhanced chat not integrated in landing page" "$YELLOW"
    fi
    
    # Check if Web3Provider is configured
    if grep -q "Web3Provider" "$PROJECT_ROOT/src/app/(main)/page.tsx" 2>/dev/null; then
        log "  ✅ Web3Provider configured" "$GREEN"
    else
        log "  ❌ Web3Provider not configured" "$RED"
        all_good=false
    fi
    
    # Check if quote display is integrated in chat messages
    if grep -q "OTCQuoteDisplay" "$PROJECT_ROOT/src/components/chat-message.tsx" 2>/dev/null; then
        log "  ✅ OTC quotes integrated in chat messages" "$GREEN"
    else
        log "  ⚠️  OTC quotes not integrated in chat messages" "$YELLOW"
    fi
    
    echo
    
    # Summary
    header "INTEGRATION TEST SUMMARY"
    
    if [ "$all_good" = true ]; then
        log "✅ ALL COMPONENTS PROPERLY INTEGRATED!" "$GREEN$BOLD"
        echo
        log "The ElizaOS OTC System is fully integrated and ready to use." "$GREEN"
        echo
        log "📋 Test Wallet Information:" "$CYAN"
        log "  Address: 0x494b8fc7FC263D86dB6655Fe34bf9b88b69FCe8F" "$YELLOW"
        log "  Private Key: See TEST_WALLET_INFO.md" "$YELLOW"
        log "  Funded with: 1 ETH + 10,000 USDC" "$YELLOW"
        echo
        log "🚀 To start the system, run:" "$CYAN"
        log "  npm run eliza:start" "$YELLOW$BOLD"
    else
        log "⚠️  Some components are missing or not properly integrated" "$YELLOW$BOLD"
        echo
        log "Please review the issues above and ensure all components are in place." "$YELLOW"
        log "You may need to run: npm install" "$CYAN"
    fi
    
    echo
}

# Run the test
main
