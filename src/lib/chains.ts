import { defineChain } from "viem";

// Jeju Mainnet
export const jejuMainnet = defineChain({
	id: 420691,
	name: "Jeju",
	nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
	rpcUrls: {
		default: { http: ["https://rpc.jeju.network"] },
	},
	blockExplorers: {
		default: { name: "Jeju Explorer", url: "https://explorer.jeju.network" },
	},
});

// Jeju Testnet
export const jejuTestnet = defineChain({
	id: 420690,
	name: "Jeju Testnet",
	nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
	rpcUrls: {
		default: { http: ["https://testnet-rpc.jeju.network"] },
	},
	blockExplorers: {
		default: {
			name: "Jeju Testnet Explorer",
			url: "https://testnet-explorer.jeju.network",
		},
	},
	testnet: true,
});

// Jeju Localnet
export const jejuLocalnet = defineChain({
	id: 1337,
	name: "Jeju Localnet",
	nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
	rpcUrls: {
		default: {
			http: [process.env.NEXT_PUBLIC_JEJU_RPC_URL || "http://127.0.0.1:9545"],
		},
	},
	blockExplorers: {
		default: { name: "Blockscout", url: "http://localhost:4000" },
	},
	testnet: true,
});
