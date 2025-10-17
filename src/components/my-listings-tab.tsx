"use client";

import { ConsignmentRow } from "./consignment-row";
import { Button } from "./button";
import { useMultiWallet } from "./multiwallet";
import type { OTCConsignment } from "@/services/database";

interface MyListingsTabProps {
  listings: OTCConsignment[];
  onRefresh?: () => void;
}

export function MyListingsTab({ listings, onRefresh }: MyListingsTabProps) {
  const {
    activeFamily,
    setActiveFamily,
    login,
    connectSolanaWallet,
    isPhantomInstalled,
  } = useMultiWallet();

  const handleSwitchToBase = () => {
    setActiveFamily("evm");
    login();
  };

  const handleSwitchToSolana = () => {
    if (!isPhantomInstalled) {
      alert("Please install Phantom or Solflare wallet to use Solana.");
      return;
    }
    setActiveFamily("solana");
    connectSolanaWallet();
  };

  const networkName = activeFamily === "solana" ? "Solana" : "Base";
  if (listings.length === 0) {
    return (
      <div className="text-center py-12">
        <h3 className="text-lg font-semibold mb-2">No Active Listings</h3>
        <p className="text-zinc-600 dark:text-zinc-400 mb-6">
          Create a listing to start selling your tokens via OTC
        </p>
        <Button
          className="!py-2 !px-4 bg-orange-500 hover:bg-orange-600 text-white rounded-lg"
          onClick={() => (window.location.href = "/consign")}
        >
          Create Listing
        </Button>
      </div>
    );
  }

  return (
    <div>
      {/* Network Info Banner */}
      <div className="mb-6 p-4 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
              Showing {networkName} Listings
            </p>
            <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
              Switch networks to view listings on other chains
            </p>
          </div>
          <div className="flex gap-2">
            {activeFamily !== "evm" && (
              <button
                onClick={handleSwitchToBase}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors whitespace-nowrap"
              >
                Switch to Base
              </button>
            )}
            {activeFamily !== "solana" && (
              <button
                onClick={handleSwitchToSolana}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-purple-600 hover:bg-purple-700 text-white transition-colors whitespace-nowrap"
              >
                Switch to Solana
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold">My Token Listings</h2>
        <Button
          className="bg-orange-500 hover:bg-orange-600 !px-4 !py-2 text-white rounded-lg"
          onClick={() => (window.location.href = "/consign")}
        >
          Create Listing
        </Button>
      </div>

      <div className="space-y-4">
        {listings.map((consignment) => (
          <ConsignmentRow
            key={consignment.id}
            consignment={consignment}
            onUpdate={onRefresh}
          />
        ))}
      </div>
    </div>
  );
}
