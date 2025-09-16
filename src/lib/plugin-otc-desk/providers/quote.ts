// Current quote provider -- show what the current ElizaOS quote is for the user

import { IAgentRuntime, Memory, Provider, ProviderResult } from "@elizaos/core";
import { formatElizaAmount } from "../services/priceFeed";
import { getUserQuoteStats } from "../services/quoteHistory";
import { QuoteService } from "../../../services/database";

// In-memory cache for user quotes (backed by database)
const quoteCache = new Map<
  string,
  {
    userId: string;
    tokenAmount: string; // ElizaOS amount
    discountBps: number;
    paymentCurrency: "ETH" | "USDC";
    priceUsdPerToken: number;
    totalUsd: number;
    discountedUsd: number;
    expiresAt: number;
    createdAt: number;
    quoteId: string;
    apr?: number;
    lockupMonths?: number;
    beneficiary?: string;
  }
>();

export const quoteProvider: Provider = {
  name: "currentElizaQuote",
  get: async (
    runtime: IAgentRuntime,
    message: Memory,
  ): Promise<ProviderResult> => {
    const userId =
      (message as any).userId ||
      (message as any).entityId ||
      (message as any).roomId ||
      "default";

    // Get the current quote for this user
    const currentQuote = quoteCache.get(userId);

    // Get user stats
    const stats = getUserQuoteStats(userId);

    if (!currentQuote) {
      let statsText = "";
      if (stats.total > 0) {
        statsText = `\n\n📈 Your ElizaOS Stats: ${stats.executed} executed, ${formatElizaAmount(stats.totalElizaPurchased)} ElizaOS purchased, $${stats.totalVolumeUsd.toFixed(2)} spent, $${stats.totalSavedUsd.toFixed(2)} saved`;
      }

      return {
        text: `No active ElizaOS quote. Use 'create quote' to generate a quote for ElizaOS tokens.${statsText}`,
      };
    }

    const formattedAmount = formatElizaAmount(currentQuote.tokenAmount);

    return {
      text: `
Current Agent Quote (ID: ${currentQuote.quoteId}):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Amount: ${Number(currentQuote.tokenAmount) > 0 ? formattedAmount + " ElizaOS" : "Choose amount at acceptance"}
💰 Price per Token: $${currentQuote.priceUsdPerToken.toFixed(8)}
💵 Total Value: $${currentQuote.totalUsd.toFixed(2)}
🎯 Discount: ${currentQuote.discountBps / 100}% (${currentQuote.discountBps} bps)
✨ Your Price: $${currentQuote.discountedUsd.toFixed(2)}
💳 Payment Method: ${currentQuote.paymentCurrency}

FAQ:
- What is the minimum order size?
We have a minimum order size of 1000 $ElizaOS tokens.

- What is the maximum order size?
We're capping it so we can have enough for everyone to try out the OTC agent, so only 100k $ElizaOS tokens at a time for now.

- What is the maximum discount?
Try us. Negotiate if you can :) Usually we're around 2-10% off but open to negotiation.

- What is the maximum lockup?
For really deep discounts we usually do a discount up to 12 months (52 weeks).

- What is the minimum lockup?
We're offering 1 week lockups for now.

- How do I buy the tokens?
You'll need ETH or USDC on Base.

- Wait, the new $ElizaOS token is on Base? Isn't $ai16z a Solana project?
It's available on Base, Optimism, Arbitrum, Solana, Polygon and Ethereum mainnet.

- When do I get my tokens?
You'll automatically receive your tokens when the lockup period ends.`.trim(),
    };
  },
};

// Helper function to get quote cache (for use by action)
export function getUserQuote(userId: string) {
  return quoteCache.get(userId);
}

