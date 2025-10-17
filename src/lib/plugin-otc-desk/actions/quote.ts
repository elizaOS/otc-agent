// quote action - generate a new OTC quote and return an XML object to the frontend

import {
  Action,
  ActionResult,
  Content,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  State,
} from "@elizaos/core";
import {
  deleteUserQuote,
  getUserQuote,
  setUserQuote,
} from "../providers/quote";
import { getEthPriceUsd } from "../services/priceFeed";
import { ConsignmentService } from "@/services/consignmentService";
import { TokenDB, type OTCConsignment } from "@/services/database";

function parseQuoteRequest(text: string): {
  tokenAmount?: string;
  discountBps?: number;
  paymentCurrency?: "ETH" | "USDC";
} {
  const result: any = {};

  // Parse token amount (various formats)
  const amountMatch = text.match(
    /(\d+(?:,\d{3})*(?:\.\d+)?)\s*(?:tokens?|eliza)?/i,
  );
  if (amountMatch) {
    result.tokenAmount = amountMatch[1].replace(/,/g, "");
  }

  // Parse discount (percentage or bps)
  const discountMatch = text.match(
    /(\d+(?:\.\d+)?)\s*(?:%|percent|bps|basis)/i,
  );
  if (discountMatch) {
    const value = parseFloat(discountMatch[1]);
    // If it's a percentage (has % or "percent"), convert to bps
    if (
      discountMatch[0].includes("%") ||
      discountMatch[0].includes("percent")
    ) {
      result.discountBps = Math.round(value * 100);
    } else {
      result.discountBps = Math.round(value);
    }
  }

  // Parse payment currency
  if (/(\b(eth|ethereum)\b)/i.test(text)) {
    result.paymentCurrency = "ETH";
  } else if (/(\b(usdc|usd|dollar)\b)/i.test(text)) {
    result.paymentCurrency = "USDC";
  }

  return result;
}

const MAX_DISCOUNT_BPS = 2500;

function parseNegotiationRequest(text: string): {
  tokenAmount?: string;
  requestedDiscountBps?: number;
  lockupMonths?: number;
  paymentCurrency?: "ETH" | "USDC";
} {
  const result: any = {};

  // Token amount (reuse existing regex)
  const amountMatch = text.match(
    /(\d+(?:,\d{3})*(?:\.\d+)?)\s*(?:tokens?|eliza)?/i,
  );
  if (amountMatch) {
    result.tokenAmount = amountMatch[1].replace(/,/g, "");
  }

  // Discount request
  const discountMatch = text.match(
    /(\d+(?:\.\d+)?)\s*(?:%|percent|bps|basis|discount)/i,
  );
  if (discountMatch) {
    const value = parseFloat(discountMatch[1]);
    if (
      discountMatch[0].includes("bps") ||
      discountMatch[0].includes("basis")
    ) {
      result.requestedDiscountBps = Math.round(value);
    } else {
      result.requestedDiscountBps = Math.round(value * 100);
    }
  }

  // Lockup period
  const lockupMatch = text.match(
    /(\d+)\s*(?:month|months|mo|week|weeks|wk|day|days|d)/i,
  );
  if (lockupMatch) {
    const value = parseInt(lockupMatch[1]);
    const unit = lockupMatch[0].toLowerCase();
    if (unit.includes("month") || unit.includes("mo")) {
      result.lockupMonths = value;
    } else if (unit.includes("week") || unit.includes("wk")) {
      result.lockupMonths = value / 4; // approx weeks->months
    } else if (unit.includes("day") || unit.includes("d")) {
      result.lockupMonths = value / 30; // approx days->months
    }
  }

  // Payment currency
  if (/(\b(eth|ethereum)\b)/i.test(text)) {
    result.paymentCurrency = "ETH";
  } else if (/(\b(usdc|usd|dollar)\b)/i.test(text)) {
    result.paymentCurrency = "USDC";
  }

  return result;
}

async function extractTokenContext(text: string): Promise<string | null> {
  const tokenMatch = text.match(/\b([A-Z]{2,6})\b/);
  if (tokenMatch) {
    const symbol = tokenMatch[1];
    const allTokens = await TokenDB.getAllTokens();
    const token = allTokens.find((t) => t.symbol === symbol);
    if (token) return token.id;
  }
  return null;
}

async function findSuitableConsignment(
  tokenId: string,
  tokenAmount: string,
  discountBps: number,
  lockupDays: number,
): Promise<OTCConsignment | null> {
  const consignmentService = new ConsignmentService();
  const consignments = await consignmentService.getAllConsignments({ tokenId });
  return consignmentService.findSuitableConsignment(
    consignments,
    tokenAmount,
    discountBps,
    lockupDays,
  );
}

