// THE Quote Service - unified quote management for Eliza OTC Desk
// Single source of truth registered with runtime.getService("QuoteService")

import type { IAgentRuntime } from "@elizaos/core";
import { Service, ServiceType } from "@elizaos/core";
import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import { walletToEntityId } from "../../entityId";

export type QuoteStatus = "active" | "expired" | "executed" | "rejected" | "approved";
export type PaymentCurrency = "ETH" | "USDC";

export interface QuoteMemory {
  id: string;
  quoteId: string;
  entityId: string;
  beneficiary: string;
  tokenAmount: string;
  discountBps: number;
  apr: number;
  lockupMonths: number;
  lockupDays: number;
  paymentCurrency: PaymentCurrency;
  // Price is determined by Chainlink oracle on-chain, not stored in quote
  totalUsd: number;
  discountUsd: number;
  discountedUsd: number;
  paymentAmount: string;
  status: QuoteStatus;
  signature: string;
  createdAt: number;
  executedAt: number;
  rejectedAt: number;
  approvedAt: number;
  offerId: string;
  transactionHash: string;
  blockNumber: number;
  rejectionReason: string;
  approvalNote: string;
}

const QUOTE_KEY = (quoteId: string) => `quote:${quoteId}`;
const ENTITY_QUOTES_KEY = (entityId: string) => `entity_quotes:${entityId}`;
const ALL_QUOTES_KEY = "all_quotes";

export class QuoteService extends Service {
  static serviceType = "QuoteService" as any;
  static serviceName = "QuoteService";

  get serviceType(): string {
    return "QuoteService";
  }

  capabilityDescription = "QuoteService";

  constructor(runtime: IAgentRuntime) {
    super();
    this.runtime = runtime;
  }

  async initialize(): Promise<void> {
    console.log("[QuoteService] Initialized - single source of truth for quotes");
    console.log("[QuoteService] Service type:", this.serviceType);
    console.log("[QuoteService] Service name:", QuoteService.serviceName);
  }

  async stop(): Promise<void> {
    // Cleanup if needed
  }

  static async start(runtime: IAgentRuntime): Promise<QuoteService> {
    const service = new QuoteService(runtime);
    await service.initialize();
    return service;
  }

  private async addToIndex(quoteId: string, entityId: string): Promise<void> {
    const allQuotes = (await this.runtime.getCache<string[]>(ALL_QUOTES_KEY)) ?? [];
    if (!allQuotes.includes(quoteId)) {
      allQuotes.push(quoteId);
      await this.runtime.setCache(ALL_QUOTES_KEY, allQuotes);
    }

    const entityQuotes = (await this.runtime.getCache<string[]>(ENTITY_QUOTES_KEY(entityId))) ?? [];
    if (!entityQuotes.includes(quoteId)) {
      entityQuotes.push(quoteId);
      await this.runtime.setCache(ENTITY_QUOTES_KEY(entityId), entityQuotes);
    }
  }

  private generateQuoteId(entityId: string): string {
    // Generate deterministic quote ID from entityId
    // Use a hash of entityId + current day to allow one quote per wallet per day
    const dayTimestamp = Math.floor(Date.now() / (24 * 60 * 60 * 1000));
    const hash = crypto
      .createHash('sha256')
      .update(`${entityId}-${dayTimestamp}`)
      .digest('hex')
      .substring(0, 12)
      .toUpperCase();
    return `OTC-${hash}`;
  }

  private generateQuoteSignature(data: {
    quoteId: string;
    entityId: string;
    beneficiary: string;
    tokenAmount: string;
    discountBps: number;
    lockupMonths: number;
  }): string {
    const secret = process.env.QUOTE_SIGNATURE_SECRET || "dev-secret-DO-NOT-USE-IN-PRODUCTION";
    const payload = JSON.stringify(data);
    return crypto.createHmac("sha256", secret).update(payload).digest("hex");
  }

