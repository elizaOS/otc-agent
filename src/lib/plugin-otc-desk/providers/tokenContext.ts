import { IAgentRuntime, Memory, Provider, ProviderResult } from "@elizaos/core";
import { TokenDB, ConsignmentDB } from "@/services/database";

export const tokenContextProvider: Provider = {
  name: "TOKEN_CONTEXT",
  description: "Provides context about available tokens and OTC deals",
  position: 98,
  dynamic: true,
  get: async (
    runtime: IAgentRuntime,
    message: Memory,
  ): Promise<ProviderResult> => {
    const messageText = message.content?.text || "";

    const tokenMatch = messageText.match(/\b([A-Z]{2,6})\b/);
    let tokenId: string | null = null;

    if (tokenMatch) {
      const symbol = tokenMatch[1];
      const allTokens = await TokenDB.getAllTokens();
      const token = allTokens.find((t) => t.symbol === symbol);
      if (token) tokenId = token.id;
    }

    if (!tokenId) {
      const popularTokens = await TokenDB.getAllTokens({ isActive: true });
      const top5 = popularTokens.slice(0, 5);

      const consignmentCounts = await Promise.all(
        top5.map(async (t) => {
          const consignments = await ConsignmentDB.getConsignmentsByToken(t.id);
          return { token: t, count: consignments.length };
        }),
      );

      const text =
        `Available tokens for OTC deals:\n` +
        consignmentCounts
          .map(
            ({ token, count }) => `- ${token.symbol}: ${count} active deal(s)`,
          )
          .join("\n");

      return { text };
    }

    const token = await TokenDB.getToken(tokenId);
    const consignments = await ConsignmentDB.getConsignmentsByToken(tokenId);

    if (consignments.length === 0) {
      return {
        text: `Token: ${token.symbol}\nNo active OTC deals available for this token.`,
      };
    }

    const negotiableConsignments = consignments.filter((c) => c.isNegotiable);
    const fixedConsignments = consignments.filter((c) => !c.isNegotiable);

    let text = `Token: ${token.symbol}\n`;

    if (negotiableConsignments.length > 0) {
      const minDiscount = Math.min(
        ...negotiableConsignments.map((c) => c.minDiscountBps / 100),
      );
      const maxDiscount = Math.max(
        ...negotiableConsignments.map((c) => c.maxDiscountBps / 100),
      );
      const minLockup = Math.min(
        ...negotiableConsignments.map((c) => c.minLockupDays),
      );
      const maxLockup = Math.max(
        ...negotiableConsignments.map((c) => c.maxLockupDays),
      );

      text += `Negotiable deals: Discount ${minDiscount}%-${maxDiscount}%, Lockup ${minLockup}-${maxLockup} days\n`;
    }

    if (fixedConsignments.length > 0) {
      text += `Fixed price deals: `;
      text += fixedConsignments
        .map(
          (c) =>
            `${c.fixedDiscountBps / 100}% discount, ${c.fixedLockupDays} days lockup`,
        )
        .join("; ");
    }

    return { text };
  },
};
