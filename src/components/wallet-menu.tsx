"use client";

import { useMultiWallet } from "@/components/multiwallet";
import { BaseLogo } from "@/components/icons/index";
import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { ChevronDownIcon } from "@heroicons/react/24/outline";

/**
 * WalletMenu - Dropdown showing connected wallet with management actions
 * Displayed when user is connected, shows network badge + address + actions
 */
export function WalletMenu() {
  const {
    activeFamily,
    setActiveFamily,
    evmAddress,
    solanaPublicKey,
    evmConnected,
    solanaConnected,
    networkLabel,
    login,
    connectWallet,
    connectSolanaWallet,
    switchSolanaWallet,
    disconnect,
  } = useMultiWallet();

  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentAddress =
    activeFamily === "solana" ? solanaPublicKey : evmAddress;
  const displayAddress = currentAddress
    ? `${currentAddress.slice(0, 6)}...${currentAddress.slice(-4)}`
    : "Loading...";
  const fullAddress = currentAddress || "";

  // Debug logging
  useEffect(() => {
    console.log("[WalletMenu] Rendering with:", {
      activeFamily,
      evmAddress,
      solanaPublicKey,
      evmConnected,
      solanaConnected,
      currentAddress,
      displayAddress,
      networkLabel,
    });
  }, [
    activeFamily,
    evmAddress,
    solanaPublicKey,
    evmConnected,
    solanaConnected,
    currentAddress,
    displayAddress,
    networkLabel,
  ]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  const handleCopyAddress = async () => {
    await navigator.clipboard.writeText(fullAddress);
    toast.success("Address copied to clipboard");
    setIsOpen(false);
  };

  const handleSwitchNetwork = async () => {
    setIsOpen(false);
    const targetFamily = activeFamily === "solana" ? "evm" : "solana";

    console.log(`[WalletMenu] Switching from ${activeFamily} to ${targetFamily}`);

    // Set active family first
    setActiveFamily(targetFamily);

    // Then open appropriate connection modal for target network
    if (targetFamily === "evm") {
      login(); // Privy modal for Base
    } else if (targetFamily === "solana") {
      connectSolanaWallet(); // Solana wallet-adapter modal
    }
  };

  const handleSwitchWallet = () => {
    setIsOpen(false);
    if (activeFamily === "solana") {
      switchSolanaWallet();
    } else {
      connectWallet();
    }
  };

  const handleDisconnect = async () => {
    console.log("[WalletMenu] Disconnect clicked");
    setIsOpen(false);

    console.log("[WalletMenu] Calling disconnect...");
    await disconnect();
    console.log("[WalletMenu] Disconnect complete");

    // No need to reload - React state updates will handle the UI transition smoothly
  };

  const networkBadgeClass =
    activeFamily === "solana"
      ? "bg-gradient-to-r from-[#9945FF] to-[#14F195] text-white"
      : "bg-[#0052ff] text-white";

  const networkIcon =
    activeFamily === "solana" ? (
      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M20.45,9.37l-7.72,7.72a1.5,1.5,0,0,1-2.12,0L3.55,10a1.5,1.5,0,0,1,0-2.12L10.61.83a1.5,1.5,0,0,1,2.12,0l7.72,7.72A1.5,1.5,0,0,1,20.45,9.37Z" />
      </svg>
    ) : (
      <BaseLogo className="w-3.5 h-3.5" />
    );

  // If we don't have an address, don't render (happens during disconnect/switch)
  if (!currentAddress) {
    console.warn("[WalletMenu] No current address available");
    return null;
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Wallet Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center gap-2 h-9 px-3 text-sm rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
      >
        {/* Network Badge */}
        <div
          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md ${networkBadgeClass} text-xs font-medium`}
        >
          {networkIcon}
          <span>{activeFamily === "solana" ? "Solana" : "Base"}</span>
        </div>

        {/* Separator */}
        <div className="w-px h-4 bg-zinc-300 dark:bg-zinc-600" />

        {/* Connection indicator */}
        <div className="w-2 h-2 rounded-full bg-green-500" />

        {/* Address */}
        <span className="font-mono">{displayAddress}</span>

        {/* Dropdown arrow */}
        <ChevronDownIcon
          className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-72 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xl z-50">
          {/* Current Connection */}
          <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
            <div className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">
              Connected to
            </div>
            <div className="flex items-center gap-2 mb-2">
              {networkIcon}
              <span className="font-semibold text-zinc-900 dark:text-white">
                {networkLabel}
              </span>
            </div>
            <button
              type="button"
              onClick={handleCopyAddress}
              className="w-full flex items-center justify-between px-3 py-2 rounded-md bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors group"
              title={fullAddress}
            >
              <span className="font-mono text-sm text-zinc-700 dark:text-zinc-300">
                {displayAddress}
              </span>
              <svg
                className="w-4 h-4 text-zinc-500 dark:text-zinc-400 group-hover:text-zinc-700 dark:group-hover:text-zinc-200"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
            </button>
          </div>

          {/* Actions */}
          <div className="py-1">
            <button
              type="button"
              onClick={handleSwitchNetwork}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
                />
              </svg>
              <span>
                Switch to {activeFamily === "solana" ? "Base" : "Solana"}
              </span>
            </button>
            <button
              type="button"
              onClick={handleSwitchWallet}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                />
              </svg>
              <span>Switch Wallet</span>
            </button>
            <button
              type="button"
              onClick={handleDisconnect}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                />
              </svg>
              <span>Disconnect</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
