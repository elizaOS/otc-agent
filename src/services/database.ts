import { db, quotes, Quote, NewQuote, userSessions } from "@/db";
import { eq, and, desc, sql, gte } from "drizzle-orm";
import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";

// Quote service functions
export class QuoteService {
  /**
   * Create a new quote with signature
   */
  static async createQuote(data: {
    userId: string;
    beneficiary?: string;
    tokenAmount: string;
    discountBps: number;
    apr: number;
    lockupMonths: number;
    paymentCurrency: string;
    priceUsdPerToken: number;
    totalUsd: number;
    discountUsd: number;
    discountedUsd: number;
    paymentAmount: string;
    expiresAt: Date;
  }) {
    const quoteId = this.generateQuoteId();
    const lockupDays = data.lockupMonths * 30; // Approximate

    // Generate signature for verification
    const signature = this.generateQuoteSignature({
      quoteId,
      userId: data.userId,
      beneficiary: data.beneficiary,
      tokenAmount: data.tokenAmount,
      discountBps: data.discountBps,
      lockupMonths: data.lockupMonths,
    });

    const newQuote: NewQuote = {
      id: uuidv4(),
      quoteId,
      userId: data.userId,
      beneficiary: data.beneficiary?.toLowerCase(),
      tokenAmount: data.tokenAmount,
      discountBps: data.discountBps,
      apr: data.apr,
      lockupMonths: data.lockupMonths,
      lockupDays,
      paymentCurrency: data.paymentCurrency,
      priceUsdPerToken: data.priceUsdPerToken,
      totalUsd: data.totalUsd,
      discountUsd: data.discountUsd,
      discountedUsd: data.discountedUsd,
      paymentAmount: data.paymentAmount,
      signature,
      expiresAt: data.expiresAt,
      status: "active",
    };

    await db.insert(quotes).values(newQuote);

    // Return the created quote
    const [created] = await db
      .select()
      .from(quotes)
      .where(eq(quotes.quoteId, quoteId));
    return created;
  }

  /**
   * Get active quotes for verification
   */
  static async getActiveQuotes() {
    const now = new Date();
    return await db
      .select()
      .from(quotes)
      .where(and(eq(quotes.status, "active"), gte(quotes.expiresAt, now)))
      .orderBy(desc(quotes.createdAt));
  }

  /**
   * Get quote by beneficiary address for verification
   */
  static async getQuoteByBeneficiary(beneficiary: string) {
    const now = new Date();
    const results = await db
      .select()
      .from(quotes)
      .where(
        and(
          eq(quotes.beneficiary, beneficiary.toLowerCase()),
          eq(quotes.status, "active"),
          gte(quotes.expiresAt, now),
        ),
      )
      .orderBy(desc(quotes.createdAt))
      .limit(1);

    return results[0] || null;
  }

  /**
   * Verify quote signature
   */
  static verifyQuoteSignature(quote: Quote): boolean {
    const expectedSignature = this.generateQuoteSignature({
      quoteId: quote.quoteId,
      userId: quote.userId,
      beneficiary: quote.beneficiary,
      tokenAmount: quote.tokenAmount,
      discountBps: quote.discountBps,
      lockupMonths: quote.lockupMonths,
    });

    return quote.signature === expectedSignature;
  }

  /**
   * Update quote status
   */
  static async updateQuoteStatus(
    quoteId: string,
    status: string,
    additionalData?: {
      offerId?: string;
      transactionHash?: string;
      blockNumber?: number;
      rejectionReason?: string;
      approvalNote?: string;
    },
  ) {
    const updateData: any = { status };

    if (status === "executed") {
      updateData.executedAt = new Date();
      if (additionalData?.offerId) updateData.offerId = additionalData.offerId;
      if (additionalData?.transactionHash)
        updateData.transactionHash = additionalData.transactionHash;
      if (additionalData?.blockNumber)
        updateData.blockNumber = additionalData.blockNumber;
    } else if (status === "rejected") {
      updateData.rejectedAt = new Date();
      if (additionalData?.rejectionReason)
        updateData.rejectionReason = additionalData.rejectionReason;
    } else if (status === "approved") {
      updateData.approvedAt = new Date();
      if (additionalData?.approvalNote)
        updateData.approvalNote = additionalData.approvalNote;
    }

    await db.update(quotes).set(updateData).where(eq(quotes.quoteId, quoteId));

    const [updated] = await db
      .select()
      .from(quotes)
      .where(eq(quotes.quoteId, quoteId));
    return updated;
  }

