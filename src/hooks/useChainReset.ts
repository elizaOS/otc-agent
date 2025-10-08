"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { usePublicClient, useAccount, useDisconnect } from "wagmi";
import { useWallet } from "@solana/wallet-adapter-react";
import { toast } from "sonner";

type ChainResetState = {
  resetDetected: boolean;
  lastBlockNumber: bigint | null;
  checksEnabled: boolean;
};

export function useChainReset() {
  const [mounted, setMounted] = useState(false);
  
  useEffect(() => {
    setMounted(true);
  }, []);

  const publicClient = usePublicClient();
  const { address } = useAccount();
  const { disconnect } = useDisconnect();
  const solWallet = useWallet();
  
  const [state, setState] = useState<ChainResetState>({
    resetDetected: false,
    lastBlockNumber: null,
    checksEnabled: false,
  });

  const hasShownToast = useRef(false);

  // Enable checks only after mounting and in development
  useEffect(() => {
    if (mounted && typeof window !== "undefined" && process.env.NODE_ENV === "development") {
      setState(prev => ({ ...prev, checksEnabled: true }));
    }
  }, [mounted]);

  const handleChainReset = useCallback(async () => {
    if (hasShownToast.current) return;
    hasShownToast.current = true;

    console.warn("[ChainReset] Local chain reset detected");
    
    toast.error(
      "Chain Reset Detected",
      {
        description: "Local blockchain was reset. Click here to reset your wallet connection.",
        duration: 10000,
        action: {
          label: "Reset Wallet",
          onClick: async () => {
            if (address) {
              await disconnect();
            }
            if (solWallet.connected) {
              await solWallet.disconnect();
            }
            
            localStorage.removeItem("wagmi.store");
            localStorage.removeItem("wagmi.cache");
            localStorage.removeItem("wagmi.recentConnectorId");
            
            setTimeout(() => {
              window.location.reload();
            }, 500);
          },
        },
      }
    );

    setState(prev => ({ ...prev, resetDetected: true }));
  }, [address, disconnect, solWallet]);

  const resetWalletState = useCallback(async () => {
    console.log("[ChainReset] Manually resetting wallet state");
    
    if (address) {
      await disconnect();
    }
    if (solWallet.connected) {
      await solWallet.disconnect();
    }
    
    localStorage.removeItem("wagmi.store");
    localStorage.removeItem("wagmi.cache");
    localStorage.removeItem("wagmi.recentConnectorId");
    
    hasShownToast.current = false;
    setState(prev => ({ ...prev, resetDetected: false, lastBlockNumber: null }));
    
    toast.success("Wallet reset complete");
    
    setTimeout(() => {
      window.location.reload();
    }, 500);
  }, [address, disconnect, solWallet]);

  useEffect(() => {
    if (!mounted || !state.checksEnabled || !publicClient) return;

    const checkInterval = setInterval(async () => {
      try {
        const currentBlock = await publicClient.getBlockNumber();
        
        if (state.lastBlockNumber !== null && currentBlock < state.lastBlockNumber) {
          await handleChainReset();
        }
        
        setState(prev => ({ ...prev, lastBlockNumber: currentBlock }));
      } catch (error) {
        console.warn("[ChainReset] Error checking block number:", error);
      }
    }, 3000);

    return () => clearInterval(checkInterval);
  }, [mounted, state.checksEnabled, state.lastBlockNumber, publicClient, handleChainReset]);

  return {
    resetDetected: state.resetDetected,
    resetWalletState,
    checksEnabled: state.checksEnabled,
  };
}

