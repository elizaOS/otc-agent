// WebSocket notification service for ElizaOS OTC desk quote updates

import { EventEmitter } from "events";
import { QuoteHistoryEntry } from "./quoteHistory";

export type NotificationType =
  | "quote_created"
  | "quote_accepted"
  | "quote_expired"
  | "quote_executed"
  | "quote_approved"
  | "quote_rejected"
  | "eliza_price_update";

export interface QuoteNotification {
  type: NotificationType;
  userId: string;
  timestamp: number;
  data: {
    quoteId?: string;
    quote?: Partial<QuoteHistoryEntry>;
    message?: string;
    oldPrice?: number;
    newPrice?: number;
    priceChange?: number;
  };
}

class NotificationService extends EventEmitter {
  private userSubscriptions = new Map<string, Set<NotificationType>>();

  /**
   * Subscribe a user to specific notification types
   */
  subscribe(userId: string, types: NotificationType[]): void {
    const existing = this.userSubscriptions.get(userId) || new Set();
    types.forEach((type) => existing.add(type));
    this.userSubscriptions.set(userId, existing);
  }

  /**
   * Unsubscribe a user from specific notification types
   */
  unsubscribe(userId: string, types?: NotificationType[]): void {
    if (!types) {
      // Unsubscribe from all
      this.userSubscriptions.delete(userId);
      return;
    }

    const existing = this.userSubscriptions.get(userId);
    if (existing) {
      types.forEach((type) => existing.delete(type));
      if (existing.size === 0) {
        this.userSubscriptions.delete(userId);
      }
    }
  }

  /**
   * Check if user is subscribed to a notification type
   */
  isSubscribed(userId: string, type: NotificationType): boolean {
    const subscriptions = this.userSubscriptions.get(userId);
    return subscriptions?.has(type) || false;
  }

  /**
   * Send notification to user
   */
  notify(notification: QuoteNotification): void {
    // Check if user is subscribed to this type
    if (!this.isSubscribed(notification.userId, notification.type)) {
      return;
    }

    // Emit notification event
    this.emit("notification", notification);

    // Emit user-specific event
    this.emit(`user:${notification.userId}`, notification);

    // Log notification
    console.log(
      `[Notification] ${notification.type} for user ${notification.userId}:`,
      notification.data,
    );
  }

  /**
   * Broadcast notification to all subscribed users
   */
  broadcast(type: NotificationType, data: QuoteNotification["data"]): void {
    const timestamp = Date.now();

    for (const [userId, subscriptions] of this.userSubscriptions.entries()) {
      if (subscriptions.has(type)) {
        this.notify({
          type,
          userId,
          timestamp,
          data,
        });
      }
    }
  }

  /**
   * Helper methods for specific notification types
   */

  notifyQuoteCreated(userId: string, quote: Partial<QuoteHistoryEntry>): void {
    this.notify({
      type: "quote_created",
      userId,
      timestamp: Date.now(),
      data: {
        quoteId: quote.quoteId,
        quote,
        message: `New ElizaOS quote created: ${quote.tokenAmount} ElizaOS at ${(quote.discountBps || 0) / 100}% discount`,
      },
    });
  }

  notifyQuoteAccepted(userId: string, quoteId: string): void {
    this.notify({
      type: "quote_accepted",
      userId,
      timestamp: Date.now(),
      data: {
        quoteId,
        message: `Quote ${quoteId} has been accepted and is pending execution`,
      },
    });
  }

  notifyQuoteExpired(userId: string, quoteId: string): void {
    this.notify({
      type: "quote_expired",
      userId,
      timestamp: Date.now(),
      data: {
        quoteId,
        message: `Quote ${quoteId} has expired`,
      },
    });
  }

  notifyQuoteExecuted(
    userId: string,
    quoteId: string,
    transactionHash: string,
  ): void {
    this.notify({
      type: "quote_executed",
      userId,
      timestamp: Date.now(),
      data: {
        quoteId,
        message: `Quote ${quoteId} has been executed. Transaction: ${transactionHash}`,
      },
    });
  }

  notifyQuoteApproved(userId: string, quoteId: string, offerId: number): void {
    this.notify({
      type: "quote_approved",
      userId,
      timestamp: Date.now(),
      data: {
        quoteId,
        message: `Quote ${quoteId} has been approved. Offer ID: ${offerId}`,
      },
    });
  }

  notifyQuoteRejected(userId: string, quoteId: string, reason: string): void {
    this.notify({
      type: "quote_rejected",
      userId,
      timestamp: Date.now(),
      data: {
        quoteId,
        message: `Quote ${quoteId} has been rejected: ${reason}`,
      },
    });
  }

  notifyElizaPriceUpdate(oldPrice: number, newPrice: number): void {
    const priceChange = ((newPrice - oldPrice) / oldPrice) * 100;

    this.broadcast("eliza_price_update", {
      oldPrice,
      newPrice,
      priceChange,
      message: `ElizaOS price updated: $${oldPrice.toFixed(8)} → $${newPrice.toFixed(8)} (${priceChange >= 0 ? "+" : ""}${priceChange.toFixed(2)}%)`,
    });
  }
}

// Export singleton instance
export const notificationService = new NotificationService();

// Helper function to format notification for display
export function formatNotification(notification: QuoteNotification): string {
  const { type, data } = notification;

  switch (type) {
    case "quote_created":
      return `✅ Quote created: ${data.quote?.tokenAmount} ElizaOS at ${((data.quote?.discountBps || 0) / 100).toFixed(2)}% discount`;

    case "quote_accepted":
      return `🎯 Quote ${data.quoteId} accepted - pending execution`;

    case "quote_expired":
      return `⏰ Quote ${data.quoteId} has expired`;

    case "quote_executed":
      return `💎 Quote ${data.quoteId} executed successfully!`;

    case "quote_approved":
      return `✅ Quote ${data.quoteId} approved by administrator`;

    case "quote_rejected":
      return `❌ Quote ${data.quoteId} rejected: ${data.message}`;

    case "eliza_price_update":
      return data.message || `📊 ElizaOS price update`;

    default:
      return data.message || "Quote update";
  }
}
