# End-to-End Testing Guide

## Overview

This project uses **Playwright** for comprehensive E2E testing, including web3 wallet interactions with both EVM (Base/Ethereum) and Solana chains.

## Test Structure

### Test Files

- `01-pages.spec.ts` - Page load, navigation, and basic UI tests
- `02-evm-wallet.spec.ts` - EVM wallet connection (MetaMask via Dappwright)
- `03-solana-wallet.spec.ts` - Solana wallet UI tests (mocked Phantom)
- `04-complete-flows.spec.ts` - Complete user journeys (buyer/seller)
- `05-components.spec.ts` - Component interactions, forms, accessibility
- `06-modals-and-dialogs.spec.ts` - Modal flows and dialog behavior
- `complete-flow-metamask.spec.ts` - Legacy complete flow test
- `connect-and-actions.spec.ts` - Legacy connection test

### Pages Tested

✅ **All Routes Covered:**
- `/` - Marketplace homepage with filters and deals
- `/consign` - Multi-step consignment creation form
- `/deal/[id]` - Deal completion and sharing
- `/how-it-works` - Onboarding and information
- `/my-deals` - User's purchases and listings
- `/privacy` - Privacy policy
- `/terms` - Terms of service
- `/token/[tokenId]` - Token detail with chat

### Components Tested

✅ **Core Components:**
- Header navigation (desktop + mobile)
- WalletConnector (EVM + Solana)
- NetworkMenu (chain switching)
- Chat interface (messages, input, agent)
- AcceptQuoteModal (amount, currency, signing)
- DealFilters (search, chain, type, fractionalized)
- ConsignmentForm (5-step wizard)
- SubmissionModal (multi-step progress)
- WalletMenu (dropdown, copy, disconnect)

## Running Tests

### Prerequisites

1. Install dependencies:
   ```bash
   npm install
   ```

2. Install Playwright browsers:
   ```bash
   npx playwright install chromium
   ```

3. Ensure services can start:
   - Hardhat node (port 8545)
   - Solana validator (port 8899) - optional
   - Next.js dev server (port 2222)

### Run All Tests

```bash
npm run test:e2e
```

This will:
1. Start all required services (Hardhat, Solana, Next.js)
2. Deploy contracts
3. Seed test data
4. Run all E2E tests
5. Generate HTML report

### Run Specific Tests

```bash
# Run only page tests
npm run test:e2e:single -- "pages"

# Run only wallet tests
npm run test:e2e:single -- "wallet"

# Run only component tests
npm run test:e2e:single -- "components"
```

### Debug Mode

```bash
# Run with Playwright Inspector
npm run test:e2e:debug

# Run headed (see browser)
npm run test:e2e:headed

# Run with UI mode (interactive)
npm run test:e2e:ui
```

### View Test Report

```bash
npm run test:e2e:report
```

## Web3 Testing

### EVM (Base/Ethereum)

