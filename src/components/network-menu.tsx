"use client";

import { useState } from "react";
import { useMultiWallet } from "@/components/multiwallet";
import { EVMLogo } from "@/components/icons/index";
import { EVMChainSelectorModal } from "@/components/evm-chain-selector-modal";
import { toast } from "sonner";

/**
 * Network Selection Menu
 * Shows EVM (Base, BSC, Jeju) and Solana as peer options - Privy handles all wallet types
 */
export function NetworkMenu() {
  const {
    activeFamily,
    setActiveFamily,
    isPhantomInstalled,
    connectSolanaWallet,
  } = useMultiWallet();
  const [showEVMChainSelector, setShowEVMChainSelector] = useState(false);

  const handleNetworkSwitch = async (family: "evm" | "solana") => {
    // Don't switch if already on this network
    if (family === activeFamily) return;

    console.log(`[NetworkMenu] Switching from ${activeFamily} to ${family}`);

    // Then trigger connection for the new network
    if (family === "solana") {
      setActiveFamily(family);
      if (!isPhantomInstalled) {
        toast.info("Solana Wallet Needed", {
          description: "Install Phantom or Solflare to use Solana.",
          duration: 6000,
        });
      }
      connectSolanaWallet();
    } else {
      setShowEVMChainSelector(true);
    }
  };

  return (
    <>
      <div className="inline-flex rounded-lg bg-zinc-100 dark:bg-zinc-900 p-1 border border-zinc-200 dark:border-zinc-800">
        {/* EVM Network (Base, BSC, Jeju) */}
        <button
          type="button"
          onClick={() => handleNetworkSwitch("evm")}
          className={`px-3 py-1.5 rounded-md transition-all duration-200 font-medium text-xs whitespace-nowrap flex items-center gap-1.5 ${
            activeFamily === "evm"
              ? "bg-white text-blue-600 dark:bg-zinc-800 dark:text-white shadow-sm"
              : "text-zinc-600 dark:text-zinc-400 hover:bg-white/50 dark:hover:bg-zinc-800/50 hover:text-zinc-900 dark:hover:text-white"
          }`}
          title="EVM Network (Base, BSC, Jeju)"
        >
          <EVMLogo className="w-3.5 h-3.5" />
          <span>EVM</span>
          {activeFamily === "evm" && (
            <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
          )}
        </button>

        {/* Solana Network */}
        <button
          type="button"
          onClick={() => handleNetworkSwitch("solana")}
          className={`px-3 py-1.5 rounded-md transition-all duration-200 font-medium text-xs whitespace-nowrap flex items-center gap-1.5 ${
            activeFamily === "solana"
              ? "bg-gradient-to-r from-[#9945FF] to-[#14F195] text-white shadow-sm"
              : "text-zinc-600 dark:text-zinc-400 hover:bg-white/50 dark:hover:bg-zinc-800/50 hover:text-zinc-900 dark:hover:text-white"
          }`}
          title="Solana Network"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20.45,9.37l-7.72,7.72a1.5,1.5,0,0,1-2.12,0L3.55,10a1.5,1.5,0,0,1,0-2.12L10.61.83a1.5,1.5,0,0,1,2.12,0l7.72,7.72A1.5,1.5,0,0,1,20.45,9.37Z" />
          </svg>
          <span>Solana</span>
          {activeFamily === "solana" && (
            <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
          )}
        </button>
      </div>

      <EVMChainSelectorModal
        isOpen={showEVMChainSelector}
        onClose={() => setShowEVMChainSelector(false)}
      />
    </>
  );
}
