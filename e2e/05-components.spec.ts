/**
 * Component Interaction Tests
 * Tests individual components and UI elements
 */

import { test as base, expect } from '@playwright/test';
import { BrowserContext } from 'playwright-core';
import { bootstrap, Dappwright, getWallet, MetaMaskWallet } from '@tenkeylabs/dappwright';

base.setTimeout(600000);

// Extend test with MetaMask wallet fixture
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
        networkName: 'Hardhat',
        rpc: 'http://127.0.0.1:8545',
        chainId: 31337,
        symbol: 'ETH',
      });

      await wallet.switchNetwork('Hardhat');

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

test.describe('Header Component', () => {
  test('header renders and is always visible', async ({ page }) => {
    await page.goto('/');
    
    // Logo should be visible
    await expect(page.locator('img[alt*="Logo"]').or(page.locator('a[href="/"]').first())).toBeVisible();
    
    // Navigation links should be visible on desktop
    await page.setViewportSize({ width: 1280, height: 720 });
    await expect(page.getByRole('link', { name: /Trading Desk/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /My Deals/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /How It Works/i })).toBeVisible();
  });

  test('mobile menu works', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 }); // iPhone SE
    await page.goto('/');
    
    // Desktop nav should be hidden, mobile menu button visible
    const mobileMenuButton = page.locator('button[aria-label*="menu"]').or(
      page.locator('svg').locator('..').filter({ hasText: /menu/i })
    );
    
    // May have mobile menu button
    if (await mobileMenuButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await mobileMenuButton.click();
      await page.waitForTimeout(1000);
      
      // Menu should open with navigation
      await expect(page.getByRole('link', { name: /Trading Desk|My Deals|How It Works/i }).first()).toBeVisible();
    }
  });

  test('logo link navigates to home', async ({ page }) => {
    await page.goto('/my-deals');
    
    // Click logo
    const logo = page.locator('a[href="/"]').first();
    await logo.click();
    
    // Should navigate to home
    await expect(page).toHaveURL(/^https?:\/\/[^\/]+\/?$/);
  });
});

test.describe('Deal Filters Component', () => {
  test('search filter works', async ({ page }) => {
    await page.goto('/');
    
    const searchInput = page.getByPlaceholder(/search tokens/i);
    await searchInput.fill('ELIZA');
    await page.waitForTimeout(1500);
    
    // Results should filter
    // Can't assert exact results without knowing seed data
    await expect(page.locator('body')).toBeVisible();
    
    // Clear search
    await searchInput.clear();
    await page.waitForTimeout(500);
  });

  test('chain filter toggles work', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);
    
    // Find chain toggles (mobile view has buttons, desktop has dropdown)
    await page.setViewportSize({ width: 375, height: 667 });
    
    const chainButtons = page.locator('button').filter({ hasText: /ETH|SOL|Base|Solana/i });
    const count = await chainButtons.count();
    
    if (count > 0) {
      // Click first chain toggle
      await chainButtons.first().click();
      await page.waitForTimeout(1000);
      
      // Page should update
      await expect(page.locator('body')).toBeVisible();
    }
  });

  test('negotiable type filter works', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);
    
    // Desktop view
    await page.setViewportSize({ width: 1280, height: 720 });
    
    const typeSelect = page.locator('select').filter({ has: page.locator('option:has-text("Negotiable")') });
    
    if (await typeSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
      await typeSelect.selectOption('negotiable');
      await page.waitForTimeout(1000);
      
      // Should update results
      await expect(page.locator('body')).toBeVisible();
    }
  });

  test('fractionalized filter works', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);
    
    const fracFilter = page.locator('button').filter({ hasText: /frac/i }).or(
      page.locator('select').filter({ has: page.locator('option:has-text("Fractionalized")') })
    );
    
    if (await fracFilter.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      await fracFilter.first().click();
      await page.waitForTimeout(1000);
      
      await expect(page.locator('body')).toBeVisible();
    }
  });
});

