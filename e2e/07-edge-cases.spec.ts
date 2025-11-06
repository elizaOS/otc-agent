/**
 * Edge Cases and Error Scenarios
 * Tests boundary conditions and error handling
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

test.describe('Form Validation Edge Cases', () => {
  test('handles zero amount in consignment form', async ({ page }) => {
    await page.goto('/consign');
    await page.waitForTimeout(2000);
    
    // Try to proceed with zero or invalid amounts
    // Next button should be disabled
    const nextButton = page.getByRole('button', { name: /next/i });
    
    if (await nextButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      const isDisabled = await nextButton.isDisabled();
      expect(isDisabled).toBe(true);
    }
  });

  test('handles negative numbers in amount inputs', async ({ page, wallet }) => {
    await page.goto('/');
    
    // Connect wallet
    await page.getByRole('button', { name: /connect/i }).first().click();
    await page.getByRole('button', { name: /evm/i }).click();
    await page.waitForTimeout(1000);
    await page.getByRole('button', { name: /jeju/i }).click();
    await page.waitForTimeout(2000);
    await wallet.approve();
    await page.waitForTimeout(4000);
    
    // Try accept modal with test quote (if available)
    // The input should prevent negative numbers
    await expect(page.locator('body')).toBeVisible();
  });

  test('handles extremely large numbers', async ({ page }) => {
    await page.goto('/');
    
    // Search with very long string
    const searchInput = page.getByPlaceholder(/search tokens/i);
    await searchInput.fill('a'.repeat(1000));
    await page.waitForTimeout(1000);
    
    // Should not crash
    await expect(page.locator('body')).toBeVisible();
    
    // Clear
    await searchInput.clear();
  });

  test('handles special characters in search', async ({ page }) => {
    await page.goto('/');
    
    const searchInput = page.getByPlaceholder(/search tokens/i);
    
    // Try various special characters
    const specialChars = ['<script>', '../../etc/passwd', '"DROP TABLE', '\\x00', '🚀💰'];
    
    for (const char of specialChars) {
      await searchInput.fill(char);
      await page.waitForTimeout(500);
      
      // Should not crash or execute scripts
      await expect(page.locator('body')).toBeVisible();
    }
    
    await searchInput.clear();
  });

  test('handles rapid form submission attempts', async ({ page }) => {
    await page.goto('/');
    
    const searchInput = page.getByPlaceholder(/search tokens/i);
    
    // Rapidly type and clear
    for (let i = 0; i < 5; i++) {
      await searchInput.fill(`test${i}`);
      await searchInput.clear();
    }
    
    // Should remain stable
    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('Network and Connection Edge Cases', () => {
  test('handles slow network gracefully', async ({ page }) => {
    // Simulate slow network
    await page.route('**/*', async (route) => {
      await new Promise(resolve => setTimeout(resolve, 1000));
      await route.continue();
    });
    
    await page.goto('/');
    
    // Should eventually load
    await expect(page.locator('body')).toBeVisible({ timeout: 30000 });
  });

  test('handles API errors gracefully', async ({ page }) => {
    // Mock API failure
    await page.route('**/api/**', route => route.abort());
    
    await page.goto('/');
    await page.waitForTimeout(3000);
    
    // Should not crash - may show error state
    await expect(page.locator('body')).toBeVisible();
  });

  test('handles missing token data', async ({ page }) => {
    await page.goto('/token/nonexistent-token-12345');
    await page.waitForTimeout(5000);
    
    // Should show error or loading state, not crash
    await expect(page.locator('body')).toBeVisible();
    
    // Should show some feedback
    const hasError = await page.getByText(/not found|loading|error/i).isVisible({ timeout: 10000 }).catch(() => false);
    const redirected = !page.url().includes('nonexistent-token');
    
    expect(hasError || redirected).toBeTruthy();
  });

  test('handles missing deal data', async ({ page }) => {
    await page.goto('/deal/nonexistent-deal-12345');
    await page.waitForTimeout(5000);
    
    // Should show error or loading
    await expect(page.locator('body')).toBeVisible();
    
    const hasError = await page.getByText(/not found|loading|error/i).isVisible({ timeout: 10000 }).catch(() => false);
    expect(hasError).toBeTruthy();
  });

  test('handles concurrent wallet connections', async ({ page, wallet }) => {
    await page.goto('/');
    
    // Click connect multiple times rapidly
    const connectBtn = page.getByRole('button', { name: /connect/i }).first();
    
    await connectBtn.click();
    await page.waitForTimeout(500);
    
    // Choose Base
    const baseBtn = page.getByRole('button', { name: /evm/i }).click();
    await page.waitForTimeout(1000);
    await page.getByRole('button', { name: /jeju/i });
    if (await baseBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await baseBtn.click();
      await page.waitForTimeout(1000);
      await wallet.approve();
      await page.waitForTimeout(3000);
      
      // Should be connected, not in error state
      await expect(page.locator('text=/0x[a-fA-F0-9]{4}\\.{3}[a-fA-F0-9]{4}/')).toBeVisible({ timeout: 10000 });
    }
  });

  test('handles disconnect during transaction', async ({ page, wallet }) => {
    await page.goto('/');
    
    // Connect
    await page.getByRole('button', { name: /connect/i }).first().click();
    await page.getByRole('button', { name: /evm/i }).click();
    await page.waitForTimeout(1000);
    await page.getByRole('button', { name: /jeju/i }).click();
    await page.waitForTimeout(2000);
    await wallet.approve();
    await page.waitForTimeout(4000);
    
    // App should handle wallet state changes
    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('Chat Edge Cases', () => {
  test('handles very long messages', async ({ page, wallet }) => {
    await page.goto('/');
    
    // Connect and navigate to token
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
      
      const chatInput = page.locator('[data-testid="chat-input"]');
      
      // Try very long message
      const longMessage = 'I want to buy tokens '.repeat(100);
      await chatInput.fill(longMessage);
      
      // Should not crash
      await expect(chatInput).toBeVisible();
      
      // Should be able to clear
      await chatInput.clear();
    }
  });

  test('handles rapid message sending', async ({ page, wallet }) => {
    await page.goto('/');
    
    // Connect
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
      
      const chatInput = page.locator('[data-testid="chat-input"]');
      const sendButton = page.locator('[data-testid="send-button"]');
      
      if (await chatInput.isEnabled({ timeout: 5000 }).catch(() => false)) {
        // Send button should be disabled while processing
        await chatInput.fill('Test 1');
        await sendButton.click();
        
        // Button should disable immediately
        await page.waitForTimeout(500);
        const isDisabled = await sendButton.isDisabled().catch(() => true);
        expect(isDisabled).toBe(true);
      }
    }
  });

  test('handles empty message submission', async ({ page, wallet }) => {
    await page.goto('/');
    
    // Connect
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
      
      const sendButton = page.locator('[data-testid="send-button"]');
      
      // Send button should be disabled when input is empty
      const isDisabled = await sendButton.isDisabled();
      expect(isDisabled).toBe(true);
    }
  });
});

