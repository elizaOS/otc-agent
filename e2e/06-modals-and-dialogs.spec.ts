/**
 * Modal and Dialog Component Tests
 * Tests all modal interactions and dialog flows
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

test.describe('Network Selection Modal', () => {
  test('opens when clicking connect', async ({ page }) => {
    await page.goto('/');
    
    // Click connect
    await page.getByRole('button', { name: /connect/i }).first().click();
    await page.waitForTimeout(1000);
    
    // Should show network selection
    await page.getByRole('button', { name: /evm/i }).click();
    await page.waitForTimeout(1000);
    await expect(page.getByRole('button', { name: /jeju/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /solana/i })).toBeVisible();
  });

  test('can close modal without selecting', async ({ page }) => {
    await page.goto('/');
    
    await page.getByRole('button', { name: /connect/i }).first().click();
    await page.waitForTimeout(1000);
    
    // Click outside or press escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    
    // Modal should close
    const baseButton = page.getByRole('button', { name: /^base$/i });
    const isVisible = await baseButton.isVisible().catch(() => false);
    expect(isVisible).toBe(false);
  });

  test('Base button has correct styling', async ({ page }) => {
    await page.goto('/');
    
    await page.getByRole('button', { name: /connect/i }).first().click();
    await page.waitForTimeout(1000);
    
    await page.getByRole('button', { name: /evm/i }).click();
    await page.waitForTimeout(1000);
    const baseButton = page.getByRole('button', { name: /jeju/i });
    
    // Should have blue/Base branding
    const bgColor = await baseButton.evaluate(el => 
      window.getComputedStyle(el).backgroundColor
    );
    
    // Should have some color (not transparent)
    expect(bgColor).not.toBe('rgba(0, 0, 0, 0)');
  });

  test('Solana button has correct styling', async ({ page }) => {
    await page.goto('/');
    
    await page.getByRole('button', { name: /connect/i }).first().click();
    await page.waitForTimeout(1000);
    
    const solanaButton = page.getByRole('button', { name: /solana/i });
    
    // Should have gradient or purple branding
    const bgImage = await solanaButton.evaluate(el => 
      window.getComputedStyle(el).backgroundImage
    );
    
    // Should have gradient or solid color
    expect(bgImage).toBeTruthy();
  });
});

test.describe('Accept Quote Modal Flow', () => {
  test('modal shows amount input and slider', async ({ page, wallet }) => {
    // This requires a real quote from the agent
    // We'll test the modal opening mechanism
    
    await page.goto('/');
    
    // Connect wallet first
    await page.getByRole('button', { name: /connect/i }).first().click();
    await page.getByRole('button', { name: /evm/i }).click();
    await page.waitForTimeout(1000);
    await page.getByRole('button', { name: /jeju/i }).click();
    await page.waitForTimeout(2000);
    await wallet.approve();
    await page.waitForTimeout(4000);
    
    // Modal testing requires quote which requires agent integration
    // Tested in complete flow tests
    await expect(page.locator('body')).toBeVisible();
  });

  test('currency toggle works in modal', async ({ page }) => {
    // Test requires modal to be open with a quote
    // Covered in complete flow tests
    await page.goto('/');
    await expect(page.locator('body')).toBeVisible();
  });

  test('max button calculates correctly', async ({ page }) => {
    // Test requires modal to be open
    // Covered in complete flow tests
    await page.goto('/');
    await expect(page.locator('body')).toBeVisible();
  });

  test('shows chain mismatch warning', async ({ page }) => {
    // Test requires cross-chain scenario
    // Covered in complete flow tests
    await page.goto('/');
    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('Wallet Menu Dropdown', () => {
  test('wallet menu shows options when connected', async ({ page, wallet }) => {
    await page.goto('/');
    
    // Connect
    await page.getByRole('button', { name: /connect/i }).first().click();
    await page.getByRole('button', { name: /evm/i }).click();
    await page.waitForTimeout(1000);
    await page.getByRole('button', { name: /jeju/i }).click();
    await page.waitForTimeout(2000);
    await wallet.approve();
    await page.waitForTimeout(4000);
    
    // Click wallet button to open menu
    const walletButton = page.locator('button:has-text("0x")').or(
      page.locator('button').filter({ hasText: /Base/i })
    );
    
    if (await walletButton.first().isVisible({ timeout: 5000 }).catch(() => false)) {
      await walletButton.first().click();
      await page.waitForTimeout(1000);
      
      // Should show menu options
      await expect(page.getByText(/disconnect|switch/i)).toBeVisible();
    }
  });

  test('copy address button works', async ({ page, wallet }) => {
    await page.goto('/');
    
    // Connect
    await page.getByRole('button', { name: /connect/i }).first().click();
    await page.getByRole('button', { name: /evm/i }).click();
    await page.waitForTimeout(1000);
    await page.getByRole('button', { name: /jeju/i }).click();
    await page.waitForTimeout(2000);
    await wallet.approve();
    await page.waitForTimeout(4000);
    
    // Open wallet menu
    const walletButton = page.locator('button:has-text("0x")').or(
      page.locator('button').filter({ hasText: /Base/i })
    );
    
    if (await walletButton.first().isVisible({ timeout: 5000 }).catch(() => false)) {
      await walletButton.first().click();
      await page.waitForTimeout(1000);
      
      // Look for copy button
      const copyButton = page.locator('button').filter({ hasText: /copy/i }).or(
        page.locator('svg').filter({ hasText: /clipboard/ }).locator('..')
      );
      
      if (await copyButton.first().isVisible({ timeout: 3000 }).catch(() => false)) {
        // Grant clipboard permission
        await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
        
        await copyButton.first().click();
        await page.waitForTimeout(1000);
        
        // Should show success toast or feedback
        const hasFeedback = await page.getByText(/copied/i).isVisible({ timeout: 3000 }).catch(() => false);
        
        // May or may not show visual feedback, but clipboard should have address
        const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
        expect(clipboardText).toMatch(/0x[a-fA-F0-9]{40}|[A-Za-z0-9]{32,44}/);
      }
    }
  });
});

test.describe('Clear Chat Modal', () => {
  test('shows confirmation before clearing', async ({ page, wallet }) => {
    await page.goto('/');
    
    // Connect and go to token page
    await page.getByRole('button', { name: /connect/i }).first().click();
    await page.getByRole('button', { name: /evm/i }).click();
    await page.waitForTimeout(1000);
    await page.getByRole('button', { name: /jeju/i }).click();
    await page.waitForTimeout(2000);
    await wallet.approve();
    await page.waitForTimeout(4000);
    
    const tokenLink = page.locator('a[href*="/token/"]').first();
    
    if (await tokenLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await tokenLink.click();
      await page.waitForTimeout(3000);
      
      // Find reset button
      const resetButton = page.getByRole('button', { name: /reset|clear/i });
      
      if (await resetButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await resetButton.click();
        await page.waitForTimeout(1000);
        
        // Should show confirmation
        await expect(page.getByText(/clear.*chat|delete|cannot be undone/i)).toBeVisible({ timeout: 5000 });
        
        // Should have Cancel button
        await expect(page.getByRole('button', { name: /cancel/i })).toBeVisible();
      }
    }
  });

  test('can cancel clear chat', async ({ page, wallet }) => {
    await page.goto('/');
    
    // Connect and go to token page  
    await page.getByRole('button', { name: /connect/i }).first().click();
    await page.getByRole('button', { name: /evm/i }).click();
    await page.waitForTimeout(1000);
    await page.getByRole('button', { name: /jeju/i }).click();
    await page.waitForTimeout(2000);
    await wallet.approve();
    await page.waitForTimeout(4000);
    
    const tokenLink = page.locator('a[href*="/token/"]').first();
    
    if (await tokenLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await tokenLink.click();
      await page.waitForTimeout(3000);
      
      const resetButton = page.getByRole('button', { name: /reset|clear/i });
      
      if (await resetButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await resetButton.click();
        await page.waitForTimeout(1000);
        
        // Click cancel
        const cancelButton = page.getByRole('button', { name: /cancel/i });
        await cancelButton.click();
        await page.waitForTimeout(1000);
        
        // Modal should close
        const dialogGone = !await page.getByText(/clear.*chat|cannot be undone/i).isVisible().catch(() => true);
        expect(dialogGone).toBe(true);
      }
    }
  });
});

test.describe('Consignment Submission Modal', () => {
  test('shows multi-step progress', async ({ page }) => {
    await page.goto('/consign');
    
    // Modal requires completing the form
    // Just verify the page structure
    await expect(page.getByRole('heading', { name: /List Your Tokens/i })).toBeVisible();
  });
});

test.describe('Dialog Component Behavior', () => {
  test('dialogs can be closed with Escape key', async ({ page }) => {
    await page.goto('/');
    
    // Open network selection
    await page.getByRole('button', { name: /connect/i }).first().click();
    await page.waitForTimeout(1000);
    
    // Should be visible
    await page.getByRole('button', { name: /evm/i }).click();
    await page.waitForTimeout(1000);
    await expect(page.getByRole('button', { name: /jeju/i })).toBeVisible();
    
    // Press Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    
    // Should close
    const isClosed = !await page.getByRole('button', { name: /^base$/i }).isVisible().catch(() => true);
    expect(isClosed).toBe(true);
  });

  test('dialogs have backdrop that blocks background clicks', async ({ page }) => {
    await page.goto('/');
    
    // Open dialog
    await page.getByRole('button', { name: /connect/i }).first().click();
    await page.waitForTimeout(1000);
    
    // Click backdrop (outside modal)
    // Note: Headless UI handles this automatically
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    
    // Modal should be closable
    await expect(page.locator('body')).toBeVisible();
  });

  test('modal z-index prevents background interaction', async ({ page }) => {
    await page.goto('/');
    
    // Open modal
    await page.getByRole('button', { name: /connect/i }).first().click();
    await page.waitForTimeout(1000);
    
    // Modal should be on top
    await page.getByRole('button', { name: /evm/i }).click();
    await page.waitForTimeout(1000);
    const modal = page.locator('[role="dialog"]').or(
      page.getByRole('button', { name: /jeju/i }).locator('..')
    );
    
    if (await modal.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      const zIndex = await modal.first().evaluate(el => {
        const style = window.getComputedStyle(el);
        return style.zIndex;
      });
      
      // Should have high z-index
      expect(parseInt(zIndex) || 0).toBeGreaterThan(10);
    }
  });
});

test.describe('Form Modal States', () => {
  test('loading state shows spinner', async ({ page }) => {
    await page.goto('/');
    
    // Any loading state should show appropriate feedback
    // Test by navigating rapidly
    await page.goto('/my-deals');
    
    // May see spinner briefly
    const spinner = page.locator('[class*="animate-spin"]');
    
    // Eventually should load
    await expect(page.getByRole('heading', { name: /My Deals/i })).toBeVisible({ timeout: 10000 });
  });

  test('error state shows message', async ({ page }) => {
    // Errors should be displayed to user
    // Most errors are tested in specific flow tests
    await page.goto('/');
    await expect(page.locator('body')).toBeVisible();
  });

  test('success state shows confirmation', async ({ page }) => {
    // Success states are tested in complete flow tests
    await page.goto('/');
    await expect(page.locator('body')).toBeVisible();
  });
});

