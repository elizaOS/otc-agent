// Shared types for OTC Desk plugin - export for external use only

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

export interface UserSessionMemory {
  id: string;
  entityId: string;
  walletAddress: string;
  quotesCreated: number;
  lastQuoteAt: number;
  dailyQuoteCount: number;
  dailyResetAt: number;
  totalDeals: number;
  totalVolumeUsd: number;
  totalSavedUsd: number;
  createdAt: number;
  updatedAt: number;
}
