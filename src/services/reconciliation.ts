/**
 * State Reconciliation Service
 *
 * Ensures database state matches blockchain contract state.
 * Critical for maintaining data integrity across the system.
 */

import { createPublicClient, http, type Address, type Abi } from "viem";
import { hardhat, base, baseSepolia } from "viem/chains";
import otcArtifact from "@/contracts/artifacts/contracts/OTC.sol/OTC.json";
import { QuoteDB } from "./database";

interface ContractOffer {
  beneficiary: Address;
  tokenAmount: bigint;
  discountBps: number;
  createdAt: bigint;
  unlockTime: bigint;
  priceUsdPerToken: bigint;
  ethUsdPrice: bigint;
  currency: number;
  approved: boolean;
  paid: boolean;
  fulfilled: boolean;
  cancelled: boolean;
  payer: Address;
  amountPaid: bigint;
}

export class ReconciliationService {
  private client: any; // PublicClient type causes "excessively deep" TypeScript error
  private otcAddress: Address | undefined;
  private abi: Abi;

  constructor() {
    // Determine chain
    const env = process.env.NODE_ENV;
    const network = process.env.NETWORK || "hardhat";
    const chain =
      env === "production"
        ? base
        : network === "base-sepolia"
          ? baseSepolia
          : hardhat;

    // Create public client
    const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || "http://127.0.0.1:8545";
    this.client = createPublicClient({
      chain,
      transport: http(rpcUrl),
    });

    this.otcAddress = process.env.NEXT_PUBLIC_OTC_ADDRESS as
      | Address
      | undefined;
    this.abi = otcArtifact.abi as Abi;
  }

  async readContractOffer(offerId: string | number): Promise<ContractOffer> {
    if (!this.otcAddress) throw new Error("OTC address not configured");

    // Type cast needed - viem's readContract return type is too complex for TypeScript to infer
    const [
      beneficiary,
      tokenAmount,
      discountBps,
      createdAt,
      unlockTime,
      priceUsdPerToken,
      ethUsdPrice,
      currency,
      approved,
      paid,
      fulfilled,
      cancelled,
      payer,
      amountPaid,
    ] = (await this.client.readContract({
      address: this.otcAddress,
      abi: this.abi,
      functionName: "offers",
      args: [BigInt(offerId)],
    } as any)) as [
      Address,
      bigint,
      bigint,
      bigint,
      bigint,
      bigint,
      bigint,
      number,
      boolean,
      boolean,
      boolean,
      boolean,
      Address,
      bigint,
    ];

    return {
      beneficiary,
      tokenAmount,
      discountBps: Number(discountBps),
      createdAt,
      unlockTime,
      priceUsdPerToken,
      ethUsdPrice,
      currency: Number(currency),
      approved,
      paid,
      fulfilled,
      cancelled,
      payer,
      amountPaid,
    };
  }

  async reconcileQuote(quoteId: string): Promise<{
    updated: boolean;
    oldStatus: string;
    newStatus: string;
  }> {
    const dbQuote = await QuoteDB.getQuoteByQuoteId(quoteId);
    if (!dbQuote.offerId) {
      return {
        updated: false,
        oldStatus: dbQuote.status,
        newStatus: dbQuote.status,
      };
    }

    const contractOffer = await this.readContractOffer(dbQuote.offerId);

    const contractStatus = contractOffer.fulfilled
      ? "executed"
      : contractOffer.cancelled
        ? "rejected"
        : contractOffer.paid || contractOffer.approved
          ? "approved"
          : "active";

    if (dbQuote.status === contractStatus) {
      return {
        updated: false,
        oldStatus: dbQuote.status,
        newStatus: contractStatus,
      };
    }

    console.log(
      `[Reconciliation] ${quoteId}: ${dbQuote.status} → ${contractStatus}`,
    );
    await QuoteDB.updateQuoteStatus(quoteId, contractStatus, {
      offerId: dbQuote.offerId || "",
      transactionHash: "",
      blockNumber: 0,
      rejectionReason: "",
      approvalNote: "",
    });

    return {
      updated: true,
      oldStatus: dbQuote.status,
      newStatus: contractStatus,
    };
  }

  async reconcileAllActive(): Promise<{
    total: number;
    updated: number;
  }> {
    console.log("[Reconciliation] Starting reconciliation...");
    const activeQuotes = await QuoteDB.getActiveQuotes();
    console.log(`[Reconciliation] Found ${activeQuotes.length} active quotes`);

    const results = await Promise.all(
      activeQuotes.map((quote) => this.reconcileQuote(quote.quoteId)),
    );

    const updated = results.filter((r) => r.updated).length;
    console.log(
      `[Reconciliation] Complete: ${updated}/${results.length} updated`,
    );

    return { total: results.length, updated };
  }

  async verifyQuoteState(quoteId: string): Promise<{ syncNeeded: boolean }> {
    const result = await this.reconcileQuote(quoteId);
    return { syncNeeded: result.updated };
  }

  async healthCheck(): Promise<{
    blockNumber: number;
    contractAddress: string;
  }> {
    if (!this.otcAddress) throw new Error("OTC address not configured");

    const blockNumber = await this.client.getBlockNumber();
    // Type cast needed - viem's readContract parameters are too complex
    await this.client.readContract({
      address: this.otcAddress,
      abi: this.abi,
      functionName: "nextOfferId",
      args: [],
    } as any);
    return {
      blockNumber: Number(blockNumber),
      contractAddress: this.otcAddress,
    };
  }
}

// Singleton instance
export const reconciliationService = new ReconciliationService();

export async function runReconciliationTask(): Promise<void> {
  console.log("\n🔄 [Reconciliation Task] Starting...\n");

  const health = await reconciliationService.healthCheck();
  console.log(
    `[Reconciliation] Block: ${health.blockNumber}, Contract: ${health.contractAddress}\n`,
  );

  const result = await reconciliationService.reconcileAllActive();
  console.log(
    `\n✅ [Reconciliation] Complete: ${result.updated}/${result.total} updated\n`,
  );
}
