import QuoteService from "@/lib/plugin-otc-desk/services/quoteService";
import { IAgentRuntime, Memory, Provider, ProviderResult } from "@elizaos/core";
import { agentRuntime } from "../../agent-runtime";
import { walletToEntityId } from "../../entityId";
import { formatElizaAmount } from "../services/priceFeed";
import type { PaymentCurrency, QuoteMemory } from "../types";


export const quoteProvider: Provider = {
  name: "ElizaQuote",
  get: async (
    runtime: IAgentRuntime,
    message: Memory,
  ): Promise<ProviderResult> => {
    const messageText = message.content?.text || "";
    
    // Only provide quote context if user is asking about quotes/terms/pricing
    const isQuoteRelated = /quote|discount|lockup|price|term|deal|offer|buy|purchase|%|percent/i.test(messageText);
    
    if (!isQuoteRelated) {
      console.log('[QuoteProvider] Skipping - not quote-related:', messageText.substring(0, 50));
      return { text: "" }; // Return empty to not pollute context
    }

    const walletAddress =
      (message as any).entityId ||
      (message as any).entityId ||
      (message as any).roomId ||
      "default";

    console.log('[QuoteProvider] get() called for wallet:', walletAddress);

    // Use runtime cache directly
    const entityId = walletToEntityId(walletAddress);
    const quoteId = `OTC-${entityId.substring(0, 12).toUpperCase()}`;
    const currentQuote = await runtime.getCache<QuoteMemory>(`quote:${quoteId}`);
    
    console.log('[QuoteProvider] Cache result:', currentQuote ? currentQuote.quoteId : 'null');

    if (!currentQuote) {
      return {
        text: `No active ElizaOS quote. Offer them a deal on ElizaOS tokens with a discount and lockup.`,
      };
    }

    const formattedAmount = formatElizaAmount(currentQuote.tokenAmount);

    return {
      text: `
Current Agent Quote (ID: ${currentQuote.quoteId}):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Amount: ${Number(currentQuote.tokenAmount) > 0 ? formattedAmount + " ElizaOS" : "Choose amount at acceptance"}
💰 Price per Token: Determined by Chainlink oracle on-chain at execution
💵 Total Value: $${currentQuote.totalUsd.toFixed(2)} (estimated at creation)
🎯 Discount: ${currentQuote.discountBps / 100}% (${currentQuote.discountBps} bps)
✨ Your Price: $${currentQuote.discountedUsd.toFixed(2)} (estimated at creation)
💳 Payment Method: ${currentQuote.paymentCurrency}
🔒 Lockup: ${currentQuote.lockupMonths} months

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

export async function getUserQuote(walletAddress: string): Promise<QuoteMemory | undefined> {
  const { agentRuntime } = await import("../../agent-runtime");
  const runtime = await agentRuntime.getRuntime();
  
  // Use runtime cache directly instead of service
  const entityId = walletToEntityId(walletAddress);
  const quoteId = `OTC-${entityId.substring(0, 12).toUpperCase()}`;
  const quote = await runtime.getCache<QuoteMemory>(`quote:${quoteId}`);
  
  if (!quote || quote.status !== "active") {
    return undefined;
  }
  
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
  
  console.log('[setUserQuote] Creating new quote:', {
    walletAddress: normalized,
    entityId,
    discountBps: quote.discountBps,
    lockupMonths: quote.lockupMonths
  });

  const runtime = await agentRuntime.getRuntime();
  
  // Use runtime cache directly instead of QuoteService
  const quoteId = `OTC-${entityId.substring(0, 12).toUpperCase()}`;
  const lockupDays = quote.lockupMonths * 30;
  const now = Date.now();
  
  // Generate signature
  const secret = process.env.QUOTE_SIGNATURE_SECRET || "default-secret";
  const payload = `${quoteId}:${entityId}:${normalized}:${quote.tokenAmount}:${quote.discountBps}:${quote.lockupMonths}`;
  const crypto = await import("crypto");
  const signature = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  
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
  
  console.log('[setUserQuote] ✅ New quote created:', quoteId);
  return quoteData;
}

export async function deleteUserQuote(walletAddress: string): Promise<void> {
  // In serverless, we can't delete from memory - just mark as expired in DB
  console.log('[QuoteProvider] deleteUserQuote called for:', walletAddress);
}

export async function loadActiveQuotes(): Promise<void> {
  const runtime = await agentRuntime.getRuntime();
  const quoteService = runtime.getService<QuoteService>(QuoteService.serviceName);
  
  if (quoteService) {
    const activeQuotes = await quoteService.getActiveQuotes();
    console.log(`[QuoteProvider] Loaded ${activeQuotes.length} active quotes`);
  }
}