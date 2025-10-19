#!/bin/bash
# Verification script to ensure Base, BSC, and Jeju support is complete

# Get script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "🔍 Verifying multi-chain support (Base, BSC, Jeju)..."
echo "📁 Project root: $PROJECT_ROOT"
echo ""

ERRORS=0

# Check for hardcoded "Base" references that should be "EVM"
echo "Checking for hardcoded 'Base' network references..."
HARDCODED_BASE=$(grep -r "Switch to Base\|Connect to Base\|Connected to Base" "$PROJECT_ROOT/src" --include="*.tsx" --include="*.ts" 2>/dev/null | grep -v "// " | wc -l)
if [ "$HARDCODED_BASE" -gt 0 ]; then
  echo "❌ Found $HARDCODED_BASE hardcoded 'Base' references that should be 'EVM'"
  grep -r "Switch to Base\|Connect to Base\|Connected to Base" "$PROJECT_ROOT/src" --include="*.tsx" --include="*.ts" 2>/dev/null | grep -v "// "
  ERRORS=$((ERRORS + 1))
else
  echo "✅ No hardcoded 'Base' network references"
fi

# Check that EVM logo exists
if [ -f "$PROJECT_ROOT/src/components/icons/evm-logo.tsx" ]; then
  echo "✅ EVM logo component exists"
else
  echo "❌ EVM logo component missing"
  ERRORS=$((ERRORS + 1))
fi

# Check that EVM chain selector exists
if [ -f "$PROJECT_ROOT/src/components/evm-chain-selector.tsx" ]; then
  echo "✅ EVM chain selector component exists"
else
  echo "❌ EVM chain selector component missing"
  ERRORS=$((ERRORS + 1))
fi

# Check for BSC logo
if [ -f "$PROJECT_ROOT/src/components/icons/bsc-logo.tsx" ]; then
  echo "✅ BSC logo component exists"
else
  echo "❌ BSC logo component missing"
  ERRORS=$((ERRORS + 1))
fi

# Check for Jeju logo
if [ -f "$PROJECT_ROOT/src/components/icons/jeju-logo.tsx" ]; then
  echo "✅ Jeju logo component exists"
else
  echo "❌ Jeju logo component missing"
  ERRORS=$((ERRORS + 1))
fi

# Check multiwallet context has selectedEVMChain
if grep -q "selectedEVMChain" "$PROJECT_ROOT/src/components/multiwallet.tsx"; then
  echo "✅ Multiwallet context has selectedEVMChain state"
else
  echo "❌ Multiwallet context missing selectedEVMChain state"
  ERRORS=$((ERRORS + 1))
fi

# Check that tests use Jeju Localnet
JEJU_TESTS=$(grep -r "Jeju Localnet" "$PROJECT_ROOT/e2e" --include="*.spec.ts" 2>/dev/null | wc -l)
if [ "$JEJU_TESTS" -gt 10 ]; then
  echo "✅ Playwright tests configured for Jeju Localnet ($JEJU_TESTS references)"
else
  echo "❌ Playwright tests not properly configured for Jeju Localnet"
  ERRORS=$((ERRORS + 1))
fi

# Check test startup script uses Jeju
if grep -q "Jeju Localnet" "$PROJECT_ROOT/scripts/test-playwright-start.sh"; then
  echo "✅ Test startup script configured for Jeju"
else
  echo "❌ Test startup script not configured for Jeju"
  ERRORS=$((ERRORS + 1))
fi

# Check chain types include all three chains
if grep -q '"base" | "bsc" | "jeju"' "$PROJECT_ROOT/src/types/index.ts"; then
  echo "✅ EVMChain type includes Base, BSC, and Jeju"
else
  echo "❌ EVMChain type incomplete"
  ERRORS=$((ERRORS + 1))
fi

echo ""
if [ $ERRORS -eq 0 ]; then
  echo "✅ All multi-chain support checks passed"
  exit 0
else
  echo "❌ Found $ERRORS issues with multi-chain support"
  exit 1
fi