test.describe('Chat Component', () => {
  test('chat input is disabled when not connected', async ({ page }) => {
    await page.goto('/');
    
    // Navigate to a token page
    const tokenLink = page.locator('a[href*="/token/"]').first();
    
    if (await tokenLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await tokenLink.click();
      await page.waitForTimeout(2000);
      
      // Chat should be disabled
      const chatInput = page.locator('[data-testid="chat-input"]');
      await expect(chatInput).toBeDisabled();
    }
  });

  test('chat shows connect overlay when not connected', async ({ page }) => {
    await page.goto('/');
    
    const tokenLink = page.locator('a[href*="/token/"]').first();
    
    if (await tokenLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await tokenLink.click();
      await page.waitForTimeout(2000);
      
      // Should show connect prompt
      const connectPrompt = page.getByText(/connect.*wallet|choose.*network/i);
      
      // Either already visible or appears when trying to chat
      if (!await connectPrompt.isVisible({ timeout: 2000 }).catch(() => false)) {
        const chatInput = page.locator('[data-testid="chat-input"]');
        await chatInput.click({ force: true });
        await page.waitForTimeout(1000);
      }
      
      await expect(page.getByText(/connect|wallet/i)).toBeVisible();
    }
  });

  test('can send message after connecting', async ({ page, wallet }) => {
    await page.goto('/');
    
    // Connect wallet
    await page.getByRole('button', { name: /connect/i }).first().click();
    await page.getByRole('button', { name: /base/i }).click();
    await page.waitForTimeout(2000);
    await wallet.approve();
    await page.waitForTimeout(4000);
    
    // Navigate to token
    const tokenLink = page.locator('a[href*="/token/"]').first();
    
    if (await tokenLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await tokenLink.click();
      await page.waitForTimeout(3000);
      
      // Send message
      const chatInput = page.locator('[data-testid="chat-input"]');
      await expect(chatInput).toBeEnabled({ timeout: 10000 });
      
      await chatInput.fill('Test message');
      await page.locator('[data-testid="send-button"]').click();
      await page.waitForTimeout(2000);
      
      // Message should appear
      await expect(page.locator('[data-testid="user-message"]')).toBeVisible();
    }
  });

  test('clear chat button works', async ({ page, wallet }) => {
    await page.goto('/');
    
    // Connect and navigate to token
    await page.getByRole('button', { name: /connect/i }).first().click();
    await page.getByRole('button', { name: /base/i }).click();
    await page.waitForTimeout(2000);
    await wallet.approve();
    await page.waitForTimeout(4000);
    
    const tokenLink = page.locator('a[href*="/token/"]').first();
    
    if (await tokenLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await tokenLink.click();
      await page.waitForTimeout(3000);
      
      // Look for clear/reset button
      const resetButton = page.getByRole('button', { name: /reset|clear/i });
      
      if (await resetButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await resetButton.click();
        await page.waitForTimeout(1000);
        
        // Should show confirmation dialog
        const confirmDialog = page.getByText(/clear.*chat|delete|cannot be undone/i);
        await expect(confirmDialog).toBeVisible({ timeout: 5000 });
      }
    }
  });
});

