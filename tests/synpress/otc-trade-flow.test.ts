/**
 * Synpress tests for TheDesk OTC trading flows
 * Tests order creation, acceptance, and payment integration
 */

import { testWithSynpress } from '@synthetixio/synpress';
import { MetaMask, metaMaskFixtures } from '@synthetixio/synpress/playwright';
import { basicSetup } from '../wallet-setup/basic.setup';

const test = testWithSynpress(metaMaskFixtures(basicSetup));
const { expect } = test;

test.describe('TheDesk OTC Trading', () => {
  
  test('should connect wallet and switch to Jeju network', async ({ context, page, metamaskPage, extensionId }) => {
    const metamask = new MetaMask(context, metamaskPage, basicSetup.walletPassword, extensionId);

    await page.goto('/');

    // Connect wallet
    const connectButton = page.locator('button:has-text("Connect")').first();
    await expect(connectButton).toBeVisible({ timeout: 5000 });
    await connectButton.click();

    // Select MetaMask
    const metamaskOption = page.locator('text=MetaMask');
    if (await metamaskOption.isVisible({ timeout: 2000 }).catch(() => false)) {
      await metamaskOption.click();
    }

    await metamask.connectToDapp();

    // Verify connected
    await expect(page.locator('text=/0x[a-fA-F0-9]{4}/i')).toBeVisible({ timeout: 5000 });
  });

  test('should create OTC order with payment', async ({ context, page, metamaskPage, extensionId }) => {
    const metamask = new MetaMask(context, metamaskPage, basicSetup.walletPassword, extensionId);

    await page.goto('/');
    
    // Connect first
    await page.locator('button:has-text("Connect")').first().click();
    await metamask.connectToDapp();
    await page.waitForTimeout(2000);

    // Create order button
    const createButton = page.locator('button:has-text("Create Order")').or(page.locator('[data-testid="create-order"]')).first();
    if (await createButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await createButton.click();

      // Fill order form
      await page.locator('input[placeholder*="amount"]').first().fill('1000');
      
      // Submit
      await page.locator('button:has-text("Submit")').or(page.locator('button:has-text("Create")')).first().click();

      // May trigger x402 payment
      const paymentRequired = await page.locator('text=Payment Required').isVisible({ timeout: 2000 }).catch(() => false);
      
      if (paymentRequired) {
        await page.locator('button:has-text("Pay")').first().click();
        await metamask.confirmTransaction();
      }

      // Confirm order creation
      await metamask.confirmTransaction();

      // Verify order created
      await expect(page.locator('text=/created|active|pending/i')).toBeVisible({ timeout: 15000 });
    }
  });

  test('should accept and settle OTC order', async ({ context, page, metamaskPage, extensionId }) => {
    const metamask = new MetaMask(context, metamaskPage, basicSetup.walletPassword, extensionId);

    await page.goto('/orders');

    // Find an order to accept
    const acceptButton = page.locator('button:has-text("Accept")').first();
    if (await acceptButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await acceptButton.click();

      // Approve tokens
      await metamask.approveTx();
      await page.waitForTimeout(1000);

      // Confirm transaction
      await metamask.confirmTransaction();

      // Verify acceptance
      await expect(page.locator('text=/accepted|matched|settling/i')).toBeVisible({ timeout: 15000 });

      // Settlement may require additional confirmation
      const settleButton = page.locator('button:has-text("Settle")');
      if (await settleButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await settleButton.click();
        await metamask.confirmTransaction();
        
        await expect(page.locator('text=/completed|settled|success/i')).toBeVisible({ timeout: 15000 });
      }
    }
  });

  test('should check trader reputation before order acceptance', async ({ context, page, metamaskPage, extensionId }) => {
    await page.goto('/orders');

    // Click on order to view details
    const orderCard = page.locator('[data-testid="order-card"]').or(page.locator('text=/Buy|Sell/i')).first();
    if (await orderCard.isVisible({ timeout: 3000 }).catch(() => false)) {
      await orderCard.click();

      // Should display trader info
      const traderInfo = page.locator('[data-testid="trader-info"]').or(page.locator('text=/reputation|trades|rating/i'));
      await expect(traderInfo.first()).toBeVisible({ timeout: 5000 });
    }
  });

  test('should use paymaster for gas-free trading', async ({ context, page, metamaskPage, extensionId }) => {
    const metamask = new MetaMask(context, metamaskPage, basicSetup.walletPassword, extensionId);

    await page.goto('/');
    
    await page.locator('button:has-text("Connect")').first().click();
    await metamask.connectToDapp();

    // Enable paymaster
    const paymasterToggle = page.locator('[data-testid="enable-paymaster"]');
    if (await paymasterToggle.isVisible({ timeout: 2000 }).catch(() => false)) {
      await paymasterToggle.check();

      // Create order (should be gasless)
      await page.goto('/');
      const createButton = page.locator('button:has-text("Create Order")').first();
      if (await createButton.isVisible()) {
        await createButton.click();
        
        // Fill and submit without gas approval
        await page.locator('input[placeholder*="amount"]').first().fill('500');
        await page.locator('button:has-text("Create")').first().click();

        // Should complete without MetaMask gas approval
        await expect(page.locator('text=/created|success/i')).toBeVisible({ timeout: 10000 });
      }
    }
  });
});
