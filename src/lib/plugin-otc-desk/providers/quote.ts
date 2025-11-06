import QuoteService from "@/lib/plugin-otc-desk/services/quoteService";
import { IAgentRuntime, Memory, Provider, ProviderResult } from "@elizaos/core";
import { agentRuntime } from "../../agent-runtime";
import { walletToEntityId } from "../../entityId";
import { formatTokenAmount } from "../services/priceFeed";
import type { PaymentCurrency, QuoteMemory } from "../types";

export const quoteProvider: Provider = {
  name: "ElizaQuote",
  get: async (
    runtime: IAgentRuntime,
    message: Memory,
  ): Promise<ProviderResult> => {
    const messageText = message.content?.text || "";

    // Only provide quote context if user is asking about quotes/terms/pricing
    const isQuoteRelated =
      /quote|discount|lockup|price|term|deal|offer|buy|purchase|%|percent/i.test(
        messageText,
      );

    if (!isQuoteRelated) {
      console.log(
        "[QuoteProvider] Skipping - not quote-related:",
        messageText.substring(0, 50),
      );
      return { text: "" }; // Return empty to not pollute context
    }

    const walletAddress = message.entityId || message.roomId || "default";

    console.log("[QuoteProvider] get() called for wallet:", walletAddress);

    // Use QuoteService for consistent quote lookup
    const quoteService = runtime.getService<QuoteService>("QuoteService");
    if (!quoteService) {
      return {
        text: `No active quote. Offer them a deal on tokens with a discount and lockup.`,
      };
    }

    const currentQuote = await quoteService.getQuoteByWallet(walletAddress);
    console.log(
      "[QuoteProvider] QuoteService result:",
      currentQuote ? currentQuote.quoteId : "null",
    );

    if (!currentQuote) {
      return {
        text: `No active quote. Offer them a deal on tokens with a discount and lockup.`,
      };
    }

    const formattedAmount = formatTokenAmount(currentQuote.tokenAmount);

    return {
      text: `
Current Agent Quote (ID: ${currentQuote.quoteId}):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Amount: ${Number(currentQuote.tokenAmount) > 0 ? formattedAmount + " tokens" : "Choose amount at acceptance"}
💰 Price per Token: Determined by oracle on-chain at execution
💵 Total Value: $${currentQuote.totalUsd.toFixed(2)} (estimated at creation)
🎯 Discount: ${currentQuote.discountBps / 100}% (${currentQuote.discountBps} bps)
✨ Your Price: $${currentQuote.discountedUsd.toFixed(2)} (estimated at creation)
💳 Payment Method: ${currentQuote.paymentCurrency}
🔒 Lockup: ${currentQuote.lockupMonths} months

FAQ:
- What is the minimum order size?
Minimum order size varies by listing. Check with individual token listings.

- What is the maximum order size?
Maximum order size varies by token availability and listing constraints.

- What is the maximum discount?
Try us. Negotiate if you can :) Discounts typically range from 2-10% but are open to negotiation based on lockup duration.

- What is the maximum lockup?
For deeper discounts, lockups can extend up to 12 months depending on the listing.

- What is the minimum lockup?
Minimum lockup periods start at 1 week, depending on the token listing.

- How do I buy the tokens?
You'll need ETH or USDC on the appropriate network (Base, BSC, Jeju, or Solana).

- When do I get my tokens?
You'll automatically receive your tokens when the lockup period ends.`.trim(),
    };
  },
};

export async function getUserQuote(
  walletAddress: string,
): Promise<QuoteMemory | undefined> {
  const { agentRuntime } = await import("../../agent-runtime");
  const runtime = await agentRuntime.getRuntime();

  // Use QuoteService to get quote (it has the correct ID generation logic)
  const quoteService = runtime.getService<any>("QuoteService");
  if (!quoteService) {
    return undefined;
  }

  const quote = await quoteService.getQuoteByWallet(walletAddress);
  return quote;
}