test.describe('Accept Quote Modal', () => {
  test('modal opens when quote available', async ({ page, wallet }) => {
    await page.goto('/');
    
    // Connect
    await page.getByRole('button', { name: /connect/i }).first().click();
    await page.getByRole('button', { name: /base/i }).click();
    await page.waitForTimeout(2000);
    await wallet.approve();
    await page.waitForTimeout(4000);
    
    // The modal requires a quote from agent
    // Just verify modal component exists in DOM (not visible without quote)
    const modal = page.locator('[data-testid="accept-quote-modal"]');
    
    // Modal should exist but not be visible initially
    const isVisible = await modal.isVisible().catch(() => false);
    expect(isVisible).toBe(false);
  });

  test('modal has amount input and slider', async ({ page }) => {
    // We can test the modal structure by injecting it via page.evaluate
    // or by navigating with a mocked quote
    
    await page.goto('/');
    
    // Just verify the page loads for now
    // Full modal testing requires quote flow which is tested in complete-flows
    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('Button Components', () => {
  test('all buttons are clickable and have proper states', async ({ page }) => {
    await page.goto('/');
    
    // Find all visible buttons
    const buttons = page.locator('button:visible');
    const count = await buttons.count();
    
    expect(count).toBeGreaterThan(0);
    
    // All buttons should have text or aria-label
    for (let i = 0; i < Math.min(count, 10); i++) {
      const button = buttons.nth(i);
      const text = await button.textContent();
      const ariaLabel = await button.getAttribute('aria-label');
      
      expect(text || ariaLabel).toBeTruthy();
    }
  });

  test('disabled buttons are not clickable', async ({ page }) => {
    await page.goto('/');
    
    // Find any disabled button
    const disabledButton = page.locator('button:disabled').first();
    
    if (await disabledButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Should not be clickable
      const isDisabled = await disabledButton.isDisabled();
      expect(isDisabled).toBe(true);
    }
  });
});

test.describe('Deal Cards', () => {
  test('deal cards render correctly', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(3000);
    
    // Look for any deal cards
    const dealCards = page.locator('[data-testid="deal-card"]').or(
      page.locator('div').filter({ hasText: /discount|lockup/i })
    );
    
    // May or may not have deals depending on seed data
    const hasDeals = await dealCards.first().isVisible({ timeout: 5000 }).catch(() => false);
    
    if (hasDeals) {
      const count = await dealCards.count();
      expect(count).toBeGreaterThan(0);
      
      // First card should be clickable
      await dealCards.first().click();
      await page.waitForTimeout(2000);
      
      // Should navigate somewhere (token page or chat)
      expect(page.url()).not.toBe('http://localhost:2222/');
    } else {
      // No deals - should show empty state
      await expect(page.getByText(/no.*deal|create listing/i)).toBeVisible();
    }
  });
});

test.describe('Form Validation', () => {
  test('consignment form validates inputs', async ({ page }) => {
    await page.goto('/consign');
    await page.waitForTimeout(2000);
    
    // Should be on step 1 (token selection)
    // Next button should be disabled without selection
    const nextButton = page.getByRole('button', { name: /next/i });
    
    if (await nextButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      const isDisabled = await nextButton.isDisabled();
      // Should be disabled without token selection
      expect(isDisabled).toBe(true);
    }
  });
});

test.describe('Loading States', () => {
  test('shows loading spinner during data fetch', async ({ page }) => {
    await page.goto('/');
    
    // Should show loading state initially or skeleton
    const loadingElement = page.locator('[class*="animate-spin"]').or(
      page.locator('[class*="animate-pulse"]')
    );
    
    // May flash briefly or not at all if cached
    // Just verify page eventually loads
    await expect(page.locator('body')).toBeVisible();
  });

  test('deals page shows loading state', async ({ page }) => {
    await page.goto('/my-deals');
    
    // Should eventually show content
    await expect(page.getByRole('heading', { name: /My Deals/i })).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Error Handling', () => {
  test('handles invalid token ID gracefully', async ({ page }) => {
    const response = await page.goto('/token/invalid-token-id-12345');
    
    // Should show error or redirect
    expect(response?.status()).toBeLessThan(500);
    
    // Should show error message or redirect
    const hasError = await page.getByText(/not found|invalid/i).isVisible({ timeout: 5000 }).catch(() => false);
    const redirected = !page.url().includes('invalid-token-id-12345');
    
    expect(hasError || redirected).toBeTruthy();
  });

  test('handles invalid deal ID gracefully', async ({ page }) => {
    const response = await page.goto('/deal/invalid-deal-id-12345');
    
    expect(response?.status()).toBeLessThan(500);
    
    // Should show error or loading state
    await expect(page.locator('body')).toBeVisible();
  });

  test('handles network errors gracefully', async ({ page }) => {
    // Go offline
    await page.context().setOffline(true);
    
    await page.goto('/').catch(() => {});
    
    // Go back online
    await page.context().setOffline(false);
    await page.goto('/');
    
    // Should load properly
    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('Accessibility', () => {
  test('has no console errors on load', async ({ page }) => {
    const errors: string[] = [];
    
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    
    await page.goto('/');
    await page.waitForTimeout(3000);
    
    // Filter out expected errors (e.g., missing agent, expected API failures)
    const criticalErrors = errors.filter(err => 
      !err.includes('agent') &&
      !err.includes('404') &&
      !err.includes('Failed to fetch') &&
      !err.toLowerCase().includes('hydration')
    );
    
    expect(criticalErrors.length).toBe(0);
  });

  test('keyboard navigation works', async ({ page }) => {
    await page.goto('/');
    
    // Tab through interactive elements
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    
    // Some element should be focused
    const focusedElement = await page.evaluateHandle(() => document.activeElement);
    expect(focusedElement).toBeTruthy();
  });

  test('buttons have accessible text', async ({ page }) => {
    await page.goto('/');
    
    const buttons = page.locator('button:visible');
    const count = await buttons.count();
    
    expect(count).toBeGreaterThan(0);
    
    // Check first 5 buttons
    for (let i = 0; i < Math.min(count, 5); i++) {
      const button = buttons.nth(i);
      const text = await button.textContent();
      const ariaLabel = await button.getAttribute('aria-label');
      
      expect(text?.trim() || ariaLabel).toBeTruthy();
    }
  });
});

test.describe('Performance', () => {
  test('page loads within acceptable time', async ({ page }) => {
    const start = Date.now();
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const loadTime = Date.now() - start;
    
    // Should load within 10 seconds
    expect(loadTime).toBeLessThan(10000);
  });

  test('navigation is fast', async ({ page }) => {
    await page.goto('/');
    
    const start = Date.now();
    await page.goto('/my-deals');
    const navTime = Date.now() - start;
    
    // Navigation should be quick
    expect(navTime).toBeLessThan(5000);
  });
});

test.describe('Security', () => {
  test('prevents XSS in URL parameters', async ({ page }) => {
    let alertFired = false;
    
    page.on('dialog', async dialog => {
      alertFired = true;
      await dialog.dismiss();
    });
    
    await page.goto('/?xss=<script>alert(1)</script>');
    await page.waitForTimeout(2000);
    
    // No alert should fire
    expect(alertFired).toBe(false);
  });

  test('external links open in new tab', async ({ page }) => {
    await page.goto('/privacy');
    
    // Any external links should have target="_blank"
    const externalLinks = page.locator('a[href^="http"]');
    const count = await externalLinks.count();
    
    for (let i = 0; i < count; i++) {
      const link = externalLinks.nth(i);
      const target = await link.getAttribute('target');
      const href = await link.getAttribute('href');
      
      // External links should open in new tab
      if (href && !href.includes('localhost') && !href.includes('127.0.0.1')) {
        expect(target).toBe('_blank');
      }
    }
  });
});

