"use client";

import { useNotificationPolling } from "@/hooks/useNotificationPolling";
import { useState } from "react";

interface NotificationBellProps {
  userId?: string | null;
}

/**
 * Example notification bell component using HTTP polling
 * This replaces real-time socket.io notifications in the serverless architecture
 */
export function NotificationBell({ userId }: NotificationBellProps) {
  const [isOpen, setIsOpen] = useState(false);

  const { notifications, unreadCount, markAsRead, clearAll, isPolling, error } =
    useNotificationPolling({
      userId,
      pollInterval: 3000, // Poll every 3 seconds for more responsive updates
      enabled: !!userId,
    });

  const handleNotificationClick = (notificationId: string) => {
    markAsRead(notificationId);
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "offer_approved":
        return "✅";
      case "deal_completed":
        return "🎉";
      case "error":
        return "❌";
      default:
        return "📢";
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);

    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return date.toLocaleDateString();
  };

  if (!userId) return null;

  return (
    <div className="relative">
      {/* Bell Icon Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        aria-label="Notifications"
      >
        <svg
          className="w-6 h-6 text-gray-600 dark:text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>

        {/* Unread Count Badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}

        {/* Polling Indicator */}
        {isPolling && (
          <span className="absolute bottom-0 right-0 h-2 w-2 bg-green-400 rounded-full animate-pulse" />
        )}
      </button>

      {/* Notification Dropdown */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 max-h-96 bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden z-50">
          {/* Header */}
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              Notifications
            </h3>
            {notifications.length > 0 && (
              <button
                onClick={clearAll}
                className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
              >
                Clear all
              </button>
            )}
          </div>

          {/* Error State */}
          {error && (
            <div className="px-4 py-2 text-sm text-red-600 dark:text-red-400">
              Failed to load notifications
            </div>
          )}

          {/* Notification List */}
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                No notifications yet
              </div>
            ) : (
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={`px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors ${
                      !notification.read ? "bg-blue-50 dark:bg-blue-900/20" : ""
                    }`}
                    onClick={() => handleNotificationClick(notification.id)}
                  >
                    <div className="flex items-start space-x-3">
                      <span className="text-xl">
                        {getNotificationIcon(notification.type)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-900 dark:text-white">
                          {notification.message}
                        </p>

                        {/* Deal Summary for completed deals */}
                        {notification.dealSummary && (
                          <div className="mt-2 text-xs text-gray-600 dark:text-gray-400 space-y-1">
                            <div>
                              Tokens: {notification.dealSummary.tokenAmount}
                            </div>
                            <div>
                              Savings: ${notification.dealSummary.savings}
                            </div>
                            <div>
                              Discount:{" "}
                              {Number(notification.dealSummary.savings) > 0
                                ? "Yes"
                                : "No"}
                            </div>
                            <div>
                              Lockup: {notification.dealSummary.lockupMonths}{" "}
                              months
                            </div>
                          </div>
                        )}

                        {/* Transaction Hash */}
                        {notification.transactionHash && (
                          <a
                            href={`https://etherscan.io/tx/${notification.transactionHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-1 text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 inline-block"
                            onClick={(e) => e.stopPropagation()}
                          >
                            View transaction →
                          </a>
                        )}

                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {formatTimestamp(notification.timestamp)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
