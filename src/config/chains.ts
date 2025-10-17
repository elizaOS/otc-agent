export type Chain = "ethereum" | "base" | "solana";

export interface ChainConfig {
  id: string;
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
  type: "evm" | "solana";
}

export const SUPPORTED_CHAINS: Record<Chain, ChainConfig> = {
  ethereum: {
    id: "11155111", // Sepolia
    name: "Ethereum Sepolia",
    rpcUrl:
      process.env.NEXT_PUBLIC_ETHEREUM_RPC_URL || "https://rpc.sepolia.org",
    explorerUrl: "https://sepolia.etherscan.io",
    nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
    contracts: {
      otc: process.env.NEXT_PUBLIC_ETHEREUM_OTC_ADDRESS,
      usdc: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", // Sepolia USDC
    },
    type: "evm",
  },
  base: {
    id: "84532", // Base Sepolia
    name: "Base Sepolia",
    rpcUrl: process.env.NEXT_PUBLIC_BASE_RPC_URL || "https://sepolia.base.org",
    explorerUrl: "https://sepolia.basescan.org",
    nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
    contracts: {
      otc: process.env.NEXT_PUBLIC_BASE_OTC_ADDRESS,
      usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // Base Sepolia USDC
    },
    type: "evm",
  },
  solana: {
    id: "solana-devnet",
    name: "Solana Devnet",
    rpcUrl:
      process.env.NEXT_PUBLIC_SOLANA_RPC || "https://api.devnet.solana.com",
    explorerUrl: "https://explorer.solana.com",
    nativeCurrency: { name: "SOL", symbol: "SOL", decimals: 9 },
    contracts: {
      otc: process.env.NEXT_PUBLIC_SOLANA_DESK,
      usdc: "Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr", // Devnet USDC
    },
    type: "solana",
  },
};

export function getChainConfig(chain: Chain): ChainConfig {
  return SUPPORTED_CHAINS[chain];
}

export function isEVMChain(chain: Chain): boolean {
  return SUPPORTED_CHAINS[chain].type === "evm";
}

export function isSolanaChain(chain: Chain): boolean {
  return SUPPORTED_CHAINS[chain].type === "solana";
}

export function getChainFromId(chainId: string): Chain | null {
  for (const [key, config] of Object.entries(SUPPORTED_CHAINS)) {
    if (config.id === chainId) return key as Chain;
  }
  return null;
}
