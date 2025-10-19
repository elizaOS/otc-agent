import { createConfig, http } from "wagmi";
import type { Config } from "wagmi";
import { localhost, base, baseSepolia, bsc, bscTestnet } from "wagmi/chains";
import { injected, walletConnect } from "wagmi/connectors";
import { jejuMainnet, jejuTestnet, jejuLocalnet } from "@/lib/chains";

// Custom RPC URLs
const baseRpcUrl = process.env.NEXT_PUBLIC_BASE_RPC_URL;
const bscRpcUrl = process.env.NEXT_PUBLIC_BSC_RPC_URL;
const jejuRpcUrl = process.env.NEXT_PUBLIC_JEJU_RPC_URL || "http://127.0.0.1:9545";
const anvilRpcUrl = process.env.NEXT_PUBLIC_RPC_URL || "http://127.0.0.1:8545";

// Determine available chains based on configuration
function getAvailableChains() {
  const isDevelopment = process.env.NODE_ENV === "development";
  const chains = [];

  // Add localnet chains first in dev mode (default)
  if (isDevelopment) {
    chains.push(jejuLocalnet, localhost);
  }

  // Add Jeju chains (always available)
  chains.push(jejuMainnet, jejuTestnet);

  // Add Base if RPC configured or in production
  if (baseRpcUrl || !isDevelopment) {
    chains.push(base, baseSepolia);
  } else if (isDevelopment) {
    console.warn("⚠️  BASE_RPC_URL not set - Base chains hidden from UI");
  }

  // Add BSC if RPC configured or in production
  if (bscRpcUrl || !isDevelopment) {
    chains.push(bsc, bscTestnet);
  } else if (isDevelopment) {
    console.warn("⚠️  BSC_RPC_URL not set - BSC chains hidden from UI");
  }

  return chains;
}

const chains = getAvailableChains();

// Build transports dynamically based on available chains
function getTransports() {
  const transports: Record<number, ReturnType<typeof http>> = {
    [jejuMainnet.id]: http(jejuRpcUrl),
    [jejuTestnet.id]: http("https://testnet-rpc.jeju.network"),
    [jejuLocalnet.id]: http(jejuRpcUrl),
  };

  const isDevelopment = process.env.NODE_ENV === "development";
  
  if (isDevelopment) {
    transports[localhost.id] = http(anvilRpcUrl);
  }

  // Add Base transports if configured
  if (baseRpcUrl) {
    transports[base.id] = http(baseRpcUrl);
    transports[baseSepolia.id] = http(baseRpcUrl);
  } else if (!isDevelopment) {
    // In production without custom RPC, use public RPCs
    transports[base.id] = http("https://mainnet.base.org");
    transports[baseSepolia.id] = http("https://sepolia.base.org");
  }

  // Add BSC transports if configured
  if (bscRpcUrl) {
    transports[bsc.id] = http(bscRpcUrl);
    transports[bscTestnet.id] = http(bscRpcUrl);
  } else if (!isDevelopment) {
    // In production without custom RPC, use public RPCs
    transports[bsc.id] = http("https://bsc-dataseed1.binance.org");
    transports[bscTestnet.id] = http("https://data-seed-prebsc-1-s1.binance.org:8545");
  }

  return transports;
}

// Create connectors only on client side to avoid indexedDB SSR errors
function getConnectors() {
  if (typeof window === "undefined") return [];
  return [
    injected({ shimDisconnect: true }),
    walletConnect({
      projectId: process.env.NEXT_PUBLIC_PROJECT_ID || "demo-project-id",
    }),
  ];
}

// Wagmi configuration for Privy integration
// Privy handles wallet connection, wagmi handles contract interactions
export const config: Config = createConfig({
  chains: chains as any,
  connectors: getConnectors(),
  transports: getTransports() as any,
  ssr: true,
});

// Export chains for UI reference
export { chains };
