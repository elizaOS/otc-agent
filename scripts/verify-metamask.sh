#!/bin/bash

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🦊 MetaMask Connection Verification"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check if Anvil is running
echo "1️⃣  Checking Anvil RPC..."
RESPONSE=$(curl -s -X POST http://127.0.0.1:8545 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}')

if [ $? -eq 0 ] && echo "$RESPONSE" | grep -q "0x7a69"; then
    echo "   ✅ Anvil is running on http://127.0.0.1:8545"
    echo "   ✅ Chain ID: 31337 (0x7a69)"
else
    echo "   ❌ Anvil is NOT running"
    echo "   ➜  Start it with: bun run dev"
    exit 1
fi

echo ""
echo "2️⃣  Checking Next.js..."
if curl -s http://localhost:2222 > /dev/null 2>&1; then
    echo "   ✅ Next.js is running on http://localhost:2222"
else
    echo "   ⚠️  Next.js may not be running"
    echo "   ➜  Start it with: bun run dev"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 MetaMask Network Settings"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Network Name:    Anvil Local"
echo "RPC URL:         http://127.0.0.1:8545"
echo "Chain ID:        31337"
echo "Currency Symbol: ETH"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔑 Test Account Private Key (Anvil default account #0)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
echo ""
echo "Account Address: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
echo "Balance:         10,000 ETH"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Next Steps"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "1. Add network to MetaMask (if not added):"
echo "   - Open MetaMask → Networks → Add Network"
echo "   - Use settings above"
echo ""
echo "2. Import test account:"
echo "   - MetaMask → Import Account"
echo "   - Paste private key above"
echo ""
echo "3. Connect to app:"
echo "   - Open http://localhost:2222"
echo "   - Click 'Connect' → Select 'Base' (EVM)"
echo "   - Select 'Anvil Local' network in MetaMask"
echo "   - Approve connection"
echo ""
echo "📖 Full guide: See README.md 'MetaMask Setup'"
echo ""
