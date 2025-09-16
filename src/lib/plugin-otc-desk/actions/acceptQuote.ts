// Accept/fulfill quote action - executes the quote purchase based on cached quote

import {
  Action,
  IAgentRuntime,
  Memory,
  State,
  HandlerCallback,
  Content,
  ActionResult,
} from "@elizaos/core";
import { getUserQuote, deleteUserQuote } from "../providers/quote";
import { updateQuoteStatus } from "../services/quoteHistory";
import { notificationService } from "../services/notifications";
import { ELIZAOS_TOKEN, formatElizaAmount } from "../services/priceFeed";

// Mock function to simulate blockchain interaction
// In production, this would use the actual OTC contract via wagmi/ethers
async function createOTCOfferOnChain(): Promise<{
  offerId: number;
  transactionHash: string;
  success: boolean;
  error?: string;
}> {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // In production, this would:
  // 1. Connect to the OTC contract
  // 2. Call createOffer with the quote parameters
  // 3. Wait for transaction confirmation
  // 4. Return the actual offer ID and transaction hash

  // For now, simulate success 90% of the time
  if (Math.random() > 0.9) {
    return {
      offerId: 0,
      transactionHash: "",
      success: false,
      error: "Transaction failed: insufficient gas",
    };
  }

  return {
    offerId: Math.floor(Math.random() * 10000),
    transactionHash: `0x${Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("")}`,
    success: true,
  };
}

