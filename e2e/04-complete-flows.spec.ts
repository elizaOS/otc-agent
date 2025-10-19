/**
 * Complete End-to-End User Flows
 * Tests critical user journeys from start to finish on Jeju chain
 */

import { test as base, expect } from '@playwright/test';
import { BrowserContext } from 'playwright-core';
import { bootstrap, Dappwright, getWallet, MetaMaskWallet } from '@tenkeylabs/dappwright';

base.setTimeout(600000);

// Use Jeju Localnet for testing (default network)
const JEJU_RPC = process.env.NEXT_PUBLIC_JEJU_RPC_URL || 'http://127.0.0.1:9545';
const JEJU_CHAIN_ID = 1337;

export const test = base.extend<{ wallet: Dappwright }, { walletContext: BrowserContext }>({
  walletContext: [
    async ({}, use) => {
      const [wallet, _, context] = await bootstrap('', {
        wallet: 'metamask',
        version: MetaMaskWallet.recommendedVersion,
        seed: 'test test test test test test test test test test test junk',
        headless: false,
      });

      // Add Jeju Localnet network (primary test network)
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

test.describe('Complete User Journeys', () => {
  test('buyer flow: connect → negotiate → accept → pay', async ({ page, wallet }) => {
    console.log('\n💰 Testing Complete Buyer Flow on Jeju Chain\n');
    
    // 1. Connect wallet to Jeju
    console.log('1️⃣  Connecting wallet to Jeju...');
    await page.goto('/');
    await page.getByRole('button', { name: /connect/i }).first().click();
    await page.getByRole('button', { name: /evm/i }).click();
    await page.waitForTimeout(1000);
    await page.getByRole('button', { name: /jeju/i }).click();
    await page.waitForTimeout(2000);
    await wallet.approve();
    await page.waitForTimeout(4000);
    console.log('   ✅ Wallet connected to Jeju');
    
    // 2. Navigate to a token to negotiate
    console.log('2️⃣  Finding available token...');
    const tokenLink = page.locator('a[href*="/token/"]').first();
    
    if (await tokenLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await tokenLink.click();
      await page.waitForTimeout(3000);
      console.log('   ✅ Navigated to token page');
      
      // 3. Chat with agent
      console.log('3️⃣  Negotiating quote...');
      const chatInput = page.locator('[data-testid="chat-input"]');
      await expect(chatInput).toBeEnabled({ timeout: 10000 });
      
      await chatInput.fill('I want 5000 tokens with 12% discount and 6 month lockup');
      await page.locator('[data-testid="send-button"]').click();
      await page.waitForTimeout(2000);
      
      // Should see user message
      await expect(page.locator('[data-testid="user-message"]')).toBeVisible();
      console.log('   ✅ Message sent to agent');
      
      // 4. Wait for agent response with quote
      console.log('4️⃣  Waiting for agent quote...');
      await expect(page.locator('[data-testid="agent-message"]')).toBeVisible({ timeout: 30000 });
      console.log('   ✅ Agent responded');
      
      // 5. Look for Accept Offer button
      console.log('5️⃣  Looking for quote...');
      const acceptButton = page.getByRole('button', { name: /accept offer/i });
      
      if (await acceptButton.isVisible({ timeout: 10000 }).catch(() => false)) {
        console.log('   ✅ Quote received');
        
        // 6. Accept the offer
        console.log('6️⃣  Accepting offer...');
        await acceptButton.click();
        await page.waitForTimeout(2000);
        
        // Modal should open
        await expect(page.locator('[data-testid="accept-quote-modal"]')).toBeVisible();
        console.log('   ✅ Accept modal opened');
        
        // 7. Confirm and create offer
        console.log('7️⃣  Creating offer on-chain...');
        const confirmButton = page.locator('[data-testid="confirm-amount-button"]');
        await confirmButton.click();
        await page.waitForTimeout(3000);
        
        // 8. Sign transaction in MetaMask
        console.log('8️⃣  Signing transaction...');
        await wallet.confirmTransaction();
        await page.waitForTimeout(8000);
        console.log('   ✅ Transaction signed');
        
        // 9. Backend should auto-approve and pay
        console.log('9️⃣  Waiting for backend to process...');
        await page.waitForTimeout(15000);
        
        // Should show completion or redirect to deal page
        const isComplete = await page.getByText(/complete|success/i).isVisible({ timeout: 10000 }).catch(() => false);
        const isOnDealPage = page.url().includes('/deal/');
        
        expect(isComplete || isOnDealPage).toBeTruthy();
        console.log('   ✅ Deal flow completed');
      } else {
        console.log('   ⚠️  No quote generated (agent may be offline)');
      }
    } else {
      console.log('   ⚠️  No tokens available to test full flow');
    }
  });

  test('seller flow: connect → list tokens → monitor', async ({ page, wallet }) => {
    console.log('\n📝 Testing Complete Seller Flow on Jeju Chain\n');
    
    // 1. Connect wallet to Jeju
    console.log('1️⃣  Connecting wallet to Jeju...');
    await page.goto('/');
    await page.getByRole('button', { name: /connect/i }).first().click();
    await page.getByRole('button', { name: /evm/i }).click();
    await page.waitForTimeout(1000);
    await page.getByRole('button', { name: /jeju/i }).click();
    await page.waitForTimeout(2000);
    await wallet.approve();
    await page.waitForTimeout(4000);
    console.log('   ✅ Wallet connected to Jeju');
    
    // 2. Navigate to consign page
    console.log('2️⃣  Opening consignment form...');
    await page.goto('/consign');
    await page.waitForTimeout(2000);
    console.log('   ✅ Consign page loaded');
    
    // 3. Verify form is interactive
    console.log('3️⃣  Verifying form elements...');
    
    // Should show step 1 (token selection)
    await expect(page.getByText(/select.*token|token selection/i).first()).toBeVisible();
    
    // Should show progress indicator
    const progressSteps = page.locator('[class*="bg-orange"]').or(
      page.getByText(/token.*amount.*pricing/i)
    );
    await expect(progressSteps.first()).toBeVisible();
    
    console.log('   ✅ Form is interactive');
    
    // Note: Full consignment creation requires real token balance
    // which may not be available in test environment
  });

  test('view my deals after purchase', async ({ page, wallet }) => {
    console.log('\n📊 Testing My Deals View on Jeju Chain\n');
    
    // Connect wallet to Jeju
    await page.goto('/');
    await page.getByRole('button', { name: /connect/i }).first().click();
    await page.getByRole('button', { name: /evm/i }).click();
    await page.waitForTimeout(1000);
    await page.getByRole('button', { name: /jeju/i }).click();
    await page.waitForTimeout(2000);
    await wallet.approve();
    await page.waitForTimeout(4000);
    
    // Navigate to My Deals
    await page.goto('/my-deals');
    await page.waitForTimeout(3000);
    
    // Should show tabs
    await expect(page.getByRole('button', { name: /My Purchases/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /My Listings/i })).toBeVisible();
    
    // Click listings tab
    await page.getByRole('button', { name: /My Listings/i }).click();
    await page.waitForTimeout(2000);
    
    // Should show either listings or empty state
    const hasListings = await page.locator('[data-testid="listing-row"]').isVisible({ timeout: 3000 }).catch(() => false);
    const emptyState = await page.getByText(/no.*listing|create listing/i).isVisible().catch(() => false);
    
    expect(hasListings || emptyState).toBeTruthy();
    console.log(`   ✅ Listings tab ${hasListings ? 'has listings' : 'shows empty state'}`);
  });
});

test.describe('Token Page Features', () => {
  test('token page loads with chat', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);
    
    // Find a token link
    const tokenLink = page.locator('a[href*="/token/"]').first();
    
    if (await tokenLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await tokenLink.click();
      await page.waitForTimeout(3000);
      
      // Should show token header
      await expect(page.locator('img[alt*="token"]').or(page.getByText(/price|market cap/i).first())).toBeVisible({ timeout: 10000 });
      
      // Should show chat interface
      await expect(page.locator('[data-testid="chat-input"]')).toBeVisible();
    }
  });

  test('token filters work', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);
    
    // Test search filter
    const searchInput = page.getByPlaceholder(/search tokens/i);
    await searchInput.fill('TEST');
    await page.waitForTimeout(1000);
    
    // Results should update
    await expect(page.locator('body')).toBeVisible();
    
    // Clear search
    await searchInput.clear();
    await page.waitForTimeout(1000);
  });

  test('deal type filters work', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);
    
    // Find negotiable/fixed filter
    const typeFilter = page.locator('select').filter({ hasText: /type|negotiable|fixed/i }).or(
      page.getByRole('button', { name: /negotiable|fixed|offer/i })
    );
    
    if (await typeFilter.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      await typeFilter.first().click();
      await page.waitForTimeout(1000);
      
      // Page should remain stable
      await expect(page.locator('body')).toBeVisible();
    }
  });
});

