"use client";

import { useMultiWallet } from "@/components/multiwallet";
import { BaseLogo } from "@/components/icons/index";
import { toast } from "sonner";

/**
 * Network Selection Menu
 * Shows Base and Solana as peer options - Privy handles all wallet types
 */
export function NetworkMenu() {
  const {
    activeFamily,
    setActiveFamily,
    isPhantomInstalled,
    login,
    connectSolanaWallet,
  } = useMultiWallet();

  const handleNetworkSwitch = async (family: "evm" | "solana") => {
    // Don't switch if already on this network
    if (family === activeFamily) return;

    console.log(`[NetworkMenu] Switching from ${activeFamily} to ${family}`);

    // Set new active family first
    setActiveFamily(family);

    // Then trigger connection for the new network
    if (family === "solana") {
      if (!isPhantomInstalled) {
        toast.info("Solana Wallet Needed", {
          description: "Install Phantom or Solflare to use Solana.",
          duration: 6000,
        });
      }
      connectSolanaWallet();
    } else {
      login(); // Privy for Base
    }
  };

  return (
    <div className="inline-flex rounded-lg bg-zinc-100 dark:bg-zinc-900 p-1 border border-zinc-200 dark:border-zinc-800">
      {/* Base Network (EVM) */}
      <button
        type="button"
        onClick={() => handleNetworkSwitch("evm")}
        className={`px-3 py-1.5 rounded-md transition-all duration-200 font-medium text-xs whitespace-nowrap flex items-center gap-1.5 ${
          activeFamily === "evm"
            ? "bg-white text-[#0052ff] dark:bg-zinc-800 dark:text-white shadow-sm"
            : "text-zinc-600 dark:text-zinc-400 hover:bg-white/50 dark:hover:bg-zinc-800/50 hover:text-zinc-900 dark:hover:text-white"
        }`}
        title="Base Network (EVM)"
      >
        <BaseLogo className="w-3.5 h-3.5" />
        <span>Base</span>
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
  );
}