  async createQuote(data: {
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
  }): Promise<QuoteMemory> {
    const quoteId = this.generateQuoteId(data.entityId);
    const lockupDays = data.lockupMonths * 30;
    const now = Date.now();

    // Check if quote already exists
    const existing = await this.runtime.getCache<QuoteMemory>(QUOTE_KEY(quoteId));
    console.log(`[QuoteService] createQuote - ID: ${quoteId}, Exists: ${!!existing}, Terms: ${data.discountBps}bps/${data.lockupMonths}mo`);

    const signature = this.generateQuoteSignature({
      quoteId,
      entityId: data.entityId,
      beneficiary: data.beneficiary,
      tokenAmount: data.tokenAmount,
      discountBps: data.discountBps,
      lockupMonths: data.lockupMonths,
    });

    const quoteData: QuoteMemory = {
      id: existing?.id || uuidv4(), // Keep same internal ID if updating
      quoteId,
      entityId: data.entityId,
      beneficiary: data.beneficiary.toLowerCase(),
      tokenAmount: data.tokenAmount,
      discountBps: data.discountBps,
      apr: data.apr,
      lockupMonths: data.lockupMonths,
      lockupDays,
      paymentCurrency: data.paymentCurrency,
      totalUsd: data.totalUsd,
      discountUsd: data.discountUsd,
      discountedUsd: data.discountedUsd,
      paymentAmount: data.paymentAmount,
      signature,
      status: "active",
      createdAt: existing?.createdAt || now, // Keep original creation time if updating
      executedAt: 0,
      rejectedAt: 0,
      approvedAt: 0,
      offerId: "",
      transactionHash: "",
      blockNumber: 0,
      rejectionReason: "",
      approvalNote: "",
    };

    await this.runtime.setCache(QUOTE_KEY(quoteId), quoteData);
    await this.addToIndex(quoteId, data.entityId);
    
    console.log(`[QuoteService] ✅ Quote stored: ${quoteId} - ${data.discountBps}bps/${data.lockupMonths}mo`);
    return quoteData;
  }

  async getActiveQuotes(): Promise<QuoteMemory[]> {
    const allQuoteIds = (await this.runtime.getCache<string[]>(ALL_QUOTES_KEY)) ?? [];

    const quotes: QuoteMemory[] = [];
    for (const quoteId of allQuoteIds) {
      const quote = await this.runtime.getCache<QuoteMemory>(QUOTE_KEY(quoteId));
      if (!quote || quote.status !== "active") continue;
      quotes.push(quote);
    }

    return quotes.sort((a, b) => b.createdAt - a.createdAt);
  }

  async getQuoteByBeneficiary(beneficiary: string): Promise<QuoteMemory> {
    const normalized = beneficiary.toLowerCase();
    const allQuoteIds = (await this.runtime.getCache<string[]>(ALL_QUOTES_KEY)) ?? [];

    for (const quoteId of allQuoteIds) {
      const quote = await this.runtime.getCache<QuoteMemory>(QUOTE_KEY(quoteId));
      if (!quote || quote.beneficiary !== normalized || quote.status !== "active") continue;
      return quote;
    }

    throw new Error(`No active quote found for beneficiary: ${beneficiary}`);
  }

  async getUserQuoteHistory(entityId: string, limit: number): Promise<QuoteMemory[]> {
    const entityQuoteIds = (await this.runtime.getCache<string[]>(ENTITY_QUOTES_KEY(entityId))) ?? [];

    const quotes: QuoteMemory[] = [];
    for (const quoteId of entityQuoteIds) {
      const quote = await this.runtime.getCache<QuoteMemory>(QUOTE_KEY(quoteId));
      if (quote) quotes.push(quote);
    }

    return quotes.sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
  }

  async getQuoteByQuoteId(quoteId: string): Promise<QuoteMemory> {
    const quote = await this.runtime.getCache<QuoteMemory>(QUOTE_KEY(quoteId));
    if (!quote) throw new Error(`Quote not found: ${quoteId}`);
    return quote;
  }