async function negotiateTerms(
  _runtime: IAgentRuntime,
  request: any,
  existingQuote: any,
  consignment?: OTCConsignment,
): Promise<{
  lockupMonths: number;
  discountBps: number;
  paymentCurrency: "ETH" | "USDC";
  reasoning: string;
  consignmentId?: string;
}> {
  let lockupMonths = 5;
  let minDiscountBps = 100;
  let maxDiscountBps = MAX_DISCOUNT_BPS;
  let minLockupDays = 7;
  let maxLockupDays = 365;

  if (consignment) {
    if (consignment.isNegotiable) {
      minDiscountBps = consignment.minDiscountBps;
      maxDiscountBps = consignment.maxDiscountBps;
      minLockupDays = consignment.minLockupDays;
      maxLockupDays = consignment.maxLockupDays;
    } else {
      const discountBps = consignment.fixedDiscountBps || 1000;
      const lockupMonths = Math.round(consignment.fixedLockupDays / 30);
      return {
        lockupMonths,
        discountBps,
        paymentCurrency: request.paymentCurrency || "USDC",
        reasoning: `This is a fixed-price deal: ${discountBps / 100}% discount with ${consignment.fixedLockupDays} days lockup.`,
        consignmentId: consignment.id,
      };
    }
  }

  if (request.lockupMonths) {
    lockupMonths = Math.max(
      minLockupDays / 30,
      Math.min(maxLockupDays / 30, request.lockupMonths),
    );
  }

  let discountBps =
    request.requestedDiscountBps ?? existingQuote?.discountBps ?? 800;
  discountBps = Math.max(minDiscountBps, Math.min(maxDiscountBps, discountBps));

  if (discountBps >= 2000 && lockupMonths < 6) lockupMonths = 6;
  if (discountBps >= 2500 && lockupMonths < 9) lockupMonths = 9;

  const reasoning = `I can offer a ${(discountBps / 100).toFixed(2)}% discount with a ${lockupMonths}-month lockup.`;

  return {
    lockupMonths,
    discountBps,
    paymentCurrency:
      request.paymentCurrency || existingQuote?.paymentCurrency || "USDC",
    reasoning,
    consignmentId: consignment?.id,
  };
}