  /**
   * Get a quote by its public quoteId
   */
  static async getQuoteByQuoteId(quoteId: string) {
    const [existing] = await db
      .select()
      .from(quotes)
      .where(eq(quotes.quoteId, quoteId));
    return existing || null;
  }

  /**
   * Update executed details for a quote once the user chooses amount and completes
   */
  static async updateQuoteExecution(
    quoteId: string,
    data: {
      tokenAmount: string;
      totalUsd: number;
      discountUsd: number;
      discountedUsd: number;
      paymentCurrency?: string;
      paymentAmount?: string;
      offerId?: string;
      transactionHash?: string;
      blockNumber?: number;
    },
  ) {
    const updateData: any = {
      tokenAmount: data.tokenAmount,
      totalUsd: data.totalUsd,
      discountUsd: data.discountUsd,
      discountedUsd: data.discountedUsd,
      status: "executed",
      executedAt: new Date(),
    };

    if (data.paymentCurrency) updateData.paymentCurrency = data.paymentCurrency;
    if (data.paymentAmount !== undefined)
      updateData.paymentAmount = data.paymentAmount;
    if (data.offerId) updateData.offerId = data.offerId;
    if (data.transactionHash) updateData.transactionHash = data.transactionHash;
    if (typeof data.blockNumber === "number")
      updateData.blockNumber = data.blockNumber;

    await db.update(quotes).set(updateData).where(eq(quotes.quoteId, quoteId));

    const [updated] = await db
      .select()
      .from(quotes)
      .where(eq(quotes.quoteId, quoteId));
    return updated;
  }

  /**
   * Set or update the beneficiary (wallet address) on a quote and refresh its signature
   */
  static async setQuoteBeneficiary(quoteId: string, beneficiary: string) {
    // Fetch existing quote
    const [existing] = await db
      .select()
      .from(quotes)
      .where(eq(quotes.quoteId, quoteId));
    if (!existing) {
      throw new Error(`Quote not found: ${quoteId}`);
    }

    const normalized = (beneficiary || "").toLowerCase();

    // Recompute signature with beneficiary included
    const newSignature = this.generateQuoteSignature({
      quoteId: existing.quoteId,
      userId: existing.userId,
      beneficiary: normalized,
      tokenAmount: existing.tokenAmount,
      discountBps: existing.discountBps,
      lockupMonths: existing.lockupMonths,
    });

    await db
      .update(quotes)
      .set({ beneficiary: normalized, signature: newSignature })
      .where(eq(quotes.quoteId, quoteId));

    const [updated] = await db
      .select()
      .from(quotes)
      .where(eq(quotes.quoteId, quoteId));
    return updated;
  }

  /**
   * Get user quote history
   */
  static async getUserQuoteHistory(userId: string, limit = 10) {
    return await db
      .select()
      .from(quotes)
      .where(eq(quotes.userId, userId))
      .orderBy(desc(quotes.createdAt))
      .limit(limit);
  }

  /**
   * Generate a unique quote ID
   */
  private static generateQuoteId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `OTC-${timestamp}-${random}`.toUpperCase();
  }

  /**
   * Generate quote signature for verification
   */
  private static generateQuoteSignature(data: any): string {
    const secret = process.env.QUOTE_SIGNATURE_SECRET || "default-secret-key";
    const payload = JSON.stringify(data);
    return crypto.createHmac("sha256", secret).update(payload).digest("hex");
  }
}

