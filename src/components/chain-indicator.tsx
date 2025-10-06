"use client";

import { useMultiWallet } from "@/components/multiwallet";
import { BaseLogo, SolanaLogo } from "@/components/icons";
import { useChainId } from "wagmi";
import { base, baseSepolia, hardhat } from "wagmi/chains";

export function ChainIndicator() {
  const { activeFamily } = useMultiWallet();
  const chainId = useChainId();

  if (activeFamily === "solana") {
    return (
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gradient-to-r from-[#9945FF]/10 to-[#14F195]/10 text-white border border-[#9945FF]/30">
        <SolanaLogo className="w-4 h-4" />
        <span className="text-sm font-medium">Solana</span>
      </div>
    );
  }

  // EVM chains
  let chainName = "Unknown";
  let chainColor = "text-gray-400 border-gray-500/20 bg-gray-500/10";
  let showBaseLogo = false;

  if (chainId === hardhat.id) {
    chainName = "Hardhat (Local)";
    chainColor = "text-yellow-400 border-yellow-500/20 bg-yellow-500/10";
  } else if (chainId === base.id) {
    chainName = "Base";
    chainColor = "text-[#0052ff] border-[#0052ff]/20 bg-[#0052ff]/10";
    showBaseLogo = true;
  } else if (chainId === baseSepolia.id) {
    chainName = "Base Sepolia";
    chainColor = "text-[#0052ff] border-[#0052ff]/20 bg-[#0052ff]/10";
    showBaseLogo = true;
  }

  return (
    <div
      className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border ${chainColor}`}
    >
      {showBaseLogo ? (
        <BaseLogo className="w-4 h-4" />
      ) : (
        <svg
          className="w-4 h-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M12 2L2 7l10 5 10-5-10-5z" />
          <path d="M2 17l10 5 10-5M2 12l10 5 10-5" />
        </svg>
      )}
      <span className="text-sm font-medium">{chainName}</span>
    </div>
  );
}
