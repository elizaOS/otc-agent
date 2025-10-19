import { test as baseExpect, expect } from "@playwright/test";
baseExpect.setTimeout(600000);
import { test } from "./helpers/walletTest";

test.describe("Wallet connect and actions", () => {
  test("connect to EVM via Privy and verify header state", async ({ page, wallet }) => {
    // Open app
    await page.goto("/");

    // Click "Connect Wallet" button in header (NetworkConnectButton)
    const connectBtn = page.getByRole("button", { name: /connect wallet|connect/i }).first();
    await connectBtn.click();

    // Choose EVM in modal
    const evmChoice = page.getByRole("button", { name: /evm/i });
    await evmChoice.click();
    await page.waitForTimeout(1000);

    // Choose Jeju chain
    const jejuChoice = page.getByRole("button", { name: /jeju/i });
    await jejuChoice.click();

    // Approve connection in MetaMask
    await wallet.approve();

    // Header should now show Manage button or connected state
    await expect(page.getByRole("button", { name: /manage|connect evm/i })).toBeVisible();
  });
});


