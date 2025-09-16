// Quote history tracking service for ElizaOS OTC desk

export interface QuoteHistoryEntry {
  quoteId: string;
  userId: string;
  tokenAmount: string; // Always ElizaOS
  discountBps: number;
  paymentCurrency: "ETH" | "USDC";
  priceUsdPerToken: number;
  totalUsd: number;
  discountedUsd: number;
  status: "created" | "expired" | "accepted" | "rejected" | "executed";
  createdAt: number;
  expiresAt: number;
  acceptedAt?: number;
  executedAt?: number;
  transactionHash?: string;
  offerId?: number;
  rejectionReason?: string;
}

// In-memory storage (in production, use database)
const quoteHistory = new Map<string, QuoteHistoryEntry[]>();
const MAX_HISTORY_PER_USER = 100;

/**
 * Add a quote to history
 */
export function addQuoteToHistory(entry: QuoteHistoryEntry): void {
  const userHistory = quoteHistory.get(entry.userId) || [];

  // Add to beginning of array (most recent first)
  userHistory.unshift(entry);

  // Limit history size
  if (userHistory.length > MAX_HISTORY_PER_USER) {
    userHistory.splice(MAX_HISTORY_PER_USER);
  }

  quoteHistory.set(entry.userId, userHistory);
}

/**
 * Update quote status in history
 */
export function updateQuoteStatus(
  userId: string,
  quoteId: string,
  update: Partial<
    Pick<
      QuoteHistoryEntry,
      | "status"
      | "acceptedAt"
      | "executedAt"
      | "transactionHash"
      | "offerId"
      | "rejectionReason"
    >
  >,
): boolean {
  const userHistory = quoteHistory.get(userId);
  if (!userHistory) return false;

  const quote = userHistory.find((q) => q.quoteId === quoteId);
  if (!quote) return false;

  // Update the quote
  Object.assign(quote, update);

  // Update timestamp if status changed to accepted or executed
  if (update.status === "accepted" && !quote.acceptedAt) {
    quote.acceptedAt = Date.now();
  }
  if (update.status === "executed" && !quote.executedAt) {
    quote.executedAt = Date.now();
  }

  return true;
}

/**
 * Get user's quote history
 */
export function getUserQuoteHistory(
  userId: string,
  options?: {
    limit?: number;
    status?: QuoteHistoryEntry["status"];
    startDate?: number;
    endDate?: number;
  },
): QuoteHistoryEntry[] {
  const userHistory = quoteHistory.get(userId) || [];

  let filtered = [...userHistory];

  // Apply filters
  if (options?.status) {
    filtered = filtered.filter((q) => q.status === options.status);
  }

  if (options?.startDate) {
    filtered = filtered.filter((q) => q.createdAt >= options.startDate);
  }

  if (options?.endDate) {
    filtered = filtered.filter((q) => q.createdAt <= options.endDate);
  }

  // Apply limit
  if (options?.limit && options.limit < filtered.length) {
    filtered = filtered.slice(0, options.limit);
  }

  return filtered;
}

/**
 * Get quote by ID
 */
export function getQuoteById(
  userId: string,
  quoteId: string,
): QuoteHistoryEntry | null {
  const userHistory = quoteHistory.get(userId) || [];
  return userHistory.find((q) => q.quoteId === quoteId) || null;
}

/**
 * Get statistics for user's ElizaOS quotes
 */
export function getUserQuoteStats(userId: string): {
  total: number;
  accepted: number;
  executed: number;
  expired: number;
  totalVolumeUsd: number;
  totalSavedUsd: number;
  averageDiscountBps: number;
  totalElizaPurchased: number;
  lastQuoteDate: number | null;
} {
  const userHistory = quoteHistory.get(userId) || [];

  if (userHistory.length === 0) {
    return {
      total: 0,
      accepted: 0,
      executed: 0,
      expired: 0,
      totalVolumeUsd: 0,
      totalSavedUsd: 0,
      averageDiscountBps: 0,
      totalElizaPurchased: 0,
      lastQuoteDate: null,
    };
  }

  const stats = {
    total: userHistory.length,
    accepted: 0,
    executed: 0,
    expired: 0,
    totalVolumeUsd: 0,
    totalSavedUsd: 0,
    totalDiscountBps: 0,
    totalElizaPurchased: 0,
    lastQuoteDate: userHistory[0]?.createdAt || null,
  };

  for (const quote of userHistory) {
    if (quote.status === "accepted") stats.accepted++;
    if (quote.status === "executed") {
      stats.executed++;
      stats.totalVolumeUsd += quote.discountedUsd;
      stats.totalSavedUsd += quote.totalUsd - quote.discountedUsd;
      stats.totalElizaPurchased += parseFloat(quote.tokenAmount);
    }
    if (quote.status === "expired") stats.expired++;

    stats.totalDiscountBps += quote.discountBps;
  }

  return {
    total: stats.total,
    accepted: stats.accepted,
    executed: stats.executed,
    expired: stats.expired,
    totalVolumeUsd: stats.totalVolumeUsd,
    totalSavedUsd: stats.totalSavedUsd,
    averageDiscountBps:
      stats.total > 0 ? Math.round(stats.totalDiscountBps / stats.total) : 0,
    totalElizaPurchased: stats.totalElizaPurchased,
    lastQuoteDate: stats.lastQuoteDate,
  };
}

/**
 * Clear all history (for testing)
 */
export function clearAllHistory(): void {
  quoteHistory.clear();
}

/**
 * Clear user's history
 */
export function clearUserHistory(userId: string): void {
  quoteHistory.delete(userId);
}
