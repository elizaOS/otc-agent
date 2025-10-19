import { base, baseSepolia, bsc, bscTestnet, localhost, type Chain as ViemChain } from "viem/chains";
import { jejuMainnet, jejuTestnet, jejuLocalnet } from "@/lib/chains";

// String-based chain identifier for database/API (lowercase, URL-safe)
export type Chain = "ethereum" | "base" | "bsc" | "solana" | "jeju";
export type ChainFamily = "evm" | "solana";

export interface ChainConfig {
  id: string; // String ID for database storage
  name: string;
  rpcUrl: string;
  explorerUrl: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  contracts: {
    otc?: string;
    usdc?: string;
  };
  type: ChainFamily;
  viemChain?: ViemChain; // Reference to viem chain for wagmi (EVM only)
  chainId?: number; // Numeric chain ID (EVM only)
}

// Helper to get current network
function getCurrentNetwork() {
  const env = process.env.NODE_ENV;
  const network = process.env.NEXT_PUBLIC_JEJU_NETWORK || process.env.NETWORK || "localnet";
  return { env, network };
}

// Helper to get current Jeju chain
function getCurrentJejuChain(): { viem: ViemChain; id: string; name: string; rpc: string; explorer: string } {
  const { env, network } = getCurrentNetwork();
  
  if (env === "production") {
    return {
      viem: jejuMainnet,
      id: jejuMainnet.id.toString(),
      name: "Jeju Network",
      rpc: process.env.NEXT_PUBLIC_JEJU_RPC_URL || "https://rpc.jeju.network",
      explorer: "https://explorer.jeju.network",
    };
  }
  
  if (network === "testnet") {
    return {
      viem: jejuTestnet,
      id: jejuTestnet.id.toString(),
      name: "Jeju Testnet",
      rpc: process.env.NEXT_PUBLIC_JEJU_RPC_URL || "https://testnet-rpc.jeju.network",
      explorer: "https://testnet-explorer.jeju.network",
    };
  }
  
  return {
    viem: jejuLocalnet,
    id: jejuLocalnet.id.toString(),
    name: "Jeju Localnet",
    rpc: process.env.NEXT_PUBLIC_JEJU_RPC_URL || "http://127.0.0.1:9545",
    explorer: "http://localhost:4000",
  };
}

export const SUPPORTED_CHAINS: Record<Chain, ChainConfig> = {
  ethereum: {
    id: localhost.id.toString(),
    name: "Anvil Local",
    rpcUrl: process.env.NEXT_PUBLIC_RPC_URL || "http://127.0.0.1:8545",
    explorerUrl: "http://localhost:8545",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    contracts: {
      otc: process.env.NEXT_PUBLIC_OTC_ADDRESS,
      usdc: process.env.NEXT_PUBLIC_USDC_ADDRESS,
    },
    type: "evm",
    viemChain: localhost,
    chainId: localhost.id,
  },
  base: (() => {
    const isProduction = process.env.NODE_ENV === "production";
    const chain = isProduction ? base : baseSepolia;
    return {
      id: chain.id.toString(),
      name: isProduction ? "Base" : "Base Sepolia",
      rpcUrl: process.env.NEXT_PUBLIC_BASE_RPC_URL || (isProduction ? "https://mainnet.base.org" : "https://sepolia.base.org"),
      explorerUrl: isProduction ? "https://basescan.org" : "https://sepolia.basescan.org",
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      contracts: {
        otc: process.env.NEXT_PUBLIC_BASE_OTC_ADDRESS,
        usdc: isProduction ? "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" : "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      },
      type: "evm" as ChainFamily,
      viemChain: chain,
      chainId: chain.id,
    };
  })(),
  bsc: (() => {
    const isProduction = process.env.NODE_ENV === "production";
    const chain = isProduction ? bsc : bscTestnet;
    return {
      id: chain.id.toString(),
      name: isProduction ? "BSC" : "BSC Testnet",
      rpcUrl: process.env.NEXT_PUBLIC_BSC_RPC_URL || (isProduction ? "https://bsc-dataseed1.binance.org" : "https://data-seed-prebsc-1-s1.binance.org:8545"),
      explorerUrl: isProduction ? "https://bscscan.com" : "https://testnet.bscscan.com",
      nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
      contracts: {
        otc: process.env.NEXT_PUBLIC_BSC_OTC_ADDRESS,
        usdc: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
      },
      type: "evm" as ChainFamily,
      viemChain: chain,
      chainId: chain.id,
    };
  })(),
  solana: (() => {
    const { env, network } = getCurrentNetwork();
    const isProduction = env === "production";
    const isLocalnet = network === "localnet";
    return {
      id: isProduction ? "solana-mainnet" : (isLocalnet ? "solana-localnet" : "solana-devnet"),
      name: isProduction ? "Solana" : (isLocalnet ? "Solana Localnet" : "Solana Devnet"),
      rpcUrl: process.env.NEXT_PUBLIC_SOLANA_RPC || (isProduction ? "https://api.mainnet-beta.solana.com" : (isLocalnet ? "http://127.0.0.1:8899" : "https://api.devnet.solana.com")),
      explorerUrl: "https://explorer.solana.com",
      nativeCurrency: { name: "SOL", symbol: "SOL", decimals: 9 },
      contracts: {
        otc: process.env.NEXT_PUBLIC_SOLANA_DESK,
        usdc: isProduction ? "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" : "Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr",
      },
      type: "solana" as ChainFamily,
    };
  })(),
  jeju: (() => {
    const current = getCurrentJejuChain();
    return {
      id: current.id,
      name: current.name,
      rpcUrl: current.rpc,
      explorerUrl: current.explorer,
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      contracts: {
        otc: process.env.NEXT_PUBLIC_JEJU_OTC_ADDRESS,
        usdc: process.env.NEXT_PUBLIC_JEJU_USDC_ADDRESS,
      },
      type: "evm" as ChainFamily,
      viemChain: current.viem,
      chainId: current.viem.id,
    };
  })(),
};

/**
 * Get chain config by identifier
 */
export function getChainConfig(chain: Chain): ChainConfig {
  return SUPPORTED_CHAINS[chain];
}

/**
 * Check if chain is EVM-based
 */
export function isEVMChain(chain: Chain): boolean {
  return SUPPORTED_CHAINS[chain].type === "evm";
}

/**
 * Check if chain is Solana-based
 */
export function isSolanaChain(chain: Chain): boolean {
  return SUPPORTED_CHAINS[chain].type === "solana";
}

/**
 * Get chain identifier from string chain ID (database format)
 */
export function getChainFromId(chainId: string): Chain | null {
  for (const [key, config] of Object.entries(SUPPORTED_CHAINS)) {
    if (config.id === chainId) return key as Chain;
  }
  return null;
}

/**
 * Get chain identifier from numeric chain ID (wagmi/viem format)
 */
export function getChainFromNumericId(chainId: number): Chain | null {
  for (const [key, config] of Object.entries(SUPPORTED_CHAINS)) {
    if (config.chainId === chainId) return key as Chain;
  }
  return null;
}

/**
 * Check if numeric chain ID is Jeju
 */
export function isJejuChainId(chainId: number): boolean {
  return chainId === jejuMainnet.id || chainId === jejuTestnet.id || chainId === jejuLocalnet.id;
}

/**
 * Get all viem chains for wagmi configuration
 */
export function getAllViemChains(): ViemChain[] {
  return Object.values(SUPPORTED_CHAINS)
    .filter((config) => config.viemChain)
    .map((config) => config.viemChain!);
}
