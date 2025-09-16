import {
  createPublicClient,
  createWalletClient,
  http,
  formatEther,
} from "viem";
import { hardhat, baseSepolia, base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import otcArtifact from "@/contracts/artifacts/contracts/OTC.sol/OTC.json";
import { QuoteService, DealCompletionService } from "@/services/database";

// Worker service that monitors on-chain otc offers, auto-approves matching quotes,
// and handles deal completion notifications via HTTP polling
export class QuoteApprovalWorker {
  private isRunning = false;
  private publicClient: any;
  private walletClient: any;
  private account: any;
  private abi: any;
  private processedOffers = new Set<string>();
  private pendingApprovals = new Map<string, any>();
  private apiBaseUrl: string;

  private OTC_ADDRESS = process.env.NEXT_PUBLIC_OTC_ADDRESS as `0x${string}`;
  private APPROVER_PRIVATE_KEY = process.env
    .APPROVER_PRIVATE_KEY as `0x${string}`;
  private POLL_INTERVAL = 2000; // Check every 2 seconds for faster response

  constructor() {
    if (!this.OTC_ADDRESS || !this.APPROVER_PRIVATE_KEY) {
      throw new Error(
        "Missing required environment variables for approval worker",
      );
    }

    // Set API base URL for HTTP notifications
    this.apiBaseUrl =
      process.env.NEXT_PUBLIC_API_URL ||
      (typeof window !== "undefined"
        ? window.location.origin
        : "http://localhost:3000");

    const chain = this.getChain();

    this.publicClient = createPublicClient({
      chain,
      transport: http(),
    });

    this.account = privateKeyToAccount(this.APPROVER_PRIVATE_KEY);
    this.walletClient = createWalletClient({
      account: this.account,
      chain,
      transport: http(),
    });

    this.abi = otcArtifact.abi as any;
  }

  private getChain() {
    const env = process.env.NODE_ENV;
    const network = process.env.NETWORK || "hardhat";

    if (env === "production") return base;
    if (network === "base-sepolia") return baseSepolia;
    return hardhat;
  }

  async start() {
    if (this.isRunning) return;
    this.isRunning = true;

    console.log("🚀 [QuoteApprovalWorker] Starting approval worker...");
    console.log(`  • OTC Address: ${this.OTC_ADDRESS}`);
    console.log(`  • Approver: ${this.account.address}`);
    console.log(`  • Poll Interval: ${this.POLL_INTERVAL}ms`);

    // Main monitoring loop
    while (this.isRunning) {
      try {
        await this.monitorOffers();
        await this.checkFulfilledOffers();
      } catch (error) {
        console.error("[Worker] Error in monitoring cycle:", error);
      }

      await this.sleep(this.POLL_INTERVAL);
    }
  }

  stop() {
    this.isRunning = false;
    console.log("🛑 [Worker] Stopping approval worker...");
  }

  private async monitorOffers() {
    const openOfferIds = (await this.publicClient.readContract({
      address: this.OTC_ADDRESS,
      abi: this.abi,
      functionName: "getOpenOfferIds",
      args: [],
    })) as bigint[];

    if (openOfferIds.length === 0) return;

    const activeQuotes = await this.getActiveQuotes();

    for (const offerId of openOfferIds) {
      const offerIdStr = offerId.toString();

      if (this.processedOffers.has(offerIdStr)) continue;

      try {
        const offer = (await this.publicClient.readContract({
          address: this.OTC_ADDRESS,
          abi: this.abi,
          functionName: "offers",
          args: [offerId],
        })) as any;

        // Skip if already approved, paid, or cancelled
        if (offer.approved || offer.cancelled) {
          this.processedOffers.add(offerIdStr);
          continue;
        }

        // Check if this offer matches any active quote
        const matchingQuote = this.findMatchingQuote(offer, activeQuotes);

        if (matchingQuote) {
          console.log(
            `✅ [Worker] Found matching quote for offer ${offerIdStr}`,
          );
          await this.approveOffer(offerId, matchingQuote);
        } else {
          console.warn(`⚠️ [Worker] No matching quote for offer ${offerIdStr}`);
          // Could implement suspicious offer handling here
        }
      } catch (error) {
        console.error(`[Worker] Error processing offer ${offerIdStr}:`, error);
      }
    }
  }

  private async checkFulfilledOffers() {
    // Check for recently fulfilled offers to trigger congratulations flow
    for (const [offerId, approvalData] of this.pendingApprovals.entries()) {
      try {
        const offer = (await this.publicClient.readContract({
          address: this.OTC_ADDRESS,
          abi: this.abi,
          functionName: "offers",
          args: [BigInt(offerId)],
        })) as any;

        if (offer.paid && !offer.fulfilled) {
          console.log(`💰 [Worker] Offer ${offerId} has been paid!`);

          // Notify user of successful payment
          this.notifyDealCompletion(offerId, approvalData.quote, offer);

          // Remove from pending
          this.pendingApprovals.delete(offerId);
        }
      } catch (error) {
        console.error(
          `[Worker] Error checking fulfilled offer ${offerId}:`,
          error,
        );
      }
    }
  }

  private async approveOffer(offerId: bigint, quote: any) {
    const offerIdStr = offerId.toString();

    try {
      console.log(`🔄 [Worker] Approving offer ${offerIdStr}...`);

      // Simulate transaction
      const { request } = await this.publicClient.simulateContract({
        address: this.OTC_ADDRESS,
        abi: this.abi,
        functionName: "approveOffer",
        args: [offerId],
        account: this.account,
      });

      const hash = await this.walletClient.writeContract(request);

      // Wait for confirmation
      const receipt = await this.publicClient.waitForTransactionReceipt({
        hash,
        confirmations: 1,
      });

      if (receipt.status === "success") {
        console.log(`✅ [Worker] Offer ${offerIdStr} approved! Tx: ${hash}`);

        // Mark as processed
        this.processedOffers.add(offerIdStr);

        // Store for tracking fulfillment
        this.pendingApprovals.set(offerIdStr, {
          quote,
          approvalTx: hash,
          approvedAt: Date.now(),
        });

        // Update database
        await QuoteService.updateQuoteStatus(quote.quoteId, "approved", {
          offerId: offerIdStr,
          transactionHash: hash,
          approvalNote: "Auto-approved by worker",
        });

        // Send real-time notification to user
        this.notifyApproval(quote.userId, quote.quoteId, offerIdStr, hash);
      } else {
        throw new Error(`Transaction failed: ${hash}`);
      }
    } catch (error) {
      console.error(
        `❌ [Worker] Failed to approve offer ${offerIdStr}:`,
        error,
      );
      throw error;
    }
  }

  private async notifyApproval(
    userId: string,
    quoteId: string,
    offerId: string,
    txHash: string,
  ) {
    try {
      const notificationData = {
        userId,
        quoteId,
        offerId,
        transactionHash: txHash,
        message:
          "✅ Your OTC offer has been approved! You can now complete the payment.",
        timestamp: new Date().toISOString(),
        type: "offer_approved",
      };

      // Send HTTP notification to the API endpoint
      await this.sendHttpNotification("/api/notifications", notificationData);

      console.log(`📢 [Worker] Sent approval notification for user ${userId}`);
    } catch (error) {
      console.error(`Failed to send approval notification: ${error}`);
    }
  }

  private async notifyDealCompletion(offerId: string, quote: any, offer: any) {
    const completionData = {
      quoteId: quote.quoteId,
      userId: quote.userId,
      beneficiary: offer.beneficiary,
      tokenAmount: formatEther(offer.tokenAmount),
      apr: quote.apr,
      lockupMonths: quote.lockupMonths,
      discountBps: quote.discountBps,
      totalUsd:
        (Number(offer.priceUsdPerToken) *
          Number(formatEther(offer.tokenAmount))) /
        100,
      paymentAmount:
        offer.currency === 0
          ? formatEther(offer.amountPaid)
          : (Number(offer.amountPaid) / 1e6).toString(),
      paymentCurrency: offer.currency === 0 ? "ETH" : "USDC",
      transactionHash: offer.transactionHash,
      offerId,
    };

    // Record in database
    await DealCompletionService.recordDealCompletion({
      userId: quote.userId,
      quoteId: quote.quoteId,
      transactionHash: offer.transactionHash || "pending",
      offerId: offerId,
      volumeUsd: completionData.totalUsd,
      savedUsd: completionData.totalUsd * (completionData.discountBps / 10000),
    });

    // Send congratulations notification via HTTP
    try {
      const notificationData = {
        userId: quote.userId,
        quoteId: quote.quoteId,
        offerId,
        message: "🎉 Congratulations! Your ElizaOS deal is complete!",
        type: "deal_completed",
        dealSummary: {
          tokenAmount: completionData.tokenAmount,
          savings: (
            (completionData.totalUsd * quote.discountBps) /
            10000
          ).toFixed(2),
          apr: quote.apr,
          lockupMonths: quote.lockupMonths,
          maturityDate: new Date(
            Date.now() + quote.lockupMonths * 30 * 24 * 60 * 60 * 1000,
          ).toISOString(),
        },
        timestamp: new Date().toISOString(),
      };

      await this.sendHttpNotification("/api/notifications", notificationData);

      console.log(
        `🎉 [Worker] Sent deal completion notification for user ${quote.userId}`,
      );
    } catch (error) {
      console.error(`Failed to send deal completion notification: ${error}`);
    }
  }

  private async getActiveQuotes() {
    const quotes = await QuoteService.getActiveQuotes();
    return quotes.map((q) => ({
      userId: q.userId,
      tokenAmount: q.tokenAmount,
      discountBps: q.discountBps,
      paymentCurrency: q.paymentCurrency as "ETH" | "USDC",
      apr: q.apr,
      lockupMonths: q.lockupMonths,
      quoteId: q.quoteId,
      createdAt: q.createdAt,
      expiresAt: q.expiresAt,
      beneficiary: q.beneficiary || undefined,
    }));
  }

  private findMatchingQuote(offer: any, quotes: any[]): any | null {
    for (const quote of quotes) {
      if (this.matchesQuote(offer, quote)) {
        return quote;
      }
    }
    return null;
  }

  private matchesQuote(offer: any, quote: any): boolean {
    // Check beneficiary match if available
    if (quote.beneficiary && offer.beneficiary) {
      const beneficiaryMatch =
        offer.beneficiary.toLowerCase() === quote.beneficiary.toLowerCase();
      if (!beneficiaryMatch) return false;
    }

    const offerTokenAmount = formatEther(offer.tokenAmount);
    const quoteTokenAmount = parseFloat(quote.tokenAmount);

    // Allow 0.1% tolerance for rounding
    const tokenAmountMatch =
      Math.abs(parseFloat(offerTokenAmount) - quoteTokenAmount) /
        quoteTokenAmount <
      0.001;

    const discountMatch = Number(offer.discountBps) === quote.discountBps;
    const currencyMatch =
      (offer.currency === 0 && quote.paymentCurrency === "ETH") ||
      (offer.currency === 1 && quote.paymentCurrency === "USDC");

    // Check lockup period (1 day tolerance)
    const offerLockupDays =
      Number(offer.unlockTime - offer.createdAt) / (60 * 60 * 24);
    const quoteLockupDays = quote.lockupMonths * 30;
    const lockupMatch = Math.abs(offerLockupDays - quoteLockupDays) <= 1;

    // Verify quote signature if available
    if (quote.beneficiary) {
      const isValid = QuoteService.verifyQuoteSignature(quote);
      if (!isValid) {
        console.warn(
          `Quote signature verification failed for ${quote.quoteId}`,
        );
        return false;
      }
    }

    return tokenAmountMatch && discountMatch && currencyMatch && lockupMatch;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Helper method to send HTTP notifications to API endpoints
   * @param endpoint - The API endpoint path (e.g., '/api/notifications')
   * @param data - The notification payload
   */
  private async sendHttpNotification(
    endpoint: string,
    data: any,
  ): Promise<void> {
    try {
      const url = `${this.apiBaseUrl}${endpoint}`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Add any auth headers if needed for internal API calls
          "X-Worker-Auth": process.env.WORKER_AUTH_TOKEN || "internal-worker",
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `HTTP notification failed: ${response.status} - ${errorText}`,
        );
      }

      const result = await response.json();
      console.log(`✅ HTTP notification sent successfully:`, result);
    } catch (error) {
      console.error(
        `❌ Failed to send HTTP notification to ${endpoint}:`,
        error,
      );
      throw error;
    }
  }
}

// Singleton management
let workerInstance: QuoteApprovalWorker | null = null;

export function startQuoteApprovalWorker() {
  if (!workerInstance) {
    workerInstance = new QuoteApprovalWorker();
    workerInstance.start().catch(console.error);
    console.log("✨ Quote approval worker started");
  }
  return workerInstance;
}

export function stopQuoteApprovalWorker() {
  if (workerInstance) {
    workerInstance.stop();
    workerInstance = null;
    console.log("🛑 Quote approval worker stopped");
  }
}

// Legacy exports for backwards compatibility
export const startEnhancedWorker = startQuoteApprovalWorker;
export const stopEnhancedWorker = stopQuoteApprovalWorker;

// Auto-start in development
if (
  process.env.NODE_ENV === "development" &&
  process.env.AUTO_START_WORKER === "true"
) {
  startQuoteApprovalWorker();
}
