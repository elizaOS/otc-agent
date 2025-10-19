import { base, baseSepolia, bsc, bscTestnet, localhost, type Chain } from "viem/chains";
import { jejuMainnet, jejuTestnet, jejuLocalnet } from "@/lib/chains";

/**
 * Get the appropriate chain based on environment and configuration
 * Supports: Jeju (mainnet, testnet, localnet), Base, BSC, Anvil/localhost
 */
export function getChain(): Chain {
	const env = process.env.NODE_ENV;
	const network = process.env.NETWORK || process.env.NEXT_PUBLIC_JEJU_NETWORK || "localnet";

	// Production: Use mainnet chains
	if (env === "production") {
		if (network === "base") return base;
		if (network === "bsc") return bsc;
		return jejuMainnet;
	}

	// Development/staging: Support multiple networks
	switch (network) {
		case "jeju-mainnet":
		case "mainnet":
			return jejuMainnet;
		case "jeju-testnet":
		case "testnet":
			return jejuTestnet;
		case "jeju-localnet":
		case "localnet":
			return jejuLocalnet;
		case "base":
			return base;
		case "base-sepolia":
			return baseSepolia;
		case "bsc":
			return bsc;
		case "bsc-testnet":
			return bscTestnet;
		case "localhost":
		case "anvil":
			return localhost;
		default:
			// Default to Jeju localnet in development
			return jejuLocalnet;
	}
}

/**
 * Get RPC URL for the current chain
 */
export function getRpcUrl(): string {
	const network = process.env.NETWORK || process.env.NEXT_PUBLIC_JEJU_NETWORK || "localnet";

	switch (network) {
		case "jeju-mainnet":
		case "mainnet":
			return process.env.NEXT_PUBLIC_JEJU_RPC_URL || "https://rpc.jeju.network";
		case "jeju-testnet":
		case "testnet":
			return process.env.NEXT_PUBLIC_JEJU_RPC_URL || "https://testnet-rpc.jeju.network";
		case "jeju-localnet":
		case "localnet":
			return process.env.NEXT_PUBLIC_JEJU_RPC_URL || "http://127.0.0.1:9545";
		case "base":
			return process.env.NEXT_PUBLIC_BASE_RPC_URL || "https://mainnet.base.org";
		case "base-sepolia":
			return process.env.NEXT_PUBLIC_BASE_RPC_URL || "https://sepolia.base.org";
		case "bsc":
			return process.env.NEXT_PUBLIC_BSC_RPC_URL || "https://bsc-dataseed1.binance.org";
		case "bsc-testnet":
			return process.env.NEXT_PUBLIC_BSC_RPC_URL || "https://data-seed-prebsc-1-s1.binance.org:8545";
		case "localhost":
		case "anvil":
			return process.env.NEXT_PUBLIC_RPC_URL || "http://127.0.0.1:8545";
		default:
			return process.env.NEXT_PUBLIC_JEJU_RPC_URL || "http://127.0.0.1:9545";
	}
}

