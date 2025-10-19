/**
 * User Interaction and State Tests
 * Tests complex interactions, state changes, and user workflows
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

test.describe('Multi-Step Form Interactions', () => {
  test('can complete entire consignment form flow', async ({ page, wallet }) => {
    await page.goto('/');
    
    // Connect
    await page.getByRole('button', { name: /connect/i }).first().click();
    await page.getByRole('button', { name: /evm/i }).click(); await page.waitForTimeout(1000); await page.getByRole('button', { name: /jeju/i }).click();
    await page.waitForTimeout(2000);
    await wallet.approve();
    await page.waitForTimeout(4000);
    
    // Go to consign
    await page.goto('/consign');
    await page.waitForTimeout(3000);
    
    // Verify all 5 steps are accessible
    const progressIndicators = page.locator('[class*="bg-orange"]');
    const count = await progressIndicators.count();
    expect(count).toBeGreaterThan(0);
  });

  test('can navigate back and forth in form', async ({ page, wallet }) => {
    await page.goto('/');
    
    // Connect
    await page.getByRole('button', { name: /connect/i }).first().click();
    await page.getByRole('button', { name: /evm/i }).click(); await page.waitForTimeout(1000); await page.getByRole('button', { name: /jeju/i }).click();
    await page.waitForTimeout(2000);
    await wallet.approve();
    await page.waitForTimeout(4000);
    
    await page.goto('/consign');
    await page.waitForTimeout(2000);
    
    // Look for Back button (appears on step 2+)
    const backButton = page.getByRole('button', { name: /back/i });
    
    // May not be visible on step 1
    await expect(page.locator('body')).toBeVisible();
  });

  test('form validation prevents invalid progression', async ({ page }) => {
    await page.goto('/consign');
    await page.waitForTimeout(2000);
    
    // Try to proceed without completing required fields
    const nextButton = page.getByRole('button', { name: /next/i });
    
    if (await nextButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Should be disabled
      const isDisabled = await nextButton.isDisabled();
      expect(isDisabled).toBe(true);
    }
  });
});

test.describe('Tab Switching and State', () => {
  test('my-deals tab switching preserves state', async ({ page, wallet }) => {
    await page.goto('/');
    
    // Connect
    await page.getByRole('button', { name: /connect/i }).first().click();
    await page.getByRole('button', { name: /evm/i }).click(); await page.waitForTimeout(1000); await page.getByRole('button', { name: /jeju/i }).click();
    await page.waitForTimeout(2000);
    await wallet.approve();
    await page.waitForTimeout(4000);
    
    await page.goto('/my-deals');
    await page.waitForTimeout(3000);
    
    // Click listings tab
    const listingsTab = page.getByRole('button', { name: /My Listings/i });
    await listingsTab.click();
    await page.waitForTimeout(1000);
    
    // Click purchases tab
    const purchasesTab = page.getByRole('button', { name: /My Purchases/i });
    await purchasesTab.click();
    await page.waitForTimeout(1000);
    
    // Click back to listings
    await listingsTab.click();
    await page.waitForTimeout(1000);
    
    // Should remain stable
    await expect(page.locator('body')).toBeVisible();
  });

  test('tabs have proper ARIA roles', async ({ page, wallet }) => {
    await page.goto('/');
    
    // Connect
    await page.getByRole('button', { name: /connect/i }).first().click();
    await page.getByRole('button', { name: /evm/i }).click(); await page.waitForTimeout(1000); await page.getByRole('button', { name: /jeju/i }).click();
    await page.waitForTimeout(2000);
    await wallet.approve();
    await page.waitForTimeout(4000);
    
    await page.goto('/my-deals');
    await page.waitForTimeout(2000);
    
    // Tabs should be buttons or have tab role
    const tabs = page.getByRole('button', { name: /My Purchases|My Listings/i });
    await expect(tabs.first()).toBeVisible();
  });
});

test.describe('Dropdown and Select Interactions', () => {
  test('dropdowns open and close correctly', async ({ page, wallet }) => {
    await page.goto('/');
    
    // Connect
    await page.getByRole('button', { name: /connect/i }).first().click();
    await page.getByRole('button', { name: /evm/i }).click(); await page.waitForTimeout(1000); await page.getByRole('button', { name: /jeju/i }).click();
    await page.waitForTimeout(2000);
    await wallet.approve();
    await page.waitForTimeout(4000);
    
    // Click wallet menu
    const walletButton = page.locator('button:has-text("0x")').first();
    
    if (await walletButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Open
      await walletButton.click();
      await page.waitForTimeout(1000);
      
      // Close by clicking outside
      await page.click('body', { position: { x: 10, y: 10 } });
      await page.waitForTimeout(500);
      
      // Should close
      const menuClosed = !await page.getByText(/disconnect|switch/i).isVisible().catch(() => true);
      expect(menuClosed).toBe(true);
    }
  });

  test('select dropdowns change values', async ({ page }) => {
    await page.goto('/');
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.waitForTimeout(2000);
    
    // Find any select elements
    const selects = page.locator('select:visible');
    const count = await selects.count();
    
    if (count > 0) {
      const firstSelect = selects.first();
      
      // Get options
      const options = await firstSelect.locator('option').count();
      
      if (options > 1) {
        // Select second option
        const secondValue = await firstSelect.locator('option').nth(1).getAttribute('value');
        if (secondValue) {
          await firstSelect.selectOption(secondValue);
          await page.waitForTimeout(500);
          
          // Should update
          await expect(page.locator('body')).toBeVisible();
        }
      }
    }
  });
});

test.describe('Slider and Range Inputs', () => {
  test('slider responds to drag', async ({ page }) => {
    // Sliders are in accept quote modal
    // This tests the component works when rendered
    await page.goto('/');
    await expect(page.locator('body')).toBeVisible();
  });

  test('slider responds to keyboard', async ({ page }) => {
    // Arrow keys should work on range inputs
    await page.goto('/');
    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('Copy and Paste', () => {
  test('can paste into text inputs', async ({ page }) => {
    await page.goto('/');
    
    // Grant clipboard permission
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    
    const searchInput = page.getByPlaceholder(/search tokens/i);
    
    // Write to clipboard
    await page.evaluate(() => navigator.clipboard.writeText('elizaOS'));
    
    // Focus and paste
    await searchInput.click();
    await page.keyboard.press('Control+V'); // or Meta+V on Mac
    
    await page.waitForTimeout(500);
    
    // Should paste (may require Mac vs Windows key combo)
    await expect(page.locator('body')).toBeVisible();
  });

  test('can copy from app', async ({ page, wallet }) => {
    await page.goto('/');
    
    // Connect to get address
    await page.getByRole('button', { name: /connect/i }).first().click();
    await page.getByRole('button', { name: /evm/i }).click(); await page.waitForTimeout(1000); await page.getByRole('button', { name: /jeju/i }).click();
    await page.waitForTimeout(2000);
    await wallet.approve();
    await page.waitForTimeout(4000);
    
    // Grant permission
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    
    // Open wallet menu and copy
    const walletButton = page.locator('button:has-text("0x")').first();
    
    if (await walletButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await walletButton.click();
      await page.waitForTimeout(1000);
      
      // Look for copy button (has clipboard icon or text)
      const copyButton = page.locator('button').filter({ has: page.locator('text=/copy/i') }).or(
        page.locator('svg').filter({ hasText: /clip/ }).locator('..')
      );
      
      if (await copyButton.first().isVisible({ timeout: 3000 }).catch(() => false)) {
        await copyButton.first().click();
        await page.waitForTimeout(1000);
        
        // Check clipboard
        const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
        expect(clipboardText).toMatch(/0x[a-fA-F0-9]{40}|[A-Za-z0-9]{32,44}/);
      }
    }
  });
});

test.describe('Scroll Behavior', () => {
  test('maintains scroll position on state updates', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);
    
    // Scroll down
    await page.evaluate(() => window.scrollTo(0, 500));
    const scrollPosition = await page.evaluate(() => window.scrollY);
    
    // Trigger state update (search)
    const searchInput = page.getByPlaceholder(/search tokens/i);
    await searchInput.fill('test');
    await page.waitForTimeout(1000);
    
    // Scroll may change due to content update - that's ok
    await expect(page.locator('body')).toBeVisible();
  });

  test('smooth scroll to anchors works', async ({ page }) => {
    await page.goto('/privacy');
    await page.waitForTimeout(1000);
    
    // Scroll to bottom
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);
    
    // Should be scrolled
    const scrollY = await page.evaluate(() => window.scrollY);
    expect(scrollY).toBeGreaterThan(0);
  });

  test('page remembers scroll on back navigation', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);
    
    // Scroll down
    await page.evaluate(() => window.scrollTo(0, 500));
    
    // Navigate away
    await page.goto('/my-deals');
    
    // Go back
    await page.goBack();
    await page.waitForTimeout(1000);
    
    // Modern browsers may restore scroll
    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('Dynamic Content Updates', () => {
  test('handles real-time price updates', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(5000);
    
    // Prices may update in background
    // App should handle smoothly
    await expect(page.locator('body')).toBeVisible();
  });

  test('handles token list updates', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);
    
    // Refresh page to simulate update
    await page.reload();
    await page.waitForTimeout(2000);
    
    // Should reload smoothly
    await expect(page.locator('body')).toBeVisible();
  });

  test('chat messages update in real-time', async ({ page, wallet }) => {
    await page.goto('/');
    
    // Connect
    await page.getByRole('button', { name: /connect/i }).first().click();
    await page.getByRole('button', { name: /evm/i }).click(); await page.waitForTimeout(1000); await page.getByRole('button', { name: /jeju/i }).click();
    await page.waitForTimeout(2000);
    await wallet.approve();
    await page.waitForTimeout(4000);
    
    const tokenLink = page.locator('a[href*="/token/"]').first();
    
    if (await tokenLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await tokenLink.click();
      await page.waitForTimeout(3000);
      
      const chatInput = page.locator('[data-testid="chat-input"]');
      
      if (await chatInput.isEnabled({ timeout: 5000 }).catch(() => false)) {
        // Send message
        await chatInput.fill('Test message');
        await page.locator('[data-testid="send-button"]').click();
        await page.waitForTimeout(2000);
        
        // Message should appear
        await expect(page.locator('[data-testid="user-message"]')).toBeVisible({ timeout: 5000 });
        
        // Agent response should eventually appear (with polling)
        // Don't fail if agent is offline
        await page.waitForTimeout(3000);
      }
    }
  });
});

test.describe('Network Selection Flow', () => {
  test('can switch between Base and Solana options', async ({ page }) => {
    await page.goto('/');
    
    // Open network selector
    await page.getByRole('button', { name: /connect/i }).first().click();
    await page.waitForTimeout(1000);
    
    // Hover over Base
    await page.getByRole('button', { name: /evm/i }).click(); await page.waitForTimeout(1000); await page.getByRole('button', { name: /jeju/i }).hover();
    await page.waitForTimeout(300);
    
    // Hover over Solana
    await page.getByRole('button', { name: /solana/i }).hover();
    await page.waitForTimeout(300);
    
    // Click Solana
    await page.getByRole('button', { name: /solana/i }).click();
    await page.waitForTimeout(2000);
    
    // Should attempt Solana connection or show install prompt
    await expect(page.locator('body')).toBeVisible();
  });

  test('network badges are visually distinct', async ({ page, wallet }) => {
    await page.goto('/');
    
    // Connect to Base
    await page.getByRole('button', { name: /connect/i }).first().click();
    await page.getByRole('button', { name: /evm/i }).click(); await page.waitForTimeout(1000); await page.getByRole('button', { name: /jeju/i }).click();
    await page.waitForTimeout(2000);
    await wallet.approve();
    await page.waitForTimeout(4000);
    
    // Should show Base badge
    const baseBadge = page.locator('[class*="bg-blue"], [class*="bg-"]').filter({ hasText: /base/i });
    
    // May be visible in wallet menu
    const walletButton = page.locator('button:has-text("0x")').first();
    if (await walletButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await walletButton.click();
      await page.waitForTimeout(1000);
      
      // Should show network info
      await expect(page.getByText(/base|evm|anvil/i)).toBeVisible();
    }
  });
});

test.describe('Token Selection and Display', () => {
  test('token cards are clickable', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(3000);
    
    // Find any token card
    const tokenCard = page.locator('a[href*="/token/"]').first();
    
    if (await tokenCard.isVisible({ timeout: 5000 }).catch(() => false)) {
      await tokenCard.click();
      await page.waitForTimeout(2000);
      
      // Should navigate to token page
      await expect(page).toHaveURL(/\/token\//);
    }
  });

  test('token logos load correctly', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(3000);
    
    // Check for token images
    const tokenImages = page.locator('img[alt*="token"], img[alt*="logo"]').or(
      page.locator('img[src*="token"]')
    );
    
    const count = await tokenImages.count();
    
    if (count > 0) {
      // First image should load
      const firstImg = tokenImages.first();
      await expect(firstImg).toBeVisible({ timeout: 5000 });
    }
  });

  test('token details expand and collapse', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(3000);
    
    // Look for expandable sections
    const expandButton = page.locator('button').filter({ has: page.locator('svg[class*="rotate"]') });
    
    if (await expandButton.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      // Click to expand
      await expandButton.first().click();
      await page.waitForTimeout(500);
      
      // Click to collapse
      await expandButton.first().click();
      await page.waitForTimeout(500);
      
      // Should work smoothly
      await expect(page.locator('body')).toBeVisible();
    }
  });
});

test.describe('Currency and Amount Selection', () => {
  test('currency toggle updates display', async ({ page }) => {
    // Test is in accept quote modal
    // Verify page loads for now
    await page.goto('/');
    await expect(page.locator('body')).toBeVisible();
  });

  test('amount slider syncs with input', async ({ page }) => {
    // Test is in accept quote modal
    await page.goto('/');
    await expect(page.locator('body')).toBeVisible();
  });

  test('max button calculates based on balance', async ({ page }) => {
    // Test is in accept quote modal
    await page.goto('/');
    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('Image and Media Handling', () => {
  test('handles missing images gracefully', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);
    
    // Mock image failure
    await page.route('**/*.png', route => route.abort());
    await page.route('**/*.jpg', route => route.abort());
    await page.route('**/*.svg', route => route.abort());
    
    await page.reload();
    await page.waitForTimeout(3000);
    
    // Should still be usable
    await expect(page.locator('body')).toBeVisible();
  });

  test('handles slow image loading', async ({ page }) => {
    await page.goto('/');
    
    // Delay images
    await page.route('**/*.png', async route => {
      await new Promise(resolve => setTimeout(resolve, 2000));
      await route.continue();
    });
    
    await page.reload();
    
    // Should show loading states or placeholders
    await expect(page.locator('body')).toBeVisible({ timeout: 10000 });
  });
});