// User session management
export class UserSessionService {
  /**
   * Get or create user session
   */
  static async getOrCreateSession(userId: string, walletAddress?: string) {
    const [existing] = await db
      .select()
      .from(userSessions)
      .where(eq(userSessions.userId, userId));

    if (existing) {
      // Check if daily reset is needed
      const now = new Date();
      const resetTime = new Date(existing.dailyResetAt);
      if (now.getTime() > resetTime.getTime() + 24 * 60 * 60 * 1000) {
        await db
          .update(userSessions)
          .set({
            dailyQuoteCount: 0,
            dailyResetAt: now,
            updatedAt: now,
          })
          .where(eq(userSessions.userId, userId));
      }
      return existing;
    }

    // Create new session
    const newSession = {
      id: uuidv4(),
      userId,
      walletAddress,
      quotesCreated: 0,
      dailyQuoteCount: 0,
      dailyResetAt: new Date(),
      totalDeals: 0,
      totalVolumeUsd: 0,
      totalSavedUsd: 0,
    };

    await db.insert(userSessions).values(newSession);
    return newSession;
  }

  /**
   * Check rate limits
   */
  static async checkRateLimit(userId: string): Promise<boolean> {
    const session = await this.getOrCreateSession(userId);
    const MAX_DAILY_QUOTES = 25;
    return session.dailyQuoteCount < MAX_DAILY_QUOTES;
  }

  /**
   * Increment quote counters
   */
  static async incrementQuoteCount(userId: string) {
    const now = new Date();
    await db
      .update(userSessions)
      .set({
        quotesCreated: sql`${userSessions.quotesCreated} + 1`,
        dailyQuoteCount: sql`${userSessions.dailyQuoteCount} + 1`,
        lastQuoteAt: now,
        updatedAt: now,
      })
      .where(eq(userSessions.userId, userId));
  }

  /**
   * Update user stats after deal completion
   */
  static async updateDealStats(
    userId: string,
    volumeUsd: number,
    savedUsd: number,
  ) {
    await db
      .update(userSessions)
      .set({
        totalDeals: sql`${userSessions.totalDeals} + 1`,
        totalVolumeUsd: sql`${userSessions.totalVolumeUsd} + ${volumeUsd}`,
        totalSavedUsd: sql`${userSessions.totalSavedUsd} + ${savedUsd}`,
        updatedAt: new Date(),
      })
      .where(eq(userSessions.userId, userId));
  }
}

// Deal completion service
export class DealCompletionService {
  /**
   * Record a deal completion
   */
  static async recordDealCompletion(data: {
    userId: string;
    quoteId: string;
    transactionHash: string;
    offerId?: string;
    blockNumber?: number;
    volumeUsd: number;
    savedUsd: number;
  }) {
    // Update quote status
    await QuoteService.updateQuoteStatus(data.quoteId, "executed", {
      offerId: data.offerId,
      transactionHash: data.transactionHash,
      blockNumber: data.blockNumber,
    });

    // Update user stats
    await UserSessionService.updateDealStats(
      data.userId,
      data.volumeUsd,
      data.savedUsd,
    );
  }

  /**
   * Increment share count for analytics (placeholder implementation)
   */
  static async incrementShareCount(quoteId: string, platform: string) {
    // TODO: Persist share counts (requires schema change). For now, just log.
    console.log(`[DealCompletionService] Share recorded`, {
      quoteId,
      platform,
    });
    return { success: true };
  }

  /**
   * Generate share card data
   */
  static async generateShareData(quoteId: string) {
    const [quote] = await db
      .select()
      .from(quotes)
      .where(eq(quotes.quoteId, quoteId));

    if (!quote) return null;

    const [session] = await db
      .select()
      .from(userSessions)
      .where(eq(userSessions.userId, quote.userId));

    return {
      quote,
      userStats: session || {
        totalDeals: 0,
        totalVolumeUsd: 0,
        totalSavedUsd: 0,
      },
    };
  }
}

// Export individual services for backwards compatibility
export const quoteService = QuoteService;
export const userSessionService = UserSessionService;
export const dealCompletionService = DealCompletionService;
