import { useEffect, useState, useCallback, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface Notification {
  id: string;
  type: "offerApproved" | "dealCompleted" | "quoteExpired" | "quoteUpdate";
  message: string;
  data?: any;
  timestamp: string;
  read: boolean;
}

export function useNotifications(userId?: string) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const router = useRouter();
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;

  // Define notification handlers
  const handleOfferApproved = useCallback(
    (data: any) => {
      const notification: Notification = {
        id: `approved-${Date.now()}`,
        type: "offerApproved",
        message: data.message || "✅ Your otc offer has been approved!",
        data,
        timestamp: data.timestamp || new Date().toISOString(),
        read: false,
      };

      setNotifications((prev) => [notification, ...prev]);

      // Show toast with action
      toast.success(notification.message, {
        duration: 10000,
        action: {
          label: "Complete Payment",
          onClick: () => {
            // Navigate to payment completion
            if (data.offerId) {
              router.push(`/otc/fulfill/${data.offerId}`);
            }
          },
        },
      });
    },
    [router],
  );

  const handleDealCompleted = useCallback(
    (data: any) => {
      const notification: Notification = {
        id: `completed-${Date.now()}`,
        type: "dealCompleted",
        message: data.message || "🎉 Your ElizaOS deal is complete!",
        data,
        timestamp: data.timestamp || new Date().toISOString(),
        read: false,
      };

      setNotifications((prev) => [notification, ...prev]);

      // Show celebratory toast
      toast.success(notification.message, {
        duration: 15000,
        description: data.dealSummary
          ? `You saved $${data.dealSummary.savings} on ${data.dealSummary.tokenAmount} ElizaOS!`
          : undefined,
        action: {
          label: "View Details",
          onClick: () => {
            // Navigate to deal completion page
            if (data.quoteId) {
              router.push(`/deal/complete/${data.quoteId}`);
            }
          },
        },
      });

      // Trigger confetti or other celebration effects
      triggerCelebration();
    },
    [router],
  );

  const handleQuoteExpired = useCallback(
    (data: any) => {
      const notification: Notification = {
        id: `expired-${Date.now()}`,
        type: "quoteExpired",
        message: data.message || "⏰ Your quote has expired",
        data,
        timestamp: data.timestamp || new Date().toISOString(),
        read: false,
      };

      setNotifications((prev) => [notification, ...prev]);

      toast.warning(notification.message, {
        duration: 5000,
        action: {
          label: "Create New Quote",
          onClick: () => {
            router.push("/");
          },
        },
      });
    },
    [router],
  );

  const handleQuoteUpdate = useCallback((data: any) => {
    const notification: Notification = {
      id: `update-${Date.now()}`,
      type: "quoteUpdate",
      message: data.message || "📊 Your quote has been updated",
      data,
      timestamp: data.timestamp || new Date().toISOString(),
      read: false,
    };

    setNotifications((prev) => [notification, ...prev]);

    toast.info(notification.message, {
      duration: 5000,
    });
  }, []);

  // Initialize socket connection
  useEffect(() => {
    if (!userId) return;

    const socketUrl =
      process.env.NEXT_PUBLIC_SOCKET_URL || window.location.origin;
    const newSocket = io(socketUrl, {
      path: "/api/socket",
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: maxReconnectAttempts,
      reconnectionDelay: 1000,
    });

    // Connection handlers
    newSocket.on("connect", () => {
      console.log("[Notifications] Connected to notification service");
      setConnected(true);
      reconnectAttempts.current = 0;

      // Identify user
      newSocket.emit("identify", { userId });
    });

    newSocket.on("disconnect", () => {
      console.log("[Notifications] Disconnected from notification service");
      setConnected(false);
    });

    newSocket.on("connect_error", (error) => {
      console.error("[Notifications] Connection error:", error);
      reconnectAttempts.current++;

      if (reconnectAttempts.current >= maxReconnectAttempts) {
        toast.error("Unable to connect to notification service");
      }
    });

    // Notification handlers
    newSocket.on("offerApproved", (data) => {
      handleOfferApproved(data);
    });

    newSocket.on("dealCompleted", (data) => {
      handleDealCompleted(data);
    });

    newSocket.on("quoteExpired", (data) => {
      handleQuoteExpired(data);
    });

    newSocket.on("quoteUpdate", (data) => {
      handleQuoteUpdate(data);
    });

    setSocket(newSocket);

    // Cleanup
    return () => {
      newSocket.disconnect();
    };
  }, [
    userId,
    handleOfferApproved,
    handleDealCompleted,
    handleQuoteExpired,
    handleQuoteUpdate,
  ]);

  const markAsRead = useCallback((notificationId: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n)),
    );
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  const sendNotification = useCallback(
    (event: string, data: any) => {
      if (socket && connected) {
        socket.emit(event, data);
      }
    },
    [socket, connected],
  );

  return {
    connected,
    notifications,
    unreadCount: notifications.filter((n) => !n.read).length,
    markAsRead,
    markAllAsRead,
    clearNotifications,
    sendNotification,
  };
}

// Celebration effects
function triggerCelebration() {
  // Check if confetti library is available
  if (typeof window !== "undefined" && (window as any).confetti) {
    const confetti = (window as any).confetti;

    // Trigger confetti animation
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
      colors: ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6"],
    });

    // Multiple bursts for extra celebration
    setTimeout(() => {
      confetti({
        particleCount: 50,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
      });
    }, 250);

    setTimeout(() => {
      confetti({
        particleCount: 50,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
      });
    }, 400);
  }
}