export const acceptQuoteAction: Action = {
  name: "ACCEPT_ELIZAOS_QUOTE",
  similes: [
    "accept quote",
    "fulfill quote",
    "execute quote",
    "confirm quote",
    "buy eliza",
    "purchase eliza",
    "proceed with quote",
  ],
  description: "Accept and execute a previously generated ElizaOS quote",

  validate: async (runtime: IAgentRuntime, message: Memory) => {
    const text = message.content?.text?.toLowerCase() || "";
    return (
      (text.includes("accept") ||
        text.includes("fulfill") ||
        text.includes("execute") ||
        text.includes("confirm") ||
        text.includes("proceed") ||
        text.includes("buy") ||
        text.includes("purchase")) &&
      (text.includes("quote") ||
        text.includes("otc") ||
        text.includes("eliza") ||
        text.includes("it"))
    );
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
    _options: { [key: string]: unknown },
    callback?: HandlerCallback,
  ): Promise<ActionResult> => {
    try {
      const userId =
        (message as any).userId ||
        (message as any).entityId ||
        (message as any).roomId ||
        "default";

      // Get the user's current quote
      const quote = getUserQuote(userId);

      if (!quote) {
        if (callback) {
          await callback({
            text: "❌ No active ElizaOS quote found. Please create a quote first using 'create quote'.",
            action: "NO_QUOTE",
          });
        }
        return { success: false };
      }

      // Check if quote has expired
      const now = Date.now();
      if (quote.expiresAt < now) {
        deleteUserQuote(userId);
        updateQuoteStatus(userId, quote.quoteId, { status: "expired" });
        notificationService.notifyQuoteExpired(userId, quote.quoteId);

        if (callback) {
          await callback({
            text: "❌ Your ElizaOS quote has expired. Please create a new quote.",
            action: "QUOTE_EXPIRED",
          });
        }
        return { success: false };
      }

      // Update status to accepted
      updateQuoteStatus(userId, quote.quoteId, {
        status: "accepted",
        acceptedAt: now,
      });
      notificationService.notifyQuoteAccepted(userId, quote.quoteId);

      // Attempt to create offer on blockchain
      const result = await createOTCOfferOnChain();

      if (!result.success) {
        // Handle failure
        updateQuoteStatus(userId, quote.quoteId, {
          status: "rejected",
          rejectionReason: result.error || "Transaction failed",
        });
        notificationService.notifyQuoteRejected(
          userId,
          quote.quoteId,
          result.error || "Transaction failed",
        );

        if (callback) {
          await callback({
            text: `❌ Failed to execute ElizaOS quote: ${result.error || "Transaction failed"}. Please try again.`,
            action: "EXECUTION_FAILED",
          });
        }
        return { success: false };
      }

      // Success - update history and clear quote
      updateQuoteStatus(userId, quote.quoteId, {
        status: "executed",
        executedAt: now,
        transactionHash: result.transactionHash,
        offerId: result.offerId,
      });

      deleteUserQuote(userId);
      notificationService.notifyQuoteExecuted(
        userId,
        quote.quoteId,
        result.transactionHash,
      );

      // Format amount for display
      const formattedAmount = formatElizaAmount(quote.tokenAmount);

      // Calculate payment amount for display
      let paymentAmount: string;
      if (quote.paymentCurrency === "ETH") {
        // Use the payment amount from the quote if available
        if ("paymentAmount" in quote && quote.paymentAmount) {
          paymentAmount = String(quote.paymentAmount);
        } else {
          // Fallback calculation (should not happen with properly formed quotes)
          const { getEthPriceUsd } = await import("../services/priceFeed");
          const ethPrice = await getEthPriceUsd();
          const ethAmount = quote.discountedUsd / ethPrice;
          paymentAmount = ethAmount.toFixed(6);
        }
      } else {
        paymentAmount = quote.discountedUsd.toFixed(2);
      }

      // Enhanced XML response for frontend
      const xmlResponse = `
<QuoteAccepted>
  <QuoteId>${quote.quoteId}</QuoteId>
  <OfferId>${result.offerId}</OfferId>
  <TransactionHash>${result.transactionHash}</TransactionHash>
  <TokenAmount>${quote.tokenAmount}</TokenAmount>
  <TokenAmountFormatted>${formattedAmount}</TokenAmountFormatted>
  <TokenSymbol>${ELIZAOS_TOKEN.symbol}</TokenSymbol>
  <TokenName>${ELIZAOS_TOKEN.name}</TokenName>
  <PaidAmount>${paymentAmount}</PaidAmount>
  <PaymentCurrency>${quote.paymentCurrency}</PaymentCurrency>
  <DiscountBps>${quote.discountBps}</DiscountBps>
  <DiscountPercent>${(quote.discountBps / 100).toFixed(2)}</DiscountPercent>
  <TotalSaved>${(quote.totalUsd - quote.discountedUsd).toFixed(2)}</TotalSaved>
  <FinalPrice>${quote.discountedUsd.toFixed(2)}</FinalPrice>
  <Status>executed</Status>
  <Timestamp>${new Date().toISOString()}</Timestamp>
  <Message>ElizaOS quote executed successfully! Your otc offer has been created.</Message>
</QuoteAccepted>`;

      const textResponse = `
✅ **ElizaOS Quote Executed Successfully!**

📋 **Order Summary:**
• Quote ID: ${quote.quoteId}
• Offer ID: #${result.offerId}
• Amount: ${formattedAmount} ElizaOS
• Paid: ${paymentAmount} ${quote.paymentCurrency}
• Saved: $${(quote.totalUsd - quote.discountedUsd).toFixed(2)} (${(quote.discountBps / 100).toFixed(2)}%)

🔄 **Status:** Executed
Your quote offer has been created on-chain and is now pending approval.

📝 **Transaction:** 
${result.transactionHash.substring(0, 10)}...${result.transactionHash.substring(result.transactionHash.length - 8)}

⏰ **Next Steps:**
1. Wait for administrator approval
2. Once approved, your ElizaOS tokens will be locked for the vesting period
3. After vesting, you can claim your ElizaOS tokens

You can check your offer status anytime by asking "show my offers" or "check offer #${result.offerId}"
      `.trim();

      if (callback) {
        await callback({
          text:
            textResponse +
            "\n\n<!-- XML_START -->\n" +
            xmlResponse +
            "\n<!-- XML_END -->",
          action: "QUOTE_ACCEPTED",
          content: {
            xml: xmlResponse,
            offerId: result.offerId,
            transactionHash: result.transactionHash,
            quote: quote,
          } as Content,
        });
      }

      // After successful execution, automatically notify about approval (mock)
      setTimeout(() => {
        notificationService.notifyQuoteApproved(
          userId,
          quote.quoteId,
          result.offerId,
        );
      }, 5000);

      return { success: true };
    } catch (error) {
      console.error("Error accepting ElizaOS quote:", error);
      if (callback) {
        await callback({
          text: "❌ Failed to accept ElizaOS quote. Please try again.",
          action: "ACCEPT_ERROR",
        });
      }
      return { success: false };
    }
  },

  examples: [],
};