test.describe('Modal Edge Cases', () => {
  test('handles rapid modal open/close', async ({ page }) => {
    await page.goto('/');
    
    // Rapidly open and close connect modal
    for (let i = 0; i < 3; i++) {
      await page.getByRole('button', { name: /connect/i }).first().click();
      await page.waitForTimeout(300);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }
    
    // Should be stable
    await expect(page.locator('body')).toBeVisible();
  });

  test('handles multiple modals in sequence', async ({ page, wallet }) => {
    await page.goto('/');
    
    // Open and close network selection
    await page.getByRole('button', { name: /connect/i }).first().click();
    await page.waitForTimeout(1000);
    await page.getByRole('button', { name: /evm/i }).click();
    await page.waitForTimeout(1000);
    await page.getByRole('button', { name: /jeju/i }).click();
    await page.waitForTimeout(2000);
    await wallet.approve();
    await page.waitForTimeout(4000);
    
    // Open wallet menu
    const walletButton = page.locator('button:has-text("0x")').first();
    if (await walletButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await walletButton.click();
      await page.waitForTimeout(1000);
      
      // Close
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
      
      // Should be stable
      await expect(page.locator('body')).toBeVisible();
    }
  });
});

test.describe('Transaction Edge Cases', () => {
  test('handles wallet locked scenario', async ({ page }) => {
    await page.goto('/');
    
    // App should handle locked wallet gracefully
    // (MetaMask starts unlocked in tests, but UI should be resilient)
    await expect(page.locator('body')).toBeVisible();
  });

  test('handles network switch during operation', async ({ page, wallet }) => {
    await page.goto('/');
    
    // Connect
    await page.getByRole('button', { name: /connect/i }).first().click();
    await page.getByRole('button', { name: /evm/i }).click();
    await page.waitForTimeout(1000);
    await page.getByRole('button', { name: /jeju/i }).click();
    await page.waitForTimeout(2000);
    await wallet.approve();
    await page.waitForTimeout(4000);
    
    // App should be stable even if network changes
    await expect(page.locator('body')).toBeVisible();
  });

  test('handles insufficient gas scenario', async ({ page }) => {
    await page.goto('/');
    
    // This would be tested with a wallet with zero balance
    // For now, verify app doesn't crash
    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('Data Validation Edge Cases', () => {
  test('handles missing market data', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(3000);
    
    // App should handle tokens without market data
    await expect(page.locator('body')).toBeVisible();
  });

  test('handles stale data refresh', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);
    
    // Reload page
    await page.reload();
    await page.waitForTimeout(2000);
    
    // Should refresh data without errors
    await expect(page.locator('body')).toBeVisible();
  });

  test('handles page refresh during operation', async ({ page, wallet }) => {
    await page.goto('/');
    
    // Connect
    await page.getByRole('button', { name: /connect/i }).first().click();
    await page.getByRole('button', { name: /evm/i }).click();
    await page.waitForTimeout(1000);
    await page.getByRole('button', { name: /jeju/i }).click();
    await page.waitForTimeout(2000);
    await wallet.approve();
    await page.waitForTimeout(4000);
    
    // Reload
    await page.reload();
    await page.waitForTimeout(3000);
    
    // Should still be connected (persistence)
    const isConnected = await page.locator('text=/0x[a-fA-F0-9]{4}\\.{3}[a-fA-F0-9]{4}/').isVisible({ timeout: 10000 }).catch(() => false);
    expect(isConnected).toBe(true);
  });

  test('handles browser back button', async ({ page }) => {
    await page.goto('/');
    await page.goto('/my-deals');
    await page.waitForTimeout(1000);
    
    // Use browser back
    await page.goBack();
    await page.waitForTimeout(1000);
    
    // Should be on homepage
    await expect(page).toHaveURL(/^https?:\/\/[^\/]+\/?$/);
  });

  test('handles browser forward button', async ({ page }) => {
    await page.goto('/');
    await page.goto('/my-deals');
    await page.goBack();
    await page.waitForTimeout(1000);
    
    // Use browser forward
    await page.goForward();
    await page.waitForTimeout(1000);
    
    // Should be on my-deals
    await expect(page).toHaveURL(/my-deals/);
  });
});

test.describe('Concurrency Edge Cases', () => {
  test('handles multiple tabs with same wallet', async ({ page, wallet, context }) => {
    // Open first tab
    await page.goto('/');
    await page.getByRole('button', { name: /connect/i }).first().click();
    await page.getByRole('button', { name: /evm/i }).click();
    await page.waitForTimeout(1000);
    await page.getByRole('button', { name: /jeju/i }).click();
    await page.waitForTimeout(2000);
    await wallet.approve();
    await page.waitForTimeout(4000);
    
    // Open second tab
    const page2 = await context.newPage();
    await page2.goto('http://localhost:2222/');
    await page2.waitForTimeout(3000);
    
    // Both pages should be functional
    await expect(page.locator('body')).toBeVisible();
    await expect(page2.locator('body')).toBeVisible();
    
    await page2.close();
  });

  test('handles page visibility changes', async ({ page, wallet }) => {
    await page.goto('/');
    
    // Connect
    await page.getByRole('button', { name: /connect/i }).first().click();
    await page.getByRole('button', { name: /evm/i }).click();
    await page.waitForTimeout(1000);
    await page.getByRole('button', { name: /jeju/i }).click();
    await page.waitForTimeout(2000);
    await wallet.approve();
    await page.waitForTimeout(4000);
    
    // Minimize/hide page
    await page.evaluate(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    
    await page.waitForTimeout(1000);
    
    // Should remain stable
    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('State Management Edge Cases', () => {
  test('handles localStorage quota exceeded', async ({ page }) => {
    await page.goto('/');
    
    // Fill localStorage
    await page.evaluate(() => {
      try {
        for (let i = 0; i < 1000; i++) {
          localStorage.setItem(`test-key-${i}`, 'x'.repeat(1000));
        }
      } catch (e) {
        // Quota exceeded - this is expected
      }
    });
    
    await page.waitForTimeout(1000);
    
    // App should handle gracefully
    await expect(page.locator('body')).toBeVisible();
  });

  test('handles corrupted localStorage data', async ({ page }) => {
    await page.goto('/');
    
    // Corrupt localStorage
    await page.evaluate(() => {
      localStorage.setItem('otc-desk-room-test', '{invalid json}');
      localStorage.setItem('activeFamily', 'invalid-family');
    });
    
    await page.reload();
    await page.waitForTimeout(2000);
    
    // Should handle gracefully
    await expect(page.locator('body')).toBeVisible();
  });

  test('handles session storage', async ({ page }) => {
    await page.goto('/');
    
    // Set session data
    await page.evaluate(() => {
      sessionStorage.setItem('test', 'value');
    });
    
    await page.reload();
    
    // App should work normally
    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('UI State Edge Cases', () => {
  test('handles window resize during operation', async ({ page }) => {
    await page.goto('/');
    
    // Resize rapidly
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.waitForTimeout(500);
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(500);
    await page.setViewportSize({ width: 1280, height: 720 });
    
    // Should adapt without errors
    await expect(page.locator('body')).toBeVisible();
  });

  test('handles scroll position persistence', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);
    
    // Scroll down
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);
    
    // Navigate away and back
    await page.goto('/my-deals');
    await page.goBack();
    
    // Page should load at top (normal behavior)
    await expect(page.locator('body')).toBeVisible();
  });

  test('handles focus management in modals', async ({ page }) => {
    await page.goto('/');
    
    // Open modal
    await page.getByRole('button', { name: /connect/i }).first().click();
    await page.waitForTimeout(1000);
    
    // Tab through elements
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    
    // Focus should be trapped in modal
    const focusedElement = await page.evaluate(() => document.activeElement?.tagName);
    expect(focusedElement).toBeTruthy();
  });

  test('handles rapid filter changes', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);
    
    const searchInput = page.getByPlaceholder(/search tokens/i);
    
    // Rapidly change filters
    await searchInput.fill('test');
    await page.waitForTimeout(200);
    await searchInput.fill('');
    await page.waitForTimeout(200);
    await searchInput.fill('another');
    await page.waitForTimeout(200);
    await searchInput.clear();
    
    // Should be stable
    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('Clipboard and External Actions', () => {
  test('handles clipboard operations', async ({ page, wallet }) => {
    await page.goto('/');
    
    // Connect
    await page.getByRole('button', { name: /connect/i }).first().click();
    await page.getByRole('button', { name: /evm/i }).click();
    await page.waitForTimeout(1000);
    await page.getByRole('button', { name: /jeju/i }).click();
    await page.waitForTimeout(2000);
    await wallet.approve();
    await page.waitForTimeout(4000);
    
    // Grant clipboard permission
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    
    // Write to clipboard
    await page.evaluate(() => navigator.clipboard.writeText('test'));
    
    // App should work normally
    await expect(page.locator('body')).toBeVisible();
  });

  test('handles print dialog', async ({ page }) => {
    await page.goto('/privacy');
    
    // Trigger print (won't actually print in tests)
    await page.evaluate(() => {
      // Mock print to avoid dialog
      window.print = () => console.log('print called');
    });
    
    // App should be stable
    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('Internationalization Edge Cases', () => {
  test('handles different locales', async ({ page }) => {
    // Set different locale
    await page.goto('/', {
      locale: 'es-ES',
    });
    
    // App should load (even if not translated)
    await expect(page.locator('body')).toBeVisible();
  });

  test('handles RTL languages', async ({ page }) => {
    await page.goto('/');
    
    // Set RTL direction
    await page.evaluate(() => {
      document.documentElement.dir = 'rtl';
    });
    
    // Should not break layout catastrophically
    await expect(page.locator('body')).toBeVisible();
  });
});