export const quoteAction: Action = {
  name: "CREATE_OTC_QUOTE",
  similes: [
    "CREATE_OTC_QUOTE",
    "generate quote",
    "create quote",
    "new quote",
    "update quote",
    "modify quote",
  ],
  description: "Generate or update a quote with negotiated terms",

  validate: async () => true,

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State | undefined,
    _options?: { [key: string]: unknown },
    callback?: HandlerCallback,
  ): Promise<ActionResult> => {
    console.log("[CREATE_OTC_QUOTE] Action handler called");
    console.log(
      "[CREATE_OTC_QUOTE] Message object:",
      JSON.stringify(message, null, 2),
    );
    const entityId = message.entityId || message.roomId || "default";
    const text = message.content?.text || "";
    console.log(
      "[CREATE_OTC_QUOTE] EntityId:",
      entityId,
      "Text:",
      text.substring(0, 50),
    );

    // Check for quote cancellation
    if (
      text.toLowerCase().includes("cancel") ||
      text.toLowerCase().includes("delete")
    ) {
      const existingQuote = await getUserQuote(entityId);
      if (existingQuote) {
        await deleteUserQuote(entityId);
      }

      if (callback) {
        await callback({
          text: "Your quote has been cancelled.",
          action: "QUOTE_CANCELLED",
        });
      }
      return { success: true };
    }

    // Parse the request(s)
    const request = parseQuoteRequest(text);
    const negotiationRequest = parseNegotiationRequest(text);

    const tokenId = await extractTokenContext(text);
    const existingQuote = await getUserQuote(entityId);

    // Fetch token info for dynamic symbol/name
    let tokenSymbol = "TOKEN";
    let tokenName = "Token";
    let tokenChain = undefined;
    if (tokenId) {
      try {
        const token = await TokenDB.getToken(tokenId);
        tokenSymbol = token.symbol;
        tokenName = token.name;
        tokenChain = token.chain;
      } catch (error) {
        console.warn("[CREATE_OTC_QUOTE] Failed to fetch token:", tokenId);
      }
    }

    let consignment: OTCConsignment | null = null;
    if (tokenId && negotiationRequest.tokenAmount) {
      const lockupDays = (negotiationRequest.lockupMonths || 5) * 30;
      consignment = await findSuitableConsignment(
        tokenId,
        negotiationRequest.tokenAmount,
        negotiationRequest.requestedDiscountBps || 1000,
        lockupDays,
      );
    }

    const isNegotiation =
      /negotiate|discount|lockup|month/i.test(text) ||
      negotiationRequest.requestedDiscountBps !== undefined ||
      negotiationRequest.lockupMonths !== undefined;

    if (isNegotiation) {
      const negotiated = await negotiateTerms(
        runtime,
        negotiationRequest,
        existingQuote,
        consignment || undefined,
      );

      const ethPriceUsd =
        negotiated.paymentCurrency === "ETH" ? await getEthPriceUsd() : 0;

      // Generate terms-only quote
      const now = Date.now();
      const lockupDays = Math.round(negotiated.lockupMonths * 30);

      const quote = {
        tokenAmount: "0",
        discountBps: negotiated.discountBps,
        paymentCurrency: negotiated.paymentCurrency,
        priceUsdPerToken: 0, // Will be determined by Chainlink oracle on-chain
        totalUsd: 0,
        discountedUsd: 0,
        createdAt: now,
        quoteId: "", // Will be generated by service
        apr: 0,
        lockupMonths: negotiated.lockupMonths,
        paymentAmount: "0",
      };

      console.log("[CREATE_OTC_QUOTE] Creating quote with negotiated terms");
      const storedQuote = await setUserQuote(entityId, quote);
      const quoteId = storedQuote.quoteId;
      console.log("[CREATE_OTC_QUOTE] Quote created with ID:", quoteId);

      const xmlResponse = `
<quote>
  <quoteId>${quoteId}</quoteId>
  <tokenSymbol>${tokenSymbol}</tokenSymbol>
  ${tokenChain ? `<tokenChain>${tokenChain}</tokenChain>` : ""}
  <lockupMonths>${negotiated.lockupMonths}</lockupMonths>
  <lockupDays>${lockupDays}</lockupDays>
  <pricePerToken>0</pricePerToken>
  <discountBps>${negotiated.discountBps}</discountBps>
  <discountPercent>${(negotiated.discountBps / 100).toFixed(2)}</discountPercent>
  <paymentCurrency>${negotiated.paymentCurrency}</paymentCurrency>
  ${negotiated.paymentCurrency === "ETH" ? `<ethPrice>${ethPriceUsd.toFixed(2)}</ethPrice>` : ""}
  <createdAt>${new Date(now).toISOString()}</createdAt>
  <status>negotiated</status>
  <message>Price will be determined by Chainlink oracle when you create the offer on-chain. Terms will be validated on-chain.</message>
</quote>`;

      const textResponse = `${negotiated.reasoning}

📊 **Quote Terms** (ID: ${quoteId})
• **Discount: ${(negotiated.discountBps / 100).toFixed(2)}%**
• **Lockup: ${negotiated.lockupMonths} months** (${lockupDays} days)`;

      if (callback) {
        await callback({
          text:
            textResponse +
            "\n\n<!-- XML_START -->\n" +
            xmlResponse +
            "\n<!-- XML_END -->",
          action: "QUOTE_NEGOTIATED",
          content: { xml: xmlResponse, quote, type: "otc_quote" } as Content,
        });
      }

      return { success: true };
    }

    // ------------- Simple discount-based quote -------------
    const discountBps =
      request.discountBps ?? existingQuote?.discountBps ?? 1000; // Default 10%
    const paymentCurrency =
      request.paymentCurrency || existingQuote?.paymentCurrency || "USDC";

    if (discountBps < 0 || discountBps > MAX_DISCOUNT_BPS) {
      if (callback) {
        await callback({
          text: "❌ Invalid discount. Please specify a discount between 0% and 25%.",
          action: "QUOTE_ERROR",
        });
      }
      return { success: false };
    }

    const ethPriceUsd = paymentCurrency === "ETH" ? await getEthPriceUsd() : 0;

    const now = Date.now();

    const quote = {
      tokenAmount: "0",
      discountBps,
      paymentCurrency,
      totalUsd: 0,
      discountedUsd: 0,
      createdAt: now,
      quoteId: "", // Will be generated by service
      apr: 0,
      lockupMonths: 5,
      paymentAmount: "0",
    };

    console.log("[CREATE_OTC_QUOTE] Creating quote with simple terms");
    const storedQuote = await setUserQuote(entityId, quote);
    const quoteId = storedQuote.quoteId;
    console.log("[CREATE_OTC_QUOTE] Quote created with ID:", quoteId);

    const xmlResponse = `
<quote>
  <quoteId>${quoteId}</quoteId>
  <tokenSymbol>${tokenSymbol}</tokenSymbol>
  <tokenName>${tokenName}</tokenName>
  ${tokenChain ? `<tokenChain>${tokenChain}</tokenChain>` : ""}
  <lockupMonths>5</lockupMonths>
  <lockupDays>150</lockupDays>
  <pricePerToken>0</pricePerToken>
  <discountBps>${discountBps}</discountBps>
  <discountPercent>${(discountBps / 100).toFixed(2)}</discountPercent>
  <paymentCurrency>${paymentCurrency}</paymentCurrency>
  ${paymentCurrency === "ETH" ? `<ethPrice>${ethPriceUsd.toFixed(2)}</ethPrice>` : ""}
  <createdAt>${new Date(now).toISOString()}</createdAt>
  <status>created</status>
  <message>OTC quote terms generated. Price will be determined by Chainlink oracle when you create the offer on-chain.</message>
</quote>`;

    const textResponse = `
Here are current terms I can offer right now.

📊 **Quote Terms:**
• Market Price: Determined by Chainlink oracle on-chain at execution time

💎 **Your Discount:**
• Discount Rate: ${(discountBps / 100).toFixed(2)}% (${discountBps} bps)

You can choose how many tokens to buy when you accept.`.trim();

    if (callback) {
      await callback({
        text:
          textResponse +
          "\n\n<!-- XML_START -->\n" +
          xmlResponse +
          "\n<!-- XML_END -->",
        action: "QUOTE_GENERATED",
        content: { xml: xmlResponse, quote, type: "otc_quote" } as Content,
      });
    }

    return { success: true };
  },

  examples: [],
};