export async function setUserQuote(
  walletAddress: string,
  quote: {
    tokenAmount: string;
    discountBps: number;
    paymentCurrency: PaymentCurrency;
    totalUsd: number;
    discountedUsd: number;
    createdAt: number;
    quoteId: string;
    apr: number;
    lockupMonths: number;
    paymentAmount: string;
  },
): Promise<QuoteMemory> {
  const normalized = walletAddress.toLowerCase();
  const entityId = walletToEntityId(normalized);

  console.log("[setUserQuote] Creating new quote:", {
    walletAddress: normalized,
    entityId,
    discountBps: quote.discountBps,
    lockupMonths: quote.lockupMonths,
  });

  const runtime = await agentRuntime.getRuntime();

  // Generate consistent quote ID using the same method as QuoteService
  const crypto = await import("crypto");
  const dayTimestamp = Math.floor(Date.now() / (24 * 60 * 60 * 1000));
  const hash = crypto
    .createHash("sha256")
    .update(`${entityId}-${dayTimestamp}`)
    .digest("hex")
    .substring(0, 12)
    .toUpperCase();
  const quoteId = `OTC-${hash}`;

  const lockupDays = quote.lockupMonths * 30;
  const now = Date.now();

  // Generate signature using same method as QuoteService
  const secret =
    process.env.WORKER_AUTH_TOKEN || "dev-secret-DO-NOT-USE-IN-PRODUCTION";
  const signatureData = {
    quoteId,
    entityId,
    beneficiary: normalized,
    tokenAmount: quote.tokenAmount,
    discountBps: quote.discountBps,
    lockupMonths: quote.lockupMonths,
  };
  const payload = JSON.stringify(signatureData);
  const signature = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

  const quoteData: QuoteMemory = {
    id: (await import("uuid")).v4(),
    quoteId,
    entityId,
    beneficiary: normalized,
    tokenAmount: quote.tokenAmount,
    discountBps: quote.discountBps,
    apr: quote.apr,
    lockupMonths: quote.lockupMonths,
    lockupDays,
    paymentCurrency: quote.paymentCurrency,
    totalUsd: quote.totalUsd,
    discountUsd: quote.totalUsd - quote.discountedUsd,
    discountedUsd: quote.discountedUsd,
    paymentAmount: quote.paymentAmount,
    signature,
    status: "active",
    createdAt: now,
    executedAt: 0,
    rejectedAt: 0,
    approvedAt: 0,
    offerId: "",
    transactionHash: "",
    blockNumber: 0,
    rejectionReason: "",
    approvalNote: "",
  };

  await runtime.setCache(`quote:${quoteId}`, quoteData);

  // Add to indexes
  const allQuotes = (await runtime.getCache<string[]>("all_quotes")) ?? [];
  if (!allQuotes.includes(quoteId)) {
    allQuotes.push(quoteId);
    await runtime.setCache("all_quotes", allQuotes);
  }

  const entityQuoteIds =
    (await runtime.getCache<string[]>(`entity_quotes:${entityId}`)) ?? [];
  if (!entityQuoteIds.includes(quoteId)) {
    entityQuoteIds.push(quoteId);
    await runtime.setCache(`entity_quotes:${entityId}`, entityQuoteIds);
  }

  console.log("[setUserQuote] ✅ New quote created and indexed:", quoteId);
  return quoteData;
}

export async function deleteUserQuote(walletAddress: string): Promise<void> {
  const normalized = walletAddress.toLowerCase();
  const entityId = walletToEntityId(normalized);

  console.log("[deleteUserQuote] Deleting quote for wallet:", normalized);

  const runtime = await agentRuntime.getRuntime();
  const quote = await getUserQuote(walletAddress);

  if (!quote) {
    console.log("[deleteUserQuote] No quote found to delete");
    return;
  }

  await runtime.deleteCache(`quote:${quote.quoteId}`);

  const entityQuoteIds =
    (await runtime.getCache<string[]>(`entity_quotes:${entityId}`)) ?? [];
  const updatedEntityQuoteIds = entityQuoteIds.filter(
    (id) => id !== quote.quoteId,
  );
  await runtime.setCache(`entity_quotes:${entityId}`, updatedEntityQuoteIds);

  const allQuotes = (await runtime.getCache<string[]>("all_quotes")) ?? [];
  const updatedAllQuotes = allQuotes.filter((id) => id !== quote.quoteId);
  await runtime.setCache("all_quotes", updatedAllQuotes);

  console.log("[deleteUserQuote] ✅ Quote deleted:", quote.quoteId);
}
