#!/bin/bash

echo "🔍 Verifying E2E Test Setup"
echo "═══════════════════════════════════════════════"
echo ""

ERRORS=0

# Check Playwright installation
echo "1. Checking Playwright installation..."
if command -v playwright &> /dev/null || npx playwright --version &> /dev/null; then
  VERSION=$(npx playwright --version 2>/dev/null)
  echo "   ✅ Playwright installed: $VERSION"
else
  echo "   ❌ Playwright not installed"
  echo "      Run: npm install"
  ERRORS=$((ERRORS + 1))
fi

# Check Chromium browser
echo ""
echo "2. Checking Chromium browser..."
BROWSER_CHECK=$(npx playwright install chromium --dry-run 2>&1)
if echo "$BROWSER_CHECK" | grep -q "is already installed" || echo "$BROWSER_CHECK" | grep -q "browsers are already installed"; then
  echo "   ✅ Chromium browser installed"
else
  echo "   ⚠️  Chromium may need installation"
  echo "      Run: npx playwright install chromium"
  # Don't count as error - may be installed but check is flaky
fi

# Check test files exist
echo ""
echo "3. Checking test files..."
TEST_COUNT=$(find e2e -name "*.spec.ts" -type f | wc -l | tr -d ' ')
if [ "$TEST_COUNT" -ge 6 ]; then
  echo "   ✅ Found $TEST_COUNT test files"
else
  echo "   ❌ Expected 6+ test files, found $TEST_COUNT"
  ERRORS=$((ERRORS + 1))
fi

# Check test discovery
echo ""
echo "4. Checking test discovery..."
if npx playwright test --list > /dev/null 2>&1; then
  TOTAL_TESTS=$(npx playwright test --list 2>&1 | grep -c "›")
  echo "   ✅ Discovered $TOTAL_TESTS tests"
else
  echo "   ❌ Failed to discover tests"
  ERRORS=$((ERRORS + 1))
fi

# Check startup script
echo ""
echo "5. Checking startup script..."
if [ -f "scripts/test-playwright-start.sh" ] && [ -x "scripts/test-playwright-start.sh" ]; then
  echo "   ✅ Startup script exists and is executable"
else
  echo "   ❌ Startup script missing or not executable"
  if [ -f "scripts/test-playwright-start.sh" ]; then
    echo "      Run: chmod +x scripts/test-playwright-start.sh"
  fi
  ERRORS=$((ERRORS + 1))
fi

# Check documentation
echo ""
echo "6. Checking documentation..."
DOC_COUNT=$(find e2e -name "*.md" -type f | wc -l | tr -d ' ')
if [ "$DOC_COUNT" -ge 4 ]; then
  echo "   ✅ Found $DOC_COUNT documentation files"
else
  echo "   ⚠️  Found $DOC_COUNT documentation files (expected 4+)"
fi

# Check package.json scripts
echo ""
echo "7. Checking package.json scripts..."
if grep -q "test:e2e.*playwright test" package.json; then
  echo "   ✅ E2E scripts configured"
else
  echo "   ❌ E2E scripts not configured in package.json"
  ERRORS=$((ERRORS + 1))
fi

# Check dependencies
echo ""
echo "8. Checking dependencies..."
MISSING_DEPS=0

if ! grep -q "@playwright/test" package.json; then
  echo "   ❌ Missing: @playwright/test"
  MISSING_DEPS=$((MISSING_DEPS + 1))
fi

if ! grep -q "@tenkeylabs/dappwright" package.json; then
  echo "   ❌ Missing: @tenkeylabs/dappwright"
  MISSING_DEPS=$((MISSING_DEPS + 1))
fi

if [ $MISSING_DEPS -eq 0 ]; then
  echo "   ✅ All required dependencies present"
else
  echo "      Run: npm install"
  ERRORS=$((ERRORS + 1))
fi

# Summary
echo ""
echo "═══════════════════════════════════════════════"
if [ $ERRORS -eq 0 ]; then
  echo "✅ E2E Test Setup Complete"
  echo ""
  echo "Ready to run tests:"
  echo "  npm run test:e2e"
  echo ""
  echo "Or start with a quick test:"
  echo "  npm run test:e2e:pages"
else
  echo "❌ Setup Incomplete ($ERRORS errors)"
  echo ""
  echo "Fix the errors above, then run this script again."
  exit 1
fi
echo "═══════════════════════════════════════════════"

