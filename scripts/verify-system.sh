#!/bin/bash

# ElizaOS OTC System - Verification Script
# Checks that all components are properly installed and configured

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

check_pass() {
    log "  ✅ $1" "$GREEN"
}

check_fail() {
    log "  ❌ $1" "$RED"
    return 1
}

check_warn() {
    log "  ⚠️  $1" "$YELLOW"
}

# Verification functions
verify_dependencies() {
    header "1. CHECKING DEPENDENCIES"
    
    local all_good=true
    
    # Check Node.js
    if command -v node >/dev/null 2>&1; then
        NODE_VERSION=$(node -v)
        check_pass "Node.js installed: $NODE_VERSION"
    else
        check_fail "Node.js not installed"
        all_good=false
    fi
    
    # Check npm
    if command -v npm >/dev/null 2>&1; then
        NPM_VERSION=$(npm -v)
        check_pass "npm installed: $NPM_VERSION"
    else
        check_fail "npm not installed"
        all_good=false
    fi
    
    # Check git
    if command -v git >/dev/null 2>&1; then
        check_pass "Git installed"
    else
        check_warn "Git not installed (optional)"
    fi
    
    return $([ "$all_good" = true ] && echo 0 || echo 1)
}

verify_project_structure() {
    header "2. CHECKING PROJECT STRUCTURE"
    
    local all_good=true
    
    # Check key directories
    for dir in "contracts" "src" "public" "cypress" "scripts"; do
        if [ -d "$PROJECT_ROOT/$dir" ]; then
            check_pass "Directory exists: $dir/"
        else
            check_fail "Missing directory: $dir/"
            all_good=false
        fi
    done
    
    # Check key files
    for file in "package.json" "tsconfig.json" "next.config.ts"; do
        if [ -f "$PROJECT_ROOT/$file" ]; then
            check_pass "File exists: $file"
        else
            check_fail "Missing file: $file"
            all_good=false
        fi
    done
    
    return $([ "$all_good" = true ] && echo 0 || echo 1)
}

verify_contracts() {
    header "3. CHECKING SMART CONTRACTS"
    
    local all_good=true
    
    # Check contract files
    for contract in "OTC.sol" "MockERC20.sol" "TestToken.sol" "MockAggregator.sol"; do
        if [ -f "$PROJECT_ROOT/contracts/contracts/$contract" ] || [ -f "$PROJECT_ROOT/contracts/contracts/mocks/$contract" ]; then
            check_pass "Contract exists: $contract"
        else
            check_fail "Missing contract: $contract"
            all_good=false
        fi
    done
    
    # Check if contracts are compiled
    if [ -d "$PROJECT_ROOT/contracts/artifacts" ]; then
        check_pass "Contracts compiled (artifacts exist)"
    else
        check_warn "Contracts not compiled yet"
    fi
    
    # Check deployment scripts
    if [ -f "$PROJECT_ROOT/contracts/scripts/deploy-eliza-otc.ts" ]; then
        check_pass "Deployment script exists"
    else
        check_fail "Missing deployment script"
        all_good=false
    fi
    
    # Check test script
    if [ -f "$PROJECT_ROOT/contracts/scripts/test-e2e-flow.ts" ]; then
        check_pass "E2E test script exists"
    else
        check_fail "Missing E2E test script"
        all_good=false
    fi
    
    return $([ "$all_good" = true ] && echo 0 || echo 1)
}

verify_services() {
    header "4. CHECKING SERVICES"
    
    local all_good=true
    
    # Check approval worker
    if [ -f "$PROJECT_ROOT/src/services/quoteApprovalWorker.ts" ]; then
        check_pass "Approval worker exists"
    else
        check_fail "Missing approval worker"
        all_good=false
    fi
    
    # Check WebSocket route
    if [ -f "$PROJECT_ROOT/src/app/api/socket/route.ts" ]; then
        check_pass "WebSocket API route exists"
    else
        check_fail "Missing WebSocket route"
        all_good=false
    fi
    
    # Check notification hook
    if [ -f "$PROJECT_ROOT/src/hooks/useNotifications.ts" ]; then
        check_pass "Notification hook exists"
    else
        check_fail "Missing notification hook"
        all_good=false
    fi
    
    # Check deal completion component
    if [ -f "$PROJECT_ROOT/src/components/deal-completion.tsx" ]; then
        check_pass "Deal completion component exists"
    else
        check_fail "Missing deal completion component"
        all_good=false
    fi
    
    return $([ "$all_good" = true ] && echo 0 || echo 1)
}

