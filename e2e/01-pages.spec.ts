/**
 * Page Load and Navigation Tests
 * Tests all pages can load and basic navigation works
 */

import { test, expect } from '@playwright/test';

test.describe('Page Load Tests', () => {
  test('homepage loads correctly', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveTitle(/OTC/i);
    
    // Should show marketplace header
    await expect(page.getByRole('heading', { name: /OTC Marketplace/i })).toBeVisible({ timeout: 10000 });
    
    // Should show filters (use first() to handle mobile/desktop duplicates)
    await expect(page.getByPlaceholder(/search tokens/i).first()).toBeVisible({ timeout: 10000 });
    
    // Should show connect button
    await expect(page.getByRole('button', { name: /connect/i }).first()).toBeVisible({ timeout: 10000 });
  });

  test('/how-it-works loads correctly', async ({ page }) => {
    await page.goto('/how-it-works');
    await page.waitForLoadState('networkidle');
    
    // Should show heading or image
    const hasContent = await page.locator('h1, img[alt*="how"]').first().isVisible({ timeout: 10000 }).catch(() => false);
    expect(hasContent).toBe(true);
    
    // Should show network selection cards (EVM and Solana buttons)
    await expect(page.getByRole('button', { name: /evm/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: /solana/i })).toBeVisible({ timeout: 10000 });
  });

  test('/consign loads correctly', async ({ page }) => {
    await page.goto('/consign');
    await page.waitForLoadState('networkidle');
    
    // Should show form heading
    await expect(page.getByRole('heading', { name: /List Your Tokens/i })).toBeVisible({ timeout: 10000 });
    
    // Should show progress steps (use exact match to avoid multiple matches)
    const progressSteps = page.locator('span').filter({ hasText: /^Token$|^Amount$|^Review$/ });
    const count = await progressSteps.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test('/my-deals loads correctly', async ({ page }) => {
    await page.goto('/my-deals');
    await page.waitForLoadState('networkidle');
    
    // Should show heading
    await expect(page.getByRole('heading', { name: /My Deals/i })).toBeVisible({ timeout: 10000 });
    
    // Should show tabs
    await expect(page.getByRole('button', { name: /My Purchases/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: /My Listings/i })).toBeVisible({ timeout: 10000 });
    
    // Should show connect prompt if not connected
    await expect(page.getByText(/Connect your wallet/i)).toBeVisible({ timeout: 10000 });
  });

  test('/privacy loads correctly', async ({ page }) => {
    await page.goto('/privacy');
    await page.waitForLoadState('networkidle');
    
    // Should show privacy policy heading
    await expect(page.getByRole('heading', { name: /Privacy Policy/i })).toBeVisible({ timeout: 10000 });
    
    // Should have content
    await expect(page.getByText(/Information We Collect/i)).toBeVisible({ timeout: 10000 });
  });

  test('/terms loads correctly', async ({ page }) => {
    await page.goto('/terms');
    await page.waitForLoadState('networkidle');
    
    // Should show terms heading
    await expect(page.getByRole('heading', { name: /Terms of Service/i })).toBeVisible({ timeout: 10000 });
    
    // Should have content
    await expect(page.getByText(/Effective Date/i)).toBeVisible({ timeout: 10000 });
  });

  test('navigation between pages works', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Navigate to How It Works
    await page.getByRole('link', { name: /How It Works/i }).click();
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/how-it-works/);
    
    // Navigate to My Deals
    await page.getByRole('link', { name: /My Deals/i }).click();
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/my-deals/);
    
    // Navigate back to Trading Desk (home)
    await page.getByRole('link', { name: /Trading Desk/i }).click();
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/^https?:\/\/[^\/]+\/?$/);
  });

  test('responsive design - mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 }); // iPhone SE
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Page should be usable with connect button visible
    await expect(page.getByRole('button', { name: /connect/i }).first()).toBeVisible({ timeout: 10000 });
    
    // Content should be visible
    await expect(page.locator('body')).toBeVisible();
  });

  test('responsive design - tablet viewport', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 }); // iPad
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Content should be visible and properly laid out
    await expect(page.getByRole('heading', { name: /OTC Marketplace/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByPlaceholder(/search tokens/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('404 page handling', async ({ page }) => {
    const response = await page.goto('/this-page-does-not-exist-12345');
    
    // Next.js should handle 404s gracefully
    // Either show 404 page or redirect
    expect(response?.status()).toBeLessThan(500);
  });
});

test.describe('Footer Links', () => {
  test('footer contains legal links', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Wait for page to fully render
    await page.waitForTimeout(2000);
    
    // Scroll to footer
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1000);
    
    // Should have Terms and Privacy links
    await expect(page.getByRole('link', { name: /terms/i })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('link', { name: /privacy/i })).toBeVisible({ timeout: 5000 });
  });

  test('terms link works from footer', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1000);
    
    // Click terms link
    const termsLink = page.getByRole('link', { name: /terms/i });
    await termsLink.click();
    await page.waitForLoadState('networkidle');
    
    // Should navigate to terms page
    await expect(page).toHaveURL(/terms/);
  });

  test('privacy link works from footer', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1000);
    
    // Click privacy link
    const privacyLink = page.getByRole('link', { name: /privacy/i });
    await privacyLink.click();
    await page.waitForLoadState('networkidle');
    
    // Should navigate to privacy page
    await expect(page).toHaveURL(/privacy/);
  });
});

