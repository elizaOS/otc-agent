# E2E Testing Quick Start

## TL;DR

```bash
# Run all tests
npm run test:e2e

# Debug a failing test
npm run test:e2e:debug

# View results
npm run test:e2e:report
```

## First Time Setup

1. **Install Playwright browsers** (one-time):
   ```bash
   npx playwright install chromium
   ```

2. **Verify setup**:
   ```bash
   npx playwright --version
   # Should show: Version 1.55+ 
   ```

## Running Tests

### Full Suite (Recommended)

```bash
npm run test:e2e
```

This automatically:
- ✅ Starts Hardhat node
- ✅ Deploys contracts
- ✅ Starts Solana validator
- ✅ Starts Next.js server
- ✅ Seeds test data
- ✅ Runs all tests
- ✅ Generates report

### Quick Tests (Services Running)

If you already have `npm run dev` running:

```bash
# Playwright will reuse existing servers
npm run test:e2e
```

### Debug Mode

```bash
# Run with Playwright Inspector
npm run test:e2e:debug

# Run specific test
npm run test:e2e:single -- "wallet"

# Run in headed mode (see browser)
npm run test:e2e:headed
```

## What Gets Tested

### Pages (100% Coverage)
- ✅ `/` - Marketplace with filters
- ✅ `/consign` - Create listing form
- ✅ `/my-deals` - User's purchases/listings  
- ✅ `/deal/[id]` - Deal completion
- ✅ `/token/[id]` - Token detail + chat
- ✅ `/how-it-works` - Onboarding
- ✅ `/privacy` - Privacy policy
- ✅ `/terms` - Terms of service

### Wallet Testing

**EVM (Base/Ethereum)**:
- ✅ Connect via MetaMask (Dappwright automation)
- ✅ Sign transactions
- ✅ Approve/reject flows
- ✅ Network switching
- ✅ Full contract interactions

**Solana**:
- ✅ UI testing with mocked Phantom
- ✅ Network selection
- ✅ Chain validation
- ⚠️ Real transaction signing requires manual QA

### Complete Flows
- ✅ Buyer: Connect → negotiate → accept → pay
- ✅ Seller: Connect → list tokens → monitor
- ✅ Error handling and rejection
- ✅ Multi-step forms
- ✅ Modal interactions

## Understanding Test Results

### Success
```
✅ All E2E tests passed
```

### Failure
Tests generate:
- Screenshots of failures
- Video recordings
- Trace files for debugging
- HTML report with details

View with:
```bash
npm run test:e2e:report
```

## Common Scenarios

### "Tests timeout on wallet connection"

**Cause**: MetaMask extension downloading on first run

**Solution**: Wait for first run (can take 5-10 min) or increase timeout

### "No tokens available to test"

**Cause**: Seed script didn't run

**Solution**: 
```bash
bun scripts/seed-tokens.ts
```

### "Agent not responding"

**Cause**: Agent service may be offline

**Solution**: Tests should pass anyway - they handle agent absence gracefully

### "Port already in use"

**Cause**: Previous test run didn't clean up

**Solution**:
```bash
pkill -9 -f "hardhat node"
pkill -9 -f "next dev"
lsof -t -i:2222 | xargs kill -9
lsof -t -i:8545 | xargs kill -9
```

## Test File Organization

```
e2e/
├── 01-pages.spec.ts           # Page loads, navigation
├── 02-evm-wallet.spec.ts      # MetaMask flows
├── 03-solana-wallet.spec.ts   # Solana UI (mocked)
├── 04-complete-flows.spec.ts  # End-to-end journeys
├── 05-components.spec.ts      # UI components
├── 06-modals-and-dialogs.spec.ts  # Modal behavior
├── helpers/
│   └── walletTest.ts          # Shared wallet fixture
└── README.md                  # Comprehensive guide
```

## Writing New Tests

### Basic Test

```typescript
import { test, expect } from '@playwright/test';

test('my feature', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button')).toBeVisible();
});
```

### Web3 Test

```typescript
import { test } from './helpers/walletTest';

test('wallet feature', async ({ page, wallet }) => {
  await page.goto('/');
  await page.click('[data-testid="connect"]');
  await wallet.approve(); // MetaMask approval
  
  await page.click('[data-testid="sign"]');
  await wallet.confirmTransaction(); // Sign tx
});
```

## CI/CD Integration

Tests run automatically in CI with:
- 2 retries for flaky tests
- Video/screenshot capture
- Trace retention on failure
- HTML report artifact

## Next Steps

1. Run tests: `npm run test:e2e`
2. Review report: `npm run test:e2e:report`
3. Read full guide: [`README.md`](README.md)
4. Write your first test!

## Support

- 📚 [Full README](README.md)
- 🎭 [Playwright Docs](https://playwright.dev)
- 🦊 [Dappwright Docs](https://github.com/TenKeyLabs/dappwright)