  async updateQuoteStatus(
    quoteId: string,
    status: QuoteStatus,
    data: {
      offerId: string;
      transactionHash: string;
      blockNumber: number;
      rejectionReason: string;
      approvalNote: string;
    },
  ): Promise<QuoteMemory> {
    const quote = await this.getQuoteByQuoteId(quoteId);
    const now = Date.now();

    const updatedQuote: QuoteMemory = {
      ...quote,
      status,
      offerId: data.offerId || quote.offerId,
      transactionHash: data.transactionHash || quote.transactionHash,
      blockNumber: data.blockNumber || quote.blockNumber,
      rejectionReason: data.rejectionReason || quote.rejectionReason,
      approvalNote: data.approvalNote || quote.approvalNote,
      executedAt: status === "executed" ? now : quote.executedAt,
      rejectedAt: status === "rejected" ? now : quote.rejectedAt,
      approvedAt: status === "approved" ? now : quote.approvedAt,
    };

    await this.runtime.setCache(QUOTE_KEY(quoteId), updatedQuote);
    return updatedQuote;
  }

  async updateQuoteExecution(
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
  ): Promise<QuoteMemory> {
    const quote = await this.getQuoteByQuoteId(quoteId);

    const updatedQuote: QuoteMemory = {
      ...quote,
      tokenAmount: data.tokenAmount,
      totalUsd: data.totalUsd,
      discountUsd: data.discountUsd,
      discountedUsd: data.discountedUsd,
      paymentCurrency: data.paymentCurrency,
      paymentAmount: data.paymentAmount,
      offerId: data.offerId,
      transactionHash: data.transactionHash,
      blockNumber: data.blockNumber,
      status: "executed",
      executedAt: Date.now(),
    };

    await this.runtime.setCache(QUOTE_KEY(quoteId), updatedQuote);
    return updatedQuote;
  }

  async setQuoteBeneficiary(quoteId: string, beneficiary: string): Promise<QuoteMemory> {
    const quote = await this.getQuoteByQuoteId(quoteId);
    const normalized = beneficiary.toLowerCase();

    const newSignature = this.generateQuoteSignature({
      quoteId: quote.quoteId,
      entityId: quote.entityId,
      beneficiary: normalized,
      tokenAmount: quote.tokenAmount,
      discountBps: quote.discountBps,
      lockupMonths: quote.lockupMonths,
    });

    const updatedQuote: QuoteMemory = {
      ...quote,
      beneficiary: normalized,
      signature: newSignature,
    };

    await this.runtime.setCache(QUOTE_KEY(quoteId), updatedQuote);
    return updatedQuote;
  }

  verifyQuoteSignature(quote: QuoteMemory): boolean {
    const expectedSignature = this.generateQuoteSignature({
      quoteId: quote.quoteId,
      entityId: quote.entityId,
      beneficiary: quote.beneficiary,
      tokenAmount: quote.tokenAmount,
      discountBps: quote.discountBps,
      lockupMonths: quote.lockupMonths,
    });

    return quote.signature === expectedSignature;
  }

  // Helper: Get latest active quote by wallet address
  async getQuoteByWallet(walletAddress: string): Promise<QuoteMemory | undefined> {
    const entityId = walletToEntityId(walletAddress);
    const quotes = await this.getUserQuoteHistory(entityId, 100);
    // Return the most recent ACTIVE quote only
    return quotes.find((q) => q.entityId === entityId && q.status === "active");
  }

  // Helper: Expire all active quotes for a user (called before creating new one)
  async expireUserQuotes(walletAddress: string): Promise<void> {
    const entityId = walletToEntityId(walletAddress);
    const active = await this.getActiveQuotes();
    const userQuotes = active.filter((q) => q.entityId === entityId);
    
    console.log(`[QuoteService] Expiring ${userQuotes.length} quotes for ${walletAddress}`);
    
    for (const quote of userQuotes) {
      console.log(`[QuoteService] Expiring quote: ${quote.quoteId} (${quote.discountBps}bps/${quote.lockupMonths}mo)`);
      await this.updateQuoteStatus(quote.quoteId, "expired", {
        offerId: "",
        transactionHash: "",
        blockNumber: 0,
        rejectionReason: "Replaced by new quote",
        approvalNote: "",
      });
    }
  }
}

// Helper to get service from runtime
export function getQuoteService(runtime: IAgentRuntime): QuoteService {
  return runtime.getService<QuoteService>("QuoteService");
}

export default QuoteService;