// Database service layer using Eliza runtime services

import { agentRuntime } from "@/lib/agent-runtime";
import type QuoteService from "@/lib/plugin-otc-desk/services/quoteService";
import type {
  PaymentCurrency,
  QuoteMemory as Quote,
  QuoteStatus,
  Token,
  TokenMarketData,
  OTCConsignment,
  ConsignmentDeal,
  Chain,
} from "@/types";

export type { PaymentCurrency, QuoteStatus, Chain, Token, TokenMarketData, OTCConsignment, ConsignmentDeal };

export class QuoteDB {
  static async createQuote(data: {
    entityId: string;
    beneficiary: string;
    tokenAmount: string;
    discountBps: number;
    apr: number;
    lockupMonths: number;
    paymentCurrency: PaymentCurrency;
    totalUsd: number;
    discountUsd: number;
    discountedUsd: number;
    paymentAmount: string;
  }): Promise<Quote> {
    const runtime = await agentRuntime.getRuntime();
    const service = runtime.getService<QuoteService>("QuoteService");
    if (!service) throw new Error("QuoteService not registered");
    return await service.createQuote(data);
  }

  static async getActiveQuotes(): Promise<Quote[]> {
    const runtime = await agentRuntime.getRuntime();
    const service = runtime.getService<QuoteService>("QuoteService");
    if (!service) throw new Error("QuoteService not registered");
    return await service.getActiveQuotes();
  }

  static async getQuoteByBeneficiary(beneficiary: string): Promise<Quote> {
    const runtime = await agentRuntime.getRuntime();
    const service = runtime.getService<QuoteService>("QuoteService");
    if (!service) throw new Error("QuoteService not registered");
    return await service.getQuoteByBeneficiary(beneficiary);
  }

  static async getQuoteByQuoteId(quoteId: string): Promise<Quote> {
    const runtime = await agentRuntime.getRuntime();
    const service = runtime.getService<QuoteService>("QuoteService");
    if (!service) throw new Error("QuoteService not registered");
    return await service.getQuoteByQuoteId(quoteId);
  }

  static async updateQuoteStatus(
    quoteId: string,
    status: QuoteStatus,
    data: {
      offerId: string;
      transactionHash: string;
      blockNumber: number;
      rejectionReason: string;
      approvalNote: string;
    },
  ): Promise<Quote> {
    const runtime = await agentRuntime.getRuntime();
    const service = runtime.getService<QuoteService>("QuoteService");
    if (!service) throw new Error("QuoteService not registered");
    return await service.updateQuoteStatus(quoteId, status, data);
  }

  static async updateQuoteExecution(
    quoteId: string,
    data: {
      tokenAmount: string;
      totalUsd: number;
      discountUsd: number;
      discountedUsd: number;
      paymentCurrency: PaymentCurrency;
      paymentAmount: string;
      offerId: string;
      transactionHash: string;
      blockNumber: number;
    },
  ): Promise<Quote> {
    const runtime = await agentRuntime.getRuntime();
    const service = runtime.getService<QuoteService>("QuoteService");
    if (!service) throw new Error("QuoteService not registered");
    return await service.updateQuoteExecution(quoteId, data);
  }

  static async setQuoteBeneficiary(
    quoteId: string,
    beneficiary: string,
  ): Promise<Quote> {
    const runtime = await agentRuntime.getRuntime();
    const service = runtime.getService<QuoteService>("QuoteService");
    if (!service) throw new Error("QuoteService not registered");
    return await service.setQuoteBeneficiary(quoteId, beneficiary);
  }

  static async getUserQuoteHistory(
    entityId: string,
    limit: number,
  ): Promise<Quote[]> {
    const runtime = await agentRuntime.getRuntime();
    const service = runtime.getService<QuoteService>("QuoteService");
    if (!service) throw new Error("QuoteService not registered");
    return await service.getUserQuoteHistory(entityId, limit);
  }

  static async verifyQuoteSignature(quote: Quote): Promise<boolean> {
    const runtime = await agentRuntime.getRuntime();
    const service = runtime.getService<QuoteService>("QuoteService");
    if (!service) throw new Error("QuoteService not registered");
    return service.verifyQuoteSignature(quote);
  }
}
export class DealCompletionService {
  static async recordDealCompletion(data: {
    entityId: string;
    walletAddress: string;
    quoteId: string;
    transactionHash: string;
    offerId: string;
    blockNumber: number;
    volumeUsd: number;
    savedUsd: number;
  }): Promise<void> {
    await QuoteDB.updateQuoteStatus(data.quoteId, "executed", {
      offerId: data.offerId,
      transactionHash: data.transactionHash,
      blockNumber: data.blockNumber,
      rejectionReason: "",
      approvalNote: "",
    });
  }