// Helper function to set quote cache (for use by action)
export async function setUserQuote(
  userId: string,
  quote: {
    tokenAmount: string;
    discountBps: number;
    paymentCurrency: "ETH" | "USDC";
    priceUsdPerToken: number;
    totalUsd: number;
    discountedUsd: number;
    expiresAt: number;
    createdAt: number;
    quoteId: string;
    apr?: number;
    lockupMonths?: number;
    beneficiary?: string;
    paymentAmount?: string;
  },
) {
  // Store in cache with additional fields
  const fullQuote = {
    userId,
    ...quote,
    apr: quote.apr || 8.0,
    lockupMonths: quote.lockupMonths || 5,
  };

  quoteCache.set(userId, fullQuote);

  // Store in database
  try {
    await QuoteService.createQuote({
      userId,
      beneficiary: quote.beneficiary,
      tokenAmount: quote.tokenAmount,
      discountBps: quote.discountBps,
      apr: quote.apr || 8.0,
      lockupMonths: quote.lockupMonths || 5,
      paymentCurrency: quote.paymentCurrency,
      priceUsdPerToken: quote.priceUsdPerToken,
      totalUsd: quote.totalUsd,
      discountUsd: quote.totalUsd - quote.discountedUsd,
      discountedUsd: quote.discountedUsd,
      paymentAmount: quote.paymentAmount || String(quote.discountedUsd),
      expiresAt: new Date(quote.expiresAt),
    });
  } catch (error) {
    console.error("Failed to save quote to database:", error);
  }

  // Keep background expiry update logic for server-side status consistency
  const timeUntilExpiry = quote.expiresAt - Date.now();
  if (timeUntilExpiry > 0) {
    setTimeout(async () => {
      const current = quoteCache.get(userId);
      if (current && current.quoteId === quote.quoteId) {
        quoteCache.delete(userId);

        // Update status in database
        try {
          await QuoteService.updateQuoteStatus(quote.quoteId, "expired");
        } catch (error) {
          console.error("Failed to update quote status:", error);
        }

        // Update status in history (avoid circular import)
        try {
          const { updateQuoteStatus } = await import(
            "../services/quoteHistory"
          );
          updateQuoteStatus(userId, quote.quoteId, { status: "expired" });
        } catch (error) {
          console.error("Failed to update quote history:", error);
        }

        // Send notification (avoid circular import)
        try {
          const { notificationService } = await import(
            "../services/notifications"
          );
          notificationService.notifyQuoteExpired(userId, quote.quoteId);
        } catch (error) {
          console.error("Failed to send notification:", error);
        }
      }
    }, timeUntilExpiry);
  }
}

// Helper function to clear expired quotes (could be called periodically)
export function clearExpiredQuotes() {
  const now = Date.now();
  for (const [userId, quote] of quoteCache.entries()) {
    if (quote.expiresAt < now) {
      quoteCache.delete(userId);
    }
  }
}

// Helper to delete a specific user's quote
export function deleteUserQuote(userId: string) {
  return quoteCache.delete(userId);
}

// Load active quotes from database on startup
export async function loadActiveQuotes() {
  try {
    const activeQuotes = await QuoteService.getActiveQuotes();
    for (const quote of activeQuotes) {
      quoteCache.set(quote.userId, {
        userId: quote.userId,
        tokenAmount: quote.tokenAmount,
        discountBps: quote.discountBps,
        paymentCurrency: quote.paymentCurrency as "ETH" | "USDC",
        priceUsdPerToken: quote.priceUsdPerToken,
        totalUsd: quote.totalUsd,
        discountedUsd: quote.discountedUsd,
        expiresAt: quote.expiresAt.getTime(),
        createdAt: quote.createdAt.getTime(),
        quoteId: quote.quoteId,
        apr: quote.apr,
        lockupMonths: quote.lockupMonths,
        beneficiary: quote.beneficiary || undefined,
      });
    }
    console.log(`Loaded ${activeQuotes.length} active quotes from database`);
    return activeQuotes.length;
  } catch (error) {
    console.error("Failed to load active quotes:", error);
    return 0;
  }
}
