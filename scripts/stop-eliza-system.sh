#!/bin/bash

# elizaOS OTC System - Stop Script
# Cleanly shuts down all components of the elizaOS OTC system

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
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

# Function to stop process
stop_process() {
    local process_name=$1
    local display_name=$2
    
    if pgrep -f "$process_name" > /dev/null 2>&1; then
        log "  Stopping $display_name..." "$YELLOW"
        pkill -f "$process_name" 2>/dev/null || true
        sleep 1
        
        # Force kill if still running
        if pgrep -f "$process_name" > /dev/null 2>&1; then
            pkill -9 -f "$process_name" 2>/dev/null || true
        fi
        
        log "  ✓ $display_name stopped" "$GREEN"
    else
        log "  • $display_name not running" "$CYAN"
    fi
}

main() {
    header "🛑 STOPPING elizaOS SYSTEM"
    
    log "Shutting down all components..." "$YELLOW"
    echo
    
    # Stop Eliza agent
    stop_process "eliza:dev" "Eliza Agent"
    stop_process "dist/agent.js" "Eliza Agent Process"
    
    # Stop Next.js
    stop_process "next dev" "Next.js Application"
    
    # Stop approval worker
    stop_process "quoteApprovalWorker" "Approval Worker"
    
    # Stop Anvil node
    stop_process "anvil" "Anvil Node"
    
    echo
    log "✅ All services stopped successfully!" "$GREEN$BOLD"
    
    # Clean up log files (optional)
    read -p "$(echo -e "${YELLOW}Do you want to clean up log files? (y/n): ${NC}")" -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        log "  Cleaning up log files..." "$YELLOW"
        rm -f "$PROJECT_ROOT"/*.log
        log "  ✓ Log files cleaned" "$GREEN"
    fi
    
    echo
    log "System shutdown complete." "$CYAN"
}

main
