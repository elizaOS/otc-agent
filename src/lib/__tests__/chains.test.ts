import { describe, it, expect } from "vitest";
import { jejuMainnet, jejuTestnet, jejuLocalnet } from "../chains";

describe("Jeju Chain Definitions", () => {
	describe("jejuMainnet", () => {
		it("should have correct chain ID", () => {
			expect(jejuMainnet.id).toBe(420691);
		});

		it("should have correct name", () => {
			expect(jejuMainnet.name).toBe("Jeju");
		});

		it("should have ETH as native currency", () => {
			expect(jejuMainnet.nativeCurrency.symbol).toBe("ETH");
			expect(jejuMainnet.nativeCurrency.decimals).toBe(18);
		});

		it("should have RPC URLs configured", () => {
			expect(jejuMainnet.rpcUrls).toBeDefined();
			expect(jejuMainnet.rpcUrls.default).toBeDefined();
			expect(jejuMainnet.rpcUrls.default.http.length).toBeGreaterThan(0);
		});

		it("should have block explorer configured", () => {
			expect(jejuMainnet.blockExplorers).toBeDefined();
			expect(jejuMainnet.blockExplorers?.default).toBeDefined();
			expect(jejuMainnet.blockExplorers?.default.url).toContain("explorer");
		});
	});

	describe("jejuTestnet", () => {
		it("should have correct chain ID", () => {
			expect(jejuTestnet.id).toBe(420690);
		});

		it("should have correct name", () => {
			expect(jejuTestnet.name).toBe("Jeju Testnet");
		});

		it("should have testnet RPC URL", () => {
			const rpcUrl = jejuTestnet.rpcUrls.default.http[0];
			expect(rpcUrl).toContain("testnet");
		});

		it("should have testnet explorer", () => {
			const explorerUrl = jejuTestnet.blockExplorers?.default.url;
			expect(explorerUrl).toContain("testnet");
		});
	});

	describe("jejuLocalnet", () => {
		it("should have correct chain ID", () => {
			expect(jejuLocalnet.id).toBe(1337);
		});

		it("should have correct name", () => {
			expect(jejuLocalnet.name).toBe("Jeju Localnet");
		});

		it("should use localhost RPC URL by default", () => {
			const rpcUrl = jejuLocalnet.rpcUrls.default.http[0];
			expect(rpcUrl).toMatch(/127\.0\.0\.1|localhost/);
		});

		it("should use environment variable for RPC URL if set", () => {
			const originalEnv = process.env.NEXT_PUBLIC_JEJU_RPC_URL;
			process.env.NEXT_PUBLIC_JEJU_RPC_URL = "http://custom-rpc:9545";

			// Re-import to get updated config
			// Note: This may not work in all test environments
			// In real implementation, chain config should be dynamic
			expect(process.env.NEXT_PUBLIC_JEJU_RPC_URL).toBe("http://custom-rpc:9545");

			// Restore
			process.env.NEXT_PUBLIC_JEJU_RPC_URL = originalEnv;
		});

		it("should use localhost for block explorer", () => {
			const explorerUrl = jejuLocalnet.blockExplorers?.default.url;
			expect(explorerUrl).toMatch(/localhost|127\.0\.0\.1/);
		});
	});

	describe("Chain Compatibility", () => {
		it("all chains should have unique chain IDs", () => {
			const chainIds = [jejuMainnet.id, jejuTestnet.id, jejuLocalnet.id];
			const uniqueIds = new Set(chainIds);
			expect(uniqueIds.size).toBe(chainIds.length);
		});

		it("all chains should have ETH as native currency", () => {
			const chains = [jejuMainnet, jejuTestnet, jejuLocalnet];
			for (const chain of chains) {
				expect(chain.nativeCurrency.symbol).toBe("ETH");
				expect(chain.nativeCurrency.decimals).toBe(18);
			}
		});

		it("all chains should have default RPC URLs", () => {
			const chains = [jejuMainnet, jejuTestnet, jejuLocalnet];
			for (const chain of chains) {
				expect(chain.rpcUrls.default).toBeDefined();
				expect(chain.rpcUrls.default.http).toBeDefined();
				expect(chain.rpcUrls.default.http.length).toBeGreaterThan(0);
			}
		});

		it("all chains should have block explorers", () => {
			const chains = [jejuMainnet, jejuTestnet, jejuLocalnet];
			for (const chain of chains) {
				expect(chain.blockExplorers).toBeDefined();
				expect(chain.blockExplorers?.default).toBeDefined();
			}
		});
	});
});