  static async generateShareData(quoteId: string) {
    const quote = await QuoteDB.getQuoteByQuoteId(quoteId);
    return {
      quote,
    };
  }
}

export class TokenDB {
  static async createToken(
    data: Omit<Token, "id" | "createdAt" | "updatedAt">,
  ): Promise<Token> {
    const runtime = await agentRuntime.getRuntime();
    const tokenId = `token-${data.chain}-${data.contractAddress.toLowerCase()}`;

    const existing = await runtime.getCache<Token>(`token:${tokenId}`);
    if (existing) {
      return existing;
    }

    const token: Token = {
      ...data,
      id: tokenId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await runtime.setCache(`token:${tokenId}`, token);
    const allTokens = (await runtime.getCache<string[]>("all_tokens")) ?? [];
    if (!allTokens.includes(tokenId)) {
      allTokens.push(tokenId);
      await runtime.setCache("all_tokens", allTokens);
    }
    return token;
  }

  static async getToken(tokenId: string): Promise<Token> {
    const runtime = await agentRuntime.getRuntime();
    const token = await runtime.getCache<Token>(`token:${tokenId}`);
    if (!token) throw new Error(`Token ${tokenId} not found`);
    return token;
  }

  static async getAllTokens(filters?: {
    chain?: Chain;
    isActive?: boolean;
  }): Promise<Token[]> {
    const runtime = await agentRuntime.getRuntime();
    const allTokenIds = (await runtime.getCache<string[]>("all_tokens")) ?? [];
    const tokens = await Promise.all(
      allTokenIds.map((id) => runtime.getCache<Token>(`token:${id}`)),
    );
    let result = tokens.filter((t): t is Token => t !== null);
    if (filters?.chain)
      result = result.filter((t) => t.chain === filters.chain);
    if (filters?.isActive !== undefined)
      result = result.filter((t) => t.isActive === filters.isActive);
    return result;
  }

  static async updateToken(
    tokenId: string,
    updates: Partial<Token>,
  ): Promise<Token> {
    const runtime = await agentRuntime.getRuntime();
    const token = await runtime.getCache<Token>(`token:${tokenId}`);
    if (!token) throw new Error(`Token ${tokenId} not found`);
    const updated = { ...token, ...updates, updatedAt: Date.now() };
    await runtime.setCache(`token:${tokenId}`, updated);
    return updated;
  }
}

export class MarketDataDB {
  static async setMarketData(data: TokenMarketData): Promise<void> {
    const runtime = await agentRuntime.getRuntime();
    await runtime.setCache(`market_data:${data.tokenId}`, data);
  }

