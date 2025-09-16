// Quote history action - show user's ElizaOS quote history and statistics

import {
  Action,
  IAgentRuntime,
  Memory,
  State,
  HandlerCallback,
  Content,
  ActionResult,
} from "@elizaos/core";
import {
  getUserQuoteHistory,
  getUserQuoteStats,
} from "../services/quoteHistory";
import { formatElizaAmount } from "../services/priceFeed";

export const quoteHistoryAction: Action = {
  name: "SHOW_ELIZAOS_HISTORY",
  similes: [
    "show history",
    "quote history",
    "my quotes",
    "past quotes",
    "show my quotes",
    "eliza stats",
    "my statistics",
  ],
  description: "Display user's ElizaOS quote history and statistics",

  validate: async () => true,

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

      // Get user's history and stats
      const stats = getUserQuoteStats(userId);
      const history = getUserQuoteHistory(userId, { limit: 10 });

      if (history.length === 0) {
        if (callback) {
          await callback({
            text: "📊 You haven't created any ElizaOS quotes yet. Start by saying 'create quote for 100000 ElizaOS at 10% discount'",
            action: "NO_HISTORY",
          });
        }
        return { success: true };
      }

      // Format history entries
      const historyText = history
        .map((quote, index) => {
          const date = new Date(quote.createdAt).toLocaleDateString();
          const time = new Date(quote.createdAt).toLocaleTimeString();
          const statusEmoji =
            {
              created: "🆕",
              expired: "⏰",
              accepted: "✅",
              rejected: "❌",
              executed: "💎",
            }[quote.status] || "❓";

          const formattedAmount = formatElizaAmount(quote.tokenAmount);

          return `${index + 1}. ${statusEmoji} ${quote.quoteId} - ${formattedAmount} ElizaOS @ ${(quote.discountBps / 100).toFixed(1)}% off - $${quote.discountedUsd.toFixed(2)} - ${date} ${time}`;
        })
        .join("\n");

      // XML response for frontend
      const xmlResponse = `
<QuoteHistory>
  <Stats>
    <Total>${stats.total}</Total>
    <Executed>${stats.executed}</Executed>
    <Expired>${stats.expired}</Expired>
    <TotalVolumeUsd>${stats.totalVolumeUsd.toFixed(2)}</TotalVolumeUsd>
    <TotalSavedUsd>${stats.totalSavedUsd.toFixed(2)}</TotalSavedUsd>
    <TotalElizaPurchased>${stats.totalElizaPurchased}</TotalElizaPurchased>
    <AverageDiscountPercent>${(stats.averageDiscountBps / 100).toFixed(2)}</AverageDiscountPercent>
  </Stats>
  <Quotes>
    ${history
      .map(
        (q) => `
    <Quote>
      <QuoteId>${q.quoteId}</QuoteId>
      <TokenAmount>${q.tokenAmount}</TokenAmount>
      <TokenAmountFormatted>${formatElizaAmount(q.tokenAmount)}</TokenAmountFormatted>
      <DiscountBps>${q.discountBps}</DiscountBps>
      <FinalPriceUsd>${q.discountedUsd.toFixed(2)}</FinalPriceUsd>
      <Status>${q.status}</Status>
      <CreatedAt>${new Date(q.createdAt).toISOString()}</CreatedAt>
      ${q.transactionHash ? `<TransactionHash>${q.transactionHash}</TransactionHash>` : ""}
      ${q.offerId ? `<OfferId>${q.offerId}</OfferId>` : ""}
    </Quote>`,
      )
      .join("")}
  </Quotes>
  <Message>Showing last ${history.length} ElizaOS quotes</Message>
</QuoteHistory>`;

      const textResponse = `
📊 **Your ElizaOS Quote History & Statistics**

📈 **Lifetime Stats:**
• Total Quotes: ${stats.total}
• Executed: ${stats.executed} (${stats.total > 0 ? ((stats.executed / stats.total) * 100).toFixed(0) : 0}% success rate)
• Expired: ${stats.expired}
• Total ElizaOS Purchased: ${formatElizaAmount(stats.totalElizaPurchased)}
• Total Volume: $${stats.totalVolumeUsd.toFixed(2)}
• Total Saved: $${stats.totalSavedUsd.toFixed(2)}
• Average Discount: ${(stats.averageDiscountBps / 100).toFixed(2)}%

📜 **Recent ElizaOS Quotes (Last 10):**
${historyText}

Legend: 🆕 Created | ✅ Accepted | 💎 Executed | ⏰ Expired | ❌ Rejected

💡 **Tips:**
• Create a new quote: "quote me 50000 ElizaOS at 15% discount"
• Check current quote: "show my quote"
• Accept quote: "accept quote"
      `.trim();

      if (callback) {
        await callback({
          text: textResponse,
          action: "HISTORY_SHOWN",
          content: {
            xml: xmlResponse,
            stats,
            history,
          } as Content,
        });
      }

      return { success: true };
    } catch (error) {
      console.error("Error fetching ElizaOS quote history:", error);
      if (callback) {
        await callback({
          text: "❌ Failed to fetch quote history. Please try again.",
          action: "HISTORY_ERROR",
        });
      }
      return { success: false };
    }
  },

  examples: [],
};