- **Tool**: Dappwright (MetaMask automation)
- **Wallet**: MetaMask extension with test seed phrase
- **Network**: Hardhat local (chain ID 31337)
- **Test Account**: `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` (Hardhat #0)

**Capabilities:**
- ✅ Connect wallet
- ✅ Sign transactions
- ✅ Approve/reject transactions
- ✅ Switch networks
- ✅ Full contract interactions

### Solana

- **Tool**: Page mocking (Phantom automation is limited)
- **Wallet**: Mocked Phantom interface
- **Network**: Local validator (port 8899)
- **Test Account**: `DScqtGwFoDTme2Rzdjpdb2w7CtuKc6Z8KF7hMhbx8ugQ`

**Capabilities:**
- ✅ UI testing with mocked wallet
- ✅ Network selection
- ✅ Chain validation
- ⚠️ Transaction signing requires manual QA

**Note**: Full Solana transaction testing requires manual QA with real Phantom wallet due to automation limitations.

## Test Organization

### Serial Execution

Tests run serially (1 worker) to ensure blockchain state consistency:
- Each test may modify contract state
- Parallel execution would cause race conditions
- Database state must be consistent across tests

### Test Independence

Each test should:
- Set up its own state
- Clean up after itself
- Not depend on previous test state
- Handle missing data gracefully (e.g., no tokens seeded)

### Timeouts

- **Global**: 10 minutes (wallet extension download on first run)
- **Actions**: 30 seconds (web3 transactions can be slow)
- **Assertions**: 10-30 seconds (agent responses, contract state)

## Continuous Integration

### CI Configuration

The config automatically adjusts for CI:
- Retries: 2 (flaky web3 interactions)
- `forbidOnly`: Prevent accidentally committed `.only` tests
- Server reuse: Disabled (fresh state per run)

### Environment Variables

Required in CI:
```bash
NEXT_PUBLIC_E2E_TEST=1
NODE_ENV=development
NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8545
NEXT_PUBLIC_SOLANA_RPC_URL=http://127.0.0.1:8899
```

## Common Issues

### Wallet Extension Not Installing

**Symptom**: Tests timeout waiting for MetaMask

**Solution**:
1. Check internet connection (extension downloads from Chrome Web Store)
2. Increase timeout in config
3. Run `npx playwright install chromium --force`

### Hardhat Node Not Starting

**Symptom**: Contract deployment fails

**Solution**:
```bash
# Kill existing processes
pkill -9 -f "hardhat node"
lsof -t -i:8545 | xargs kill -9

# Start fresh
cd contracts && npx hardhat node
```

### Tests Fail Due to Missing Agent

**Symptom**: Chat tests timeout waiting for agent response

**Solution**: Tests should handle agent absence gracefully. Most tests check for agent response but don't fail if offline.

### Flaky Tests

**Symptom**: Tests pass/fail inconsistently

**Common causes**:
1. Race conditions (add explicit waits)
2. Agent timing (increase timeouts)
3. Network latency (retry mechanisms)

**Solution**: Tests have built-in retries in CI. For local debugging, use `--headed` to watch the flow.

## Writing New Tests

### Template

```typescript
import { test, expect } from '@playwright/test';

test.describe('Feature Name', () => {
  test('describes what it tests', async ({ page }) => {
    // 1. Setup
    await page.goto('/');
    
    // 2. Action
    await page.click('button');
    
    // 3. Assert
    await expect(page.locator('result')).toBeVisible();
  });
});
```

### For Web3 Tests

```typescript
import { test as base } from '@playwright/test';
import { bootstrap, getWallet } from '@tenkeylabs/dappwright';

// Use wallet fixture from helpers/walletTest.ts
// or inline wallet setup for specific tests

test('web3 interaction', async ({ page, wallet }) => {
  // Connect wallet
  await page.click('[data-testid="connect"]');
  await wallet.approve();
  
  // Sign transaction
  await page.click('[data-testid="submit"]');
  await wallet.confirmTransaction();
});
```

## Best Practices

1. **Use data-testid**: Prefer `data-testid` over text/CSS selectors
2. **Wait appropriately**: Use `waitForTimeout` sparingly, prefer `waitForSelector`
3. **Handle agent delays**: Agent responses can take 5-30 seconds
4. **Test independence**: Each test should work in isolation
5. **Graceful degradation**: Handle missing data (no tokens, no agent)
6. **Mobile-first**: Test responsive design
7. **Real flows**: Test complete user journeys, not just isolated clicks

## Coverage Goals

- ✅ All pages load without errors
- ✅ All navigation paths work
- ✅ Wallet connection (EVM + Solana UI)
- ✅ Transaction signing (EVM)
- ✅ Chat and agent interaction
- ✅ Forms and validation
- ✅ Modals and dialogs
- ✅ Error handling
- ✅ Responsive design
- ✅ Accessibility basics

## Migration from Cypress

**Deprecated**: Cypress tests in `cypress/` directory

**Reason**: Playwright provides:
- Better TypeScript support
- Superior web3 testing (Dappwright)
- Faster execution
- Better debugging tools
- Active maintenance

All Cypress tests have been migrated to Playwright.