verify_scripts() {
    header "5. CHECKING SCRIPTS"
    
    local all_good=true
    
    # Check startup script
    if [ -f "$PROJECT_ROOT/scripts/start-eliza-system.sh" ]; then
        if [ -x "$PROJECT_ROOT/scripts/start-eliza-system.sh" ]; then
            check_pass "Startup script exists and is executable"
        else
            check_warn "Startup script exists but not executable"
            chmod +x "$PROJECT_ROOT/scripts/start-eliza-system.sh"
            check_pass "Made startup script executable"
        fi
    else
        check_fail "Missing startup script"
        all_good=false
    fi
    
    # Check stop script
    if [ -f "$PROJECT_ROOT/scripts/stop-eliza-system.sh" ]; then
        if [ -x "$PROJECT_ROOT/scripts/stop-eliza-system.sh" ]; then
            check_pass "Stop script exists and is executable"
        else
            check_warn "Stop script exists but not executable"
            chmod +x "$PROJECT_ROOT/scripts/stop-eliza-system.sh"
            check_pass "Made stop script executable"
        fi
    else
        check_fail "Missing stop script"
        all_good=false
    fi
    
    return $([ "$all_good" = true ] && echo 0 || echo 1)
}

verify_environment() {
    header "6. CHECKING ENVIRONMENT"
    
    local all_good=true
    
    # Check .env.local
    if [ -f "$PROJECT_ROOT/.env.local" ]; then
        check_pass ".env.local exists"
    else
        if [ -f "$PROJECT_ROOT/.env.example" ]; then
            cp "$PROJECT_ROOT/.env.example" "$PROJECT_ROOT/.env.local"
            check_pass "Created .env.local from .env.example"
        else
            check_fail "No .env.local or .env.example found"
            all_good=false
        fi
    fi
    
    # Check node_modules
    if [ -d "$PROJECT_ROOT/node_modules" ]; then
        check_pass "Project dependencies installed"
    else
        check_warn "Project dependencies not installed (run: npm install)"
    fi
    
    if [ -d "$PROJECT_ROOT/contracts/node_modules" ]; then
        check_pass "Contract dependencies installed"
    else
        check_warn "Contract dependencies not installed (run: cd contracts && npm install)"
    fi
    
    return $([ "$all_good" = true ] && echo 0 || echo 1)
}

verify_tests() {
    header "7. CHECKING TESTS"
    
    local all_good=true
    
    # Check Cypress E2E test
    if [ -f "$PROJECT_ROOT/cypress/e2e/eliza-quote-e2e.cy.ts" ]; then
        check_pass "Cypress E2E test exists"
    else
        check_fail "Missing Cypress E2E test"
        all_good=false
    fi
    
    # Check contract tests
    if [ -f "$PROJECT_ROOT/contracts/test/OTC.ts" ]; then
        check_pass "Contract tests exist"
    else
        check_warn "Contract tests missing"
    fi
    
    return $([ "$all_good" = true ] && echo 0 || echo 1)
}

# Main verification
main() {
    header "🔍 ElizaOS SYSTEM VERIFICATION"
    
    local total_checks=0
    local passed_checks=0
    
    # Run all verifications
    if verify_dependencies; then
        ((passed_checks++))
    fi
    ((total_checks++))
    
    if verify_project_structure; then
        ((passed_checks++))
    fi
    ((total_checks++))
    
    if verify_contracts; then
        ((passed_checks++))
    fi
    ((total_checks++))
    
    if verify_services; then
        ((passed_checks++))
    fi
    ((total_checks++))
    
    if verify_scripts; then
        ((passed_checks++))
    fi
    ((total_checks++))
    
    if verify_environment; then
        ((passed_checks++))
    fi
    ((total_checks++))
    
    if verify_tests; then
        ((passed_checks++))
    fi
    ((total_checks++))
    
    # Summary
    header "VERIFICATION SUMMARY"
    
    if [ $passed_checks -eq $total_checks ]; then
        log "✅ ALL CHECKS PASSED ($passed_checks/$total_checks)" "$GREEN$BOLD"
        echo
        log "🚀 System is ready! Run: npm run eliza:start" "$GREEN$BOLD"
    else
        log "⚠️  SOME CHECKS FAILED ($passed_checks/$total_checks passed)" "$YELLOW$BOLD"
        echo
        log "Please fix the issues above before starting the system." "$YELLOW"
        
        if [ -d "$PROJECT_ROOT/node_modules" ]; then
            log "Most issues can be fixed by running: npm install" "$CYAN"
        else
            log "Start by running: npm install" "$CYAN"
        fi
    fi
    
    echo
}

# Run verification
main
