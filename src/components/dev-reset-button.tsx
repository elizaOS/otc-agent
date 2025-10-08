"use client";

import { useState, useEffect } from "react";
import { Button } from "./button";
import { useDisconnect, useAccount } from "wagmi";
import { useWallet } from "@solana/wallet-adapter-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export function DevResetButton() {
  const [mounted, setMounted] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const { disconnect } = useDisconnect();
  const { address } = useAccount();
  const solWallet = useWallet();
  const queryClient = useQueryClient();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || process.env.NODE_ENV !== "development") {
    return null;
  }

  const handleReset = async () => {
    setIsResetting(true);
    
    toast.info("Resetting development environment...");

    if (address) {
      await disconnect();
    }
    if (solWallet.connected) {
      await solWallet.disconnect();
    }

    localStorage.removeItem("wagmi.store");
    localStorage.removeItem("wagmi.cache");
    localStorage.removeItem("wagmi.recentConnectorId");
    
    queryClient.clear();
    queryClient.invalidateQueries();

    toast.success("Dev environment reset complete. Reloading...");

    setTimeout(() => {
      window.location.reload();
    }, 1000);
  };

  return (
    <Button
      onClick={handleReset}
      disabled={isResetting}
      className="fixed bottom-4 right-4 z-50 !bg-red-600 hover:!bg-red-700 !text-white !px-3 !py-2 !text-xs shadow-lg border-2 border-red-800"
      title="Reset wallet connection and clear caches (dev only)"
    >
      {isResetting ? "Resetting..." : "🔧 Reset Dev State"}
    </Button>
  );
}

