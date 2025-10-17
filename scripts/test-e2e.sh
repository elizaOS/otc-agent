#!/bin/bash
set -e

echo "═══════════════════════════════════════════════"
echo "🎭 Playwright E2E Test Suite"
echo "═══════════════════════════════════════════════"
echo ""

# Check if services are already running
echo "🔍 Checking service availability..."

HARDHAT_RUNNING=false
SOLANA_RUNNING=false
NEXTJS_RUNNING=false

nc -z 127.0.0.1 8545 2>/dev/null && HARDHAT_RUNNING=true
nc -z 127.0.0.1 8899 2>/dev/null && SOLANA_RUNNING=true
nc -z 127.0.0.1 2222 2>/dev/null && NEXTJS_RUNNING=true

if [ "$HARDHAT_RUNNING" = true ] && [ "$NEXTJS_RUNNING" = true ]; then
  echo "✅ Services already running - reusing existing servers"
  echo ""
  echo "Running tests..."
  npx playwright test "$@"
else
  echo "⚠️  Services not running - Playwright will start them automatically"
  echo ""
  echo "Running tests with service startup..."
  npx playwright test "$@"
fi

EXIT_CODE=$?

echo ""
if [ $EXIT_CODE -eq 0 ]; then
  echo "═══════════════════════════════════════════════"
  echo "✅ All E2E tests passed"
  echo "═══════════════════════════════════════════════"
else
  echo "═══════════════════════════════════════════════"
  echo "❌ Some tests failed"
  echo "═══════════════════════════════════════════════"
  echo ""
  echo "View detailed report:"
  echo "  npm run test:e2e:report"
fi

exit $EXIT_CODE

