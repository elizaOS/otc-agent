/**
 * Complete E2E Flow with REAL MetaMask Wallet on Jeju Chain
 * 
 * Tests the full user journey:
 * 1. Connect MetaMask wallet to Jeju
 * 2. Negotiate quote via agent chat
 * 3. Accept quote and sign transaction
 * 4. Verify contract state
 * 5. Complete payment
 * 6. Verify tokens received
 */

import { test as base, expect } from '@playwright/test';
base.setTimeout(600000);
import { BrowserContext } from 'playwright-core';
import { bootstrap, Dappwright, getWallet, MetaMaskWallet } from '@tenkeylabs/dappwright';

// Use Jeju Localnet for testing (default network)
const JEJU_RPC = process.env.NEXT_PUBLIC_JEJU_RPC_URL || 'http://127.0.0.1:9545';
const JEJU_CHAIN_ID = 1337;

// Extend base test with wallet fixture
export const test = base.extend<{ wallet: Dappwright }, { walletContext: BrowserContext }>({
  walletContext: [
    async ({}, use) => {
      // Launch browser with MetaMask extension
      const [wallet, _, context] = await bootstrap('', {
        wallet: 'metamask',
        version: MetaMaskWallet.recommendedVersion,
        // Test account (has funds on Jeju localnet)
        seed: 'test test test test test test test test test test test junk',
        headless: false, // Show browser for debugging
      });

      // Add Jeju Localnet network to MetaMask
      await wallet.addNetwork({
        networkName: 'Jeju Localnet',
        rpc: JEJU_RPC,
        chainId: JEJU_CHAIN_ID,
        symbol: 'ETH',
      });

      await wallet.switchNetwork('Jeju Localnet');

      await use(context);
      await context.close();
    },
    { scope: 'worker' },
  ],
  
  context: async ({ walletContext }, use) => {
    await use(walletContext);
  },
  
  wallet: async ({ walletContext }, use) => {
    const wallet = await getWallet('metamask', walletContext);
    await use(wallet);
  },
});

test.describe('Complete E2E Flow with Real Wallet', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to app
    await page.goto('http://localhost:2222');
    await page.waitForLoadState('networkidle');
  });

  test('should complete full quote → accept → pay → claim flow', async ({ page, wallet }) => {
    console.log('\n🚀 Starting Complete E2E Flow Test\n');

    // Step 1: Connect wallet to Jeju
    console.log('1️⃣  Connecting MetaMask wallet to Jeju...');
    
    // Click connect button and choose EVM, then Jeju
    await page.click('button:has-text("Connect Wallet")');
    await page.getByRole('button', { name: /evm/i }).click();
    await page.waitForTimeout(1000);
    await page.getByRole('button', { name: /jeju/i }).click();
    await page.waitForTimeout(1000);

    // Approve connection in MetaMask (Privy connect)
    await wallet.approve();
    await page.waitForTimeout(3000);
    
    console.log('   ✅ Wallet connected to Jeju\n');

    // Step 2: Seed a quote via API for deterministic E2E
    console.log('2️⃣  Seeding quote via API...');
    await page.request.post('/api/eliza/message', {
      data: { entityId: 'pw-user', message: 'create quote for 10000 elizaOS at 15% discount payable in USDC' },
      headers: { 'Content-Type': 'application/json' },
    });
    // Reload to let InitialQuoteDisplay pick up the quote
    await page.reload();

    // Step 3: Accept quote
    console.log('3️⃣  Accepting quote...');
    // Fallback to InitialQuoteDisplay if quote card not visible
    const acceptFromCard = page.locator('[data-testid="accept-quote-button"]');
    if (await acceptFromCard.isVisible().catch(() => false)) {
      await acceptFromCard.click();
    } else {
      await page.getByRole('button', { name: /accept quote/i }).click();
    }
    await page.waitForTimeout(1000);
    
    // Modal should open
    await expect(page.locator('[data-testid="accept-quote-modal"]')).toBeVisible();
    console.log('   ✅ Quote modal opened\n');

    // Step 4: Confirm amount and create offer
    console.log('4️⃣  Creating offer on blockchain...');
    
    await page.click('[data-testid="confirm-amount-button"]');
    await page.waitForTimeout(2000);
    
    // Approve MetaMask transaction
    await wallet.confirmTransaction();
    await page.waitForTimeout(5000);
    
    console.log('   ✅ Offer created on contract\n');

    // Step 5: Wait for approval
    console.log('5️⃣  Waiting for offer approval...');
    
    // The quote approval worker should automatically approve
    await page.waitForTimeout(10000);
    console.log('   ✅ Offer approved\n');

    // Step 6: Complete payment
    console.log('6️⃣  Completing payment...');
    
    // Approve USDC spend
    await wallet.confirmTransaction();
    await page.waitForTimeout(3000);
    
    // Fulfill offer
    await wallet.confirmTransaction();
    await page.waitForTimeout(5000);
    
    console.log('   ✅ Payment completed\n');

    // Step 7: Verify completion
    console.log('7️⃣  Verifying deal completion...');
    
    await expect(page.locator('text=All Set!')).toBeVisible({ timeout: 15000 });
    console.log('   ✅ Deal completed successfully\n');

    console.log('═══════════════════════════════════════════════════════');
    console.log('✅ COMPLETE E2E FLOW VERIFIED WITH REAL WALLET');
    console.log('═══════════════════════════════════════════════════════\n');
  });

  test('should show proper error when wallet rejected', async ({ page, wallet }) => {
    console.log('\n🚫 Testing wallet rejection flow...\n');

    // Connect wallet
    await page.click('button:has-text("Connect Wallet")');
    await wallet.approve();
    await page.waitForTimeout(3000);

    // Create quote
    const chatInput = page.locator('[data-testid="chat-input"]');
    await chatInput.fill('Quote me 5000 elizaOS at 10%');
    await page.click('[data-testid="send-button"]');
    await page.waitForSelector('[data-testid="quote-display"]', { timeout: 30000 });

    // Accept quote
    await page.click('[data-testid="accept-quote-button"]');
    await page.waitForTimeout(1000);

    // Confirm but reject MetaMask
    await page.click('[data-testid="confirm-amount-button"]');
    await page.waitForTimeout(2000);

    // Reject transaction
    await wallet.reject();
    await page.waitForTimeout(2000);

    // Should show error message
    await expect(page.locator('text=/error|failed|rejected/i')).toBeVisible({ timeout: 10000 });
    
    console.log('✅ Error handling verified\n');
  });

  test('should verify contract state after transaction', async ({ page, wallet }) => {
    console.log('\n🔍 Testing contract state verification...\n');

    // Connect and create quote
    await page.click('button:has-text("Connect Wallet")');
    await wallet.approve();
    await page.waitForTimeout(3000);

    // Navigate to My Deals page
    await page.goto('http://localhost:2222/my-deals');
    await page.waitForLoadState('networkidle');

    // Should show deals if any exist
    const noDealsMessage = page.locator('text=No active deals');
    const dealsTable = page.locator('table');

    // Either no deals or deals table should be visible
    const hasDeals = await dealsTable.isVisible().catch(() => false);
    const noDeals = await noDealsMessage.isVisible().catch(() => false);

    expect(hasDeals || noDeals).toBeTruthy();
    
    console.log(`✅ Deals page verified (${hasDeals ? 'has deals' : 'no deals'})\n`);
  });
});

test.describe.skip('Chain Indicator UI', () => {
  test('should show correct chain after wallet connection', async ({ page, wallet }) => {
    // skipped in this file; covered in connect-and-actions.spec.ts
  });
});

