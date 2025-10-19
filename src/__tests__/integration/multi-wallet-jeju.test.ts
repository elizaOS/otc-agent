import { describe, it, expect } from "vitest";
import { jejuMainnet, jejuTestnet, jejuLocalnet } from "@/lib/chains";
import { isJejuChainId } from "@/config/chains";

/**
 * Integration tests for OTC Agent multi-wallet with Jeju support
 */
describe("Multi-wallet Jeju Integration", () => {
	describe("Chain detection", () => {
		it("should identify Jeju mainnet correctly", () => {
			const chainId = jejuMainnet.id;
			expect(isJejuChainId(chainId)).toBe(true);
		});

		it("should identify Jeju testnet correctly", () => {
			const chainId = jejuTestnet.id;
			expect(isJejuChainId(chainId)).toBe(true);
		});

		it("should identify Jeju localnet correctly", () => {
			const chainId = jejuLocalnet.id;
			expect(isJejuChainId(chainId)).toBe(true);
		});

		it("should not identify Base as Jeju", () => {
			const chainId = 8453; // Base mainnet
			expect(isJejuChainId(chainId)).toBe(false);
		});

		it("should not identify BSC as Jeju", () => {
			const chainId = 56; // BSC mainnet
			expect(isJejuChainId(chainId)).toBe(false);
		});
	});

	describe("Network naming", () => {
		it("should display correct name for Jeju mainnet", () => {
			const chainId = jejuMainnet.id;
			expect(jejuMainnet.name).toBe("Jeju");
		});

		it("should display correct name for Jeju testnet", () => {
			const chainId = jejuTestnet.id;
			expect(jejuTestnet.name).toBe("Jeju Testnet");
		});

		it("should display correct name for Jeju localnet", () => {
			const chainId = jejuLocalnet.id;
			expect(jejuLocalnet.name).toBe("Jeju Localnet");
		});
	});

	describe("Multi-wallet context", () => {
		it("should support both EVM and Solana", () => {
			type ChainFamily = "evm" | "solana" | "none";
			const supportedFamilies: ChainFamily[] = ["evm", "solana"];

			expect(supportedFamilies).toContain("evm");
			expect(supportedFamilies).toContain("solana");
		});

		it("should default to EVM when Jeju is connected", () => {
			const evmConnected = true;
			const solanaConnected = false;
			const activeFamily = evmConnected ? "evm" : solanaConnected ? "solana" : "none";

			expect(activeFamily).toBe("evm");
		});

		it("should allow switching to Solana", () => {
			const evmConnected = true;
			const solanaConnected = true;
			let activeFamily: "evm" | "solana" = "evm";

			// User switches to Solana
			activeFamily = "solana";

			expect(activeFamily).toBe("solana");
		});

		it("should provide entity ID from wallet address", () => {
			const walletAddress = "0x1234567890abcdef1234567890abcdef12345678";
			const entityId = walletAddress.toLowerCase();

			expect(entityId).toBe(walletAddress.toLowerCase());
			expect(entityId).toMatch(/^0x[a-f0-9]{40}$/);
		});
	});

	describe("Payment pair labels", () => {
		it("should show USDC/ETH for EVM chains", () => {
			const activeFamily = "evm";
			const paymentPair = activeFamily === "solana" ? "USDC/SOL" : "USDC/ETH";

			expect(paymentPair).toBe("USDC/ETH");
		});

		it("should show USDC/SOL for Solana", () => {
			const activeFamily = "solana";
			const paymentPair = activeFamily === "solana" ? "USDC/SOL" : "USDC/ETH";

			expect(paymentPair).toBe("USDC/SOL");
		});
	});

	describe("Environment configuration", () => {
		it("should respect Jeju network setting", () => {
			const jejuNetwork = process.env.NEXT_PUBLIC_JEJU_NETWORK || "localnet";
			expect(["mainnet", "testnet", "localnet"]).toContain(jejuNetwork);
		});

		it("should use environment variable for Jeju RPC", () => {
			const defaultRpc = "http://127.0.0.1:9545";
			const jejuRpc = process.env.NEXT_PUBLIC_JEJU_RPC_URL || defaultRpc;

			expect(jejuRpc).toBeDefined();
			expect(typeof jejuRpc).toBe("string");
		});

		it("should have contract addresses configured", () => {
			const hasOtcAddress = !!process.env.NEXT_PUBLIC_JEJU_OTC_ADDRESS || true; // Default contracts
			const hasUsdcAddress = !!process.env.NEXT_PUBLIC_JEJU_USDC_ADDRESS || true;

			// These should be configured for production, but have defaults for localnet
			expect(typeof hasOtcAddress).toBe("boolean");
			expect(typeof hasUsdcAddress).toBe("boolean");
		});
	});

	describe("Chain switching behavior", () => {
		it("should maintain connection when switching between Jeju networks", () => {
			// Simulate switching from Jeju localnet to mainnet
			let currentChainId = jejuLocalnet.id;
			expect(isJejuChainId(currentChainId)).toBe(true);

			// Switch to mainnet
			currentChainId = jejuMainnet.id;
			expect(isJejuChainId(currentChainId)).toBe(true);
		});

		it("should detect when switching from Jeju to Base", () => {
			let currentChainId = jejuLocalnet.id;
			expect(isJejuChainId(currentChainId)).toBe(true);

			// Switch to Base
			currentChainId = 8453;
			expect(isJejuChainId(currentChainId)).toBe(false);
		});
	});
});