  static async getMarketData(tokenId: string): Promise<TokenMarketData | null> {
    const runtime = await agentRuntime.getRuntime();
    return await runtime.getCache<TokenMarketData>(`market_data:${tokenId}`);
  }
}

export class ConsignmentDB {
  static async createConsignment(
    data: Omit<OTCConsignment, "id" | "createdAt" | "updatedAt">,
  ): Promise<OTCConsignment> {
    const runtime = await agentRuntime.getRuntime();
    const { v4: uuidv4 } = await import("uuid");
    const consignmentId = uuidv4();
    const consignment: OTCConsignment = {
      ...data,
      id: consignmentId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await runtime.setCache(`consignment:${consignmentId}`, consignment);
    const allConsignments =
      (await runtime.getCache<string[]>("all_consignments")) ?? [];
    allConsignments.push(consignmentId);
    await runtime.setCache("all_consignments", allConsignments);
    const tokenConsignments =
      (await runtime.getCache<string[]>(
        `token_consignments:${data.tokenId}`,
      )) ?? [];
    tokenConsignments.push(consignmentId);
    await runtime.setCache(
      `token_consignments:${data.tokenId}`,
      tokenConsignments,
    );
    const consignerConsignments =
      (await runtime.getCache<string[]>(
        `consigner_consignments:${data.consignerAddress}`,
      )) ?? [];
    consignerConsignments.push(consignmentId);
    await runtime.setCache(
      `consigner_consignments:${data.consignerAddress}`,
      consignerConsignments,
    );
    return consignment;
  }

  static async getConsignment(consignmentId: string): Promise<OTCConsignment> {
    const runtime = await agentRuntime.getRuntime();
    const consignment = await runtime.getCache<OTCConsignment>(
      `consignment:${consignmentId}`,
    );
    if (!consignment) throw new Error(`Consignment ${consignmentId} not found`);
    return consignment;
  }

  static async updateConsignment(
    consignmentId: string,
    updates: Partial<OTCConsignment>,
  ): Promise<OTCConsignment> {
    const runtime = await agentRuntime.getRuntime();
    const consignment = await runtime.getCache<OTCConsignment>(
      `consignment:${consignmentId}`,
    );
    if (!consignment) throw new Error(`Consignment ${consignmentId} not found`);
    const updated = { ...consignment, ...updates, updatedAt: Date.now() };
    await runtime.setCache(`consignment:${consignmentId}`, updated);
    return updated;
  }

  static async getConsignmentsByToken(
    tokenId: string,
  ): Promise<OTCConsignment[]> {
    const runtime = await agentRuntime.getRuntime();
    const consignmentIds =
      (await runtime.getCache<string[]>(`token_consignments:${tokenId}`)) ?? [];
    const consignments = await Promise.all(
      consignmentIds.map((id) =>
        runtime.getCache<OTCConsignment>(`consignment:${id}`),
      ),
    );
    return consignments.filter(
      (c): c is OTCConsignment => c !== null && c.status === "active",
    );
  }

  static async getConsignmentsByConsigner(
    consignerAddress: string,
  ): Promise<OTCConsignment[]> {
    const runtime = await agentRuntime.getRuntime();
    const consignmentIds =
      (await runtime.getCache<string[]>(
        `consigner_consignments:${consignerAddress}`,
      )) ?? [];
    const consignments = await Promise.all(
      consignmentIds.map((id) =>
        runtime.getCache<OTCConsignment>(`consignment:${id}`),
      ),
    );
    return consignments.filter((c): c is OTCConsignment => c !== null);
  }

  static async getAllConsignments(filters?: {
    chain?: Chain;
    tokenId?: string;
    isNegotiable?: boolean;
  }): Promise<OTCConsignment[]> {
    const runtime = await agentRuntime.getRuntime();
    const allConsignmentIds =
      (await runtime.getCache<string[]>("all_consignments")) ?? [];
    const consignments = await Promise.all(
      allConsignmentIds.map((id) =>
        runtime.getCache<OTCConsignment>(`consignment:${id}`),
      ),
    );
    let result = consignments.filter(
      (c): c is OTCConsignment => c !== null && c.status === "active",
    );
    if (filters?.chain)
      result = result.filter((c) => c.chain === filters.chain);
    if (filters?.tokenId)
      result = result.filter((c) => c.tokenId === filters.tokenId);
    if (filters?.isNegotiable !== undefined)
      result = result.filter((c) => c.isNegotiable === filters.isNegotiable);
    return result;
  }
}

export class ConsignmentDealDB {
  static async createDeal(
    data: Omit<ConsignmentDeal, "id">,
  ): Promise<ConsignmentDeal> {
    const runtime = await agentRuntime.getRuntime();
    const { v4: uuidv4 } = await import("uuid");
    const dealId = uuidv4();
    const deal: ConsignmentDeal = {
      ...data,
      id: dealId,
    };
    await runtime.setCache(`consignment_deal:${dealId}`, deal);
    const consignmentDeals =
      (await runtime.getCache<string[]>(
        `consignment_deals:${data.consignmentId}`,
      )) ?? [];
    consignmentDeals.push(dealId);
    await runtime.setCache(
      `consignment_deals:${data.consignmentId}`,
      consignmentDeals,
    );
    return deal;
  }

  static async getDealsByConsignment(
    consignmentId: string,
  ): Promise<ConsignmentDeal[]> {
    const runtime = await agentRuntime.getRuntime();
    const dealIds =
      (await runtime.getCache<string[]>(
        `consignment_deals:${consignmentId}`,
      )) ?? [];
    const deals = await Promise.all(
      dealIds.map((id) =>
        runtime.getCache<ConsignmentDeal>(`consignment_deal:${id}`),
      ),
    );
    return deals.filter((d): d is ConsignmentDeal => d !== null);
  }
}
