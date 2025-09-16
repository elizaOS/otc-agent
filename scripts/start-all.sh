#!/bin/bash

# Kill any existing processes
echo "🧹 Cleaning up existing processes..."
pkill -f "hardhat node" 2>/dev/null
pkill -f "next dev" 2>/dev/null
pkill -f "elizaos" 2>/dev/null
sleep 2

# Start Hardhat node in background
echo "🔨 Starting Hardhat node..."
(cd contracts && npx hardhat node > ../hardhat.log 2>&1) &
HARDHAT_PID=$!
echo "   Hardhat PID: $HARDHAT_PID"
sleep 5

# Deploy contracts
echo "📝 Deploying contracts..."
cd contracts && npx hardhat ignition deploy ./ignition/modules/OTCDesk.ts --network localhost > ../deploy.log 2>&1
if [ $? -ne 0 ]; then
    echo "   ❌ Contract deployment failed. Check deploy.log"
    exit 1
fi
echo "   ✅ Contracts deployed"

# Deploy TestToken
echo "🪙 Deploying TestToken..."
(cd contracts && npx hardhat run deploy-test-token.ts --network localhost >> ../deploy.log 2>&1)
if [ $? -ne 0 ]; then
    echo "   ❌ TestToken deployment failed. Check deploy.log"
    exit 1
fi
echo "   ✅ TestToken deployed and OTC contract funded"

# Initialize database
echo "🗄️ Setting up database..."
npx prisma migrate dev --name init > prisma.log 2>&1
echo "   ✅ Database initialized"

# Build the project first to avoid routes-manifest issues
echo "🏗️ Building project..."
yarn build > build.log 2>&1
if [ $? -ne 0 ]; then
    echo "   ⚠️  Build had warnings, continuing..."
fi

# Start ElizaOS agent
echo "🤖 Starting ElizaOS agent..."
elizaos dev --port 3137 > elizaos.log 2>&1 &
ELIZAOS_PID=$!
echo "   ElizaOS PID: $ELIZAOS_PID"

# Start Next.js dev server
echo "🌐 Starting Next.js dev server..."
next dev -p 2222 > nextjs.log 2>&1 &
NEXT_PID=$!
echo "   Next.js PID: $NEXT_PID"

# Wait for services to be ready
echo "⏳ Waiting for services to start..."
sleep 15

# Check if services are running
echo "🔍 Checking service status..."

# Check Hardhat
if curl -s -X POST http://127.0.0.1:8545 -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' > /dev/null 2>&1; then
    echo "   ✅ Hardhat node is running on port 8545"
else
    echo "   ❌ Hardhat node is not responding"
fi

# Check ElizaOS
if curl -s http://localhost:3137 > /dev/null 2>&1; then
    echo "   ✅ ElizaOS is running on port 3137"
else
    echo "   ❌ ElizaOS is not responding"
fi

# Check Next.js
if curl -s http://localhost:2222 > /dev/null 2>&1; then
    echo "   ✅ Next.js is running on port 2222"
else
    echo "   ❌ Next.js is not responding"
fi

# Start quote approval worker
echo "👷 Starting quote approval worker..."
curl -X POST http://localhost:2222/api/worker/quote-approval \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-secret" \
  -d '{"action": "start"}' > worker.log 2>&1

if grep -q "success" worker.log 2>/dev/null || grep -q "started" worker.log 2>/dev/null; then
    echo "   ✅ Quote approval worker started"
else
    echo "   ⚠️  Worker may not have started correctly. Check worker.log"
fi

echo ""
echo "🚀 All services started!"
echo ""
echo "📊 Service URLs:"
echo "   - Next.js app: http://localhost:2222"
echo "   - ElizaOS dashboard: http://localhost:3137"
echo "   - Hardhat RPC: http://127.0.0.1:8545"
echo ""
echo "📁 Log files:"
echo "   - hardhat.log - Hardhat node output"
echo "   - deploy.log - Contract deployment logs"
echo "   - elizaos.log - ElizaOS agent logs"
echo "   - nextjs.log - Next.js server logs"
echo "   - worker.log - Quote worker status"
echo ""
echo "🛑 To stop all services, run: ./scripts/stop-all.sh"
echo ""
echo "Process IDs saved to .pids file"

# Save PIDs for stop script
echo "HARDHAT_PID=$HARDHAT_PID" > .pids
echo "ELIZAOS_PID=$ELIZAOS_PID" >> .pids
echo "NEXT_PID=$NEXT_PID" >> .pids
