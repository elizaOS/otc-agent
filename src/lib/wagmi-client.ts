import { createConfig, http, injected } from "wagmi";
import type { Config } from "wagmi";
import { hardhat, mainnet } from "wagmi/chains";
import { createClient } from "viem";
import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import {
  metaMaskWallet,
  walletConnectWallet,
  coinbaseWallet,
  braveWallet,
  rabbyWallet,
  trustWallet,
} from "@rainbow-me/rainbowkit/wallets";

import { APP_INFO } from "@/config/app";

// Custom RPC URL if provided, otherwise use default
const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || "http://127.0.0.1:8545";

// Configure chains based on environment
const isDevelopment = process.env.NODE_ENV === "development";
const chains = isDevelopment ? [hardhat, mainnet] : [mainnet];

// Only for local development
export const hardHatConfig = createConfig({
  chains: [hardhat],
  connectors: [injected()],
  client({ chain }) {
    return createClient({ chain, transport: http(rpcUrl) });
  },
  ssr: true,
});

// Both for prod and dev mode
export const config: Config = getDefaultConfig({
  chains: chains as any,
  appName: APP_INFO.NAME,
  projectId: process.env.NEXT_PUBLIC_PROJECT_ID || "demo-project-id",
  ssr: true,
  transports: {
    [hardhat.id]: http(rpcUrl),
    [mainnet.id]: http(),
  },
  // Provide a curated wallet list to avoid duplicates (e.g., MetaMask via injected + EIP-6963)
  wallets: [
    {
      groupName: "Popular",
      wallets: [
        metaMaskWallet,
        walletConnectWallet,
        coinbaseWallet,
        braveWallet,
        rabbyWallet,
        trustWallet,
      ],
    },
  ],
});
