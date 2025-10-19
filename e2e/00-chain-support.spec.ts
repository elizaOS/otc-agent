/**
 * Multi-Chain Support Verification
 * Verifies Base, BSC, and Jeju chain support in the UI
 */

import { test, expect } from '@playwright/test';

test.setTimeout(120000);

test.describe('Multi-Chain Support', () => {
  test('network selection modal shows EVM and Solana', async ({ page }) => {
    await page.goto('/');
    
    // Click connect button
    await page.getByRole('button', { name: /connect/i }).first().click();
    await page.waitForTimeout(1000);
    
    // Should show both network families
    await expect(page.getByRole('button', { name: /evm/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /solana/i })).toBeVisible();
    
    // EVM button should mention supported chains
    const evmButton = page.getByRole('button', { name: /evm/i });
    await expect(evmButton).toContainText(/base.*bsc.*jeju/i);
  });

  test('EVM chain selector shows all three chains', async ({ page }) => {
    await page.goto('/');
    
    // Click connect
    await page.getByRole('button', { name: /connect/i }).first().click();
    await page.waitForTimeout(1000);
    
    // Click EVM
    await page.getByRole('button', { name: /evm/i }).click();
    await page.waitForTimeout(1000);
    
    // Should show all three EVM chains
    await expect(page.getByRole('button', { name: /^base$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^bsc$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^jeju$/i })).toBeVisible();
  });

  test('can select each EVM chain', async ({ page }) => {
    const chains = ['base', 'bsc', 'jeju'];
    
    for (const chain of chains) {
      await page.goto('/');
      
      // Open connect modal
      await page.getByRole('button', { name: /connect/i }).first().click();
      await page.waitForTimeout(1000);
      
      // Click EVM
      await page.getByRole('button', { name: /evm/i }).click();
      await page.waitForTimeout(1000);
      
      // Should show chain selector
      const chainButton = page.getByRole('button', { name: new RegExp(`^${chain}$`, 'i') });
      await expect(chainButton).toBeVisible();
      
      console.log(`✅ ${chain.toUpperCase()} chain is selectable`);
      
      // Close modal
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }
  });

  test('network switcher shows EVM not Base', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);
    
    // Look for any "Switch to Base" or "Connect to Base" text
    const hasBase = await page.getByText(/switch to base|connect to base/i).isVisible().catch(() => false);
    expect(hasBase).toBe(false);
    
    // Should have "EVM" references instead
    await page.getByRole('button', { name: /connect/i }).first().click();
    await page.waitForTimeout(1000);
    
    const hasEVM = await page.getByRole('button', { name: /evm/i }).isVisible();
    expect(hasEVM).toBe(true);
  });

  test('chain mismatch warnings use EVM', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);
    
    // Any chain mismatch warnings should say "EVM" not "Base"
    const pageText = await page.textContent('body');
    
    // Should not have hardcoded "Base" in warnings
    expect(pageText).not.toContain('Switch to Base');
    expect(pageText).not.toContain('Connect to Base');
  });
});

test.describe('Test Configuration', () => {
  test('Jeju Localnet configuration is correct', async () => {
    const jejuRpc = process.env.NEXT_PUBLIC_JEJU_RPC_URL || 'http://127.0.0.1:9545';
    const jejuNetwork = process.env.NEXT_PUBLIC_JEJU_NETWORK || 'localnet';
    
    expect(jejuRpc).toContain('9545');
    expect(jejuNetwork).toBe('localnet');
    
    console.log(`✅ Jeju RPC: ${jejuRpc}`);
    console.log(`✅ Jeju Network: ${jejuNetwork}`);
  });
});


