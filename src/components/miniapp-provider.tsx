"use client";

import { useEffect, useState } from "react";
import miniappSdk from "@farcaster/miniapp-sdk";
import { sendWelcomeNotification } from "@/lib/notifications";

export function MiniappProvider({ children }: { children: React.ReactNode }) {
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || isInitialized) return;

    const initMiniapp = async () => {
      try {
        const context = await miniappSdk.context;
        
        if (!context) {
          setIsInitialized(true);
          return;
        }

        // Signal ready
        await miniappSdk.actions.ready();

        // Send welcome notification on first load
        // Note: Neynar handles deduplication
        const userFid = context.user?.fid;
        if (userFid) {
          await sendWelcomeNotification(userFid);
        }

        setIsInitialized(true);
      } catch (error) {
        console.error("Error initializing miniapp:", error);
        setIsInitialized(true);
      }
    };

    initMiniapp();
  }, [isInitialized]);

  return <>{children}</>;
}

