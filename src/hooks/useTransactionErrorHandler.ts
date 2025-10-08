"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useDisconnect, useAccount } from "wagmi";
import { useWallet } from "@solana/wallet-adapter-react";

type TransactionError = Error & {
  message: string;
  cause?: {
    reason?: string;
    code?: string | number;
  };
  details?: string;
  shortMessage?: string;
};

export function useTransactionErrorHandler() {
  const [mounted, setMounted] = useState(false);
  
  useEffect(() => {
    setMounted(true);
  }, []);

  const { disconnect } = useDisconnect();
  const { address } = useAccount();
  const solWallet = useWallet();

  const isNonceError = useCallback((error: TransactionError): boolean => {
    const errorStr = error.message?.toLowerCase() || "";
    const causeStr = error.cause?.reason?.toLowerCase() || "";
    const detailsStr = error.details?.toLowerCase() || "";
    const shortMsg = error.shortMessage?.toLowerCase() || "";
    
    const noncePatterns = [
      "nonce too high",
      "nonce has already been used",
      "invalid nonce",
      "replacement transaction underpriced",
      "transaction nonce is too low",
    ];

    return noncePatterns.some(pattern => 
      errorStr.includes(pattern) || 
      causeStr.includes(pattern) || 
      detailsStr.includes(pattern) ||
      shortMsg.includes(pattern)
    );
  }, []);

  const isUserRejection = useCallback((error: TransactionError): boolean => {
    const errorStr = error.message?.toLowerCase() || "";
    const causeStr = error.cause?.reason?.toLowerCase() || "";
    
    return (
      errorStr.includes("user rejected") ||
      errorStr.includes("user denied") ||
      errorStr.includes("user cancel") ||
      causeStr.includes("user rejected")
    );
  }, []);

  const resetWalletConnection = useCallback(async () => {
    if (!mounted) return;
    
    if (address) {
      await disconnect();
    }
    if (solWallet.connected) {
      await solWallet.disconnect();
    }
    
    if (typeof window !== "undefined") {
      localStorage.removeItem("wagmi.store");
      localStorage.removeItem("wagmi.cache");
      localStorage.removeItem("wagmi.recentConnectorId");
      
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    }
  }, [mounted, address, disconnect, solWallet]);

  const handleTransactionError = useCallback((error: TransactionError): string => {
    if (!mounted) return "Transaction failed";
    
    console.error("[TxError]", error);

    if (isUserRejection(error)) {
      return "Transaction was cancelled";
    }

    if (isNonceError(error)) {
      console.error("[TxError] Nonce error detected - likely chain reset");
      
      if (typeof window !== "undefined") {
        toast.error(
          "Wallet State Out of Sync",
          {
            description: "Your wallet nonce is out of sync with the blockchain. This happens when the local chain is reset.",
            duration: 15000,
            action: {
              label: "Reset Wallet",
              onClick: resetWalletConnection,
            },
          }
        );
      }

      return "Wallet nonce error - please reset your wallet connection using the button above";
    }

    if (error.message?.includes("insufficient funds")) {
      return "Insufficient funds to complete transaction";
    }

    if (error.message?.includes("gas")) {
      return "Transaction failed due to gas estimation error";
    }

    return error.shortMessage || error.message || "Transaction failed";
  }, [mounted, isNonceError, isUserRejection, resetWalletConnection]);

  return {
    handleTransactionError,
    isNonceError,
    isUserRejection,
    resetWalletConnection,
  };
}

