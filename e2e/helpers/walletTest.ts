import { BrowserContext, test as baseTest } from "@playwright/test";
import dappwright, { Dappwright, MetaMaskWallet } from "@tenkeylabs/dappwright";

// Use Jeju Localnet for testing (default network)
const JEJU_RPC = process.env.NEXT_PUBLIC_JEJU_RPC_URL || 'http://127.0.0.1:9545';
const JEJU_CHAIN_ID = 1337;

let sharedContext: BrowserContext | undefined;
let sharedWallet: Dappwright | undefined;

export const test = baseTest.extend<{
  context: BrowserContext;
  wallet: Dappwright;
}>({
  // Provide a browser context that has the wallet extension loaded
  context: async ({}, use) => {
    if (!sharedContext) {
      const [wallet, _page, context] = await dappwright.bootstrap("", {
        wallet: "metamask",
        version: MetaMaskWallet.recommendedVersion,
        seed: "test test test test test test test test test test test junk",
        headless: false,
        // Speed up extension boot
        args: ["--disable-features=IsolateOrigins,site-per-process"],
      } as any);

      // Add Jeju Localnet network (primary test network)
      await wallet.addNetwork({
        networkName: "Jeju Localnet",
        rpc: JEJU_RPC,
        chainId: JEJU_CHAIN_ID,
        symbol: "ETH",
      });

      // Ensure wallet is unlocked and on the right network
      await wallet.signin();
      await wallet.switchNetwork("Jeju Localnet");

      sharedContext = context;
      sharedWallet = wallet;
    }

    await use(sharedContext);
  },

  wallet: async ({}, use) => {
    if (!sharedWallet) throw new Error("Wallet not initialized");
    await use(sharedWallet);
  },
});

export const expect = baseTest.expect;


