// Database service layer using Eliza runtime services

import { ServiceType } from "@elizaos/core";
import { agentRuntime } from "@/lib/agent-runtime";
import type {
  QuoteMemory,
  QuoteStatus,
  PaymentCurrency,
  UserSessionMemory,
} from "@/lib/plugin-otc-desk/types";
import type { UserSessionStorageService } from "@/lib/plugin-otc-desk/services/userSessionStorage";
import type QuoteService from "@/lib/plugin-otc-desk/services/quoteService";

export type Quote = QuoteMemory;
export type UserSession = UserSessionMemory;
export type { QuoteStatus, PaymentCurrency };

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