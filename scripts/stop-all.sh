#!/bin/bash

echo "🛑 Stopping all services..."

# Kill by process name
pkill -f "hardhat node" 2>/dev/null && echo "   ✅ Stopped Hardhat node"
pkill -f "next dev" 2>/dev/null && echo "   ✅ Stopped Next.js"
pkill -f "elizaos" 2>/dev/null && echo "   ✅ Stopped ElizaOS"

# Also try to kill by PID if .pids file exists
if [ -f .pids ]; then
    source .pids
    [ ! -z "$HARDHAT_PID" ] && kill $HARDHAT_PID 2>/dev/null
    [ ! -z "$ELIZAOS_PID" ] && kill $ELIZAOS_PID 2>/dev/null
    [ ! -z "$NEXT_PID" ] && kill $NEXT_PID 2>/dev/null
    rm .pids
fi

echo "   ✅ All services stopped"