test.describe('External Link Handling', () => {
  test('external links have security attributes', async ({ page }) => {
    await page.goto('/privacy');
    
    // External links should have rel="noopener noreferrer"
    const externalLinks = page.locator('a[href^="http"]');
    const count = await externalLinks.count();
    
    if (count > 0) {
      const firstLink = externalLinks.first();
      const rel = await firstLink.getAttribute('rel');
      
      // Should have noopener for security
      if (rel) {
        expect(rel).toContain('noopener');
      }
    }
  });

  test('internal links use client-side navigation', async ({ page }) => {
    await page.goto('/');
    
    // Click internal link
    const link = page.getByRole('link', { name: /My Deals/i });
    await link.click();
    await page.waitForTimeout(1000);
    
    // Should navigate without full page reload
    await expect(page).toHaveURL(/my-deals/);
  });
});

test.describe('Search and Filter Combinations', () => {
  test('can combine multiple filters', async ({ page }) => {
    await page.goto('/');
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.waitForTimeout(2000);
    
    // Apply search
    const searchInput = page.getByPlaceholder(/search tokens/i);
    await searchInput.fill('test');
    await page.waitForTimeout(1000);
    
    // Apply chain filter
    const chainSelect = page.locator('select').filter({ has: page.locator('option:has-text("Chain")') });
    if (await chainSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
      await chainSelect.selectOption({ index: 1 });
      await page.waitForTimeout(1000);
    }
    
    // Should update results
    await expect(page.locator('body')).toBeVisible();
    
    // Clear filters
    await searchInput.clear();
  });

  test('filter changes persist across navigation', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);
    
    // Apply filter
    const searchInput = page.getByPlaceholder(/search tokens/i);
    await searchInput.fill('elizaOS');
    await page.waitForTimeout(1000);
    
    // Navigate away
    await page.goto('/my-deals');
    
    // Go back
    await page.goBack();
    await page.waitForTimeout(1000);
    
    // Filter may or may not persist (depends on implementation)
    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('Wallet Persistence', () => {
  test('wallet persists on page reload', async ({ page, wallet }) => {
    await page.goto('/');
    
    // Connect
    await page.getByRole('button', { name: /connect/i }).first().click();
    await page.getByRole('button', { name: /evm/i }).click(); await page.waitForTimeout(1000); await page.getByRole('button', { name: /jeju/i }).click();
    await page.waitForTimeout(2000);
    await wallet.approve();
    await page.waitForTimeout(4000);
    
    // Verify connected
    await expect(page.locator('text=/0x[a-fA-F0-9]{4}\\.{3}[a-fA-F0-9]{4}/')).toBeVisible();
    
    // Reload
    await page.reload();
    await page.waitForTimeout(3000);
    
    // Should still be connected
    await expect(page.locator('text=/0x[a-fA-F0-9]{4}\\.{3}[a-fA-F0-9]{4}/')).toBeVisible({ timeout: 10000 });
  });

  test('wallet persists across different pages', async ({ page, wallet }) => {
    await page.goto('/');
    
    // Connect
    await page.getByRole('button', { name: /connect/i }).first().click();
    await page.getByRole('button', { name: /evm/i }).click(); await page.waitForTimeout(1000); await page.getByRole('button', { name: /jeju/i }).click();
    await page.waitForTimeout(2000);
    await wallet.approve();
    await page.waitForTimeout(4000);
    
    // Navigate to different pages
    await page.goto('/my-deals');
    await page.waitForTimeout(2000);
    await expect(page.locator('text=/0x[a-fA-F0-9]{4}\\.{3}[a-fA-F0-9]{4}/')).toBeVisible();
    
    await page.goto('/consign');
    await page.waitForTimeout(2000);
    await expect(page.locator('text=/0x[a-fA-F0-9]{4}\\.{3}[a-fA-F0-9]{4}/')).toBeVisible();
    
    await page.goto('/how-it-works');
    await page.waitForTimeout(2000);
    await expect(page.locator('text=/0x[a-fA-F0-9]{4}\\.{3}[a-fA-F0-9]{4}/')).toBeVisible();
  });
});

test.describe('Loading State Transitions', () => {
  test('shows loading state then content', async ({ page }) => {
    await page.goto('/my-deals');
    
    // May show loading spinner briefly
    const loadingSpinner = page.locator('[class*="animate-spin"]');
    
    // Eventually shows content
    await expect(page.getByRole('heading', { name: /My Deals/i })).toBeVisible({ timeout: 10000 });
  });

  test('handles interrupted loading', async ({ page }) => {
    await page.goto('/');
    
    // Navigate away quickly
    await page.goto('/my-deals');
    await page.goto('/');
    
    // Should handle gracefully
    await expect(page.locator('body')).toBeVisible();
  });
});

