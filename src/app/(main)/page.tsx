"use client";
import "@/app/globals.css";

import { Suspense, useState } from "react";
import dynamic from "next/dynamic";

const DealsGrid = dynamic(
  () => import("@/components/deals-grid").then((m) => m.DealsGrid),
  { ssr: false },
);
const DealFilters = dynamic(
  () => import("@/components/deal-filters").then((m) => m.DealFilters),
  { ssr: false },
);

function MarketplaceContent() {
  const [filters, setFilters] = useState({
    chains: ["ethereum", "base", "solana"] as (
      | "ethereum"
      | "base"
      | "solana"
    )[],
    minMarketCap: 0,
    maxMarketCap: 0,
    negotiableTypes: ["negotiable", "fixed"] as ("negotiable" | "fixed")[],
    isFractionalized: false,
    searchQuery: "",
  });

  return (
    <main className="flex-1 flex flex-col min-h-0 px-4 sm:px-6 py-4 sm:py-8">
      <div className="max-w-7xl mx-auto w-full flex flex-col min-h-0 flex-1">
        {/* Header - Fixed */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4 sm:mb-6 flex-shrink-0">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">OTC Marketplace</h1>
            <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400 mt-1 sm:mt-2">
              Discover discounted token deals with flexible lockups
            </p>
          </div>
          <button
            onClick={() => (window.location.href = "/consign")}
            className="hidden sm:block px-4 py-2 bg-orange-600 text-white text-sm rounded-lg hover:bg-orange-700 whitespace-nowrap"
          >
            Create Listing
          </button>
        </div>

        {/* Filters - Fixed */}
        <div className="mb-4 flex-shrink-0">
          <DealFilters filters={filters} onFiltersChange={setFilters} />
        </div>

        {/* Deals Grid - Scrollable */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          <DealsGrid filters={filters} searchQuery={filters.searchQuery} />
        </div>
      </div>
    </main>
  );
}

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <div className="text-xl text-zinc-600 dark:text-zinc-400">
              Loading OTC Marketplace...
            </div>
          </div>
        </div>
      }
    >
      <MarketplaceContent />
    </Suspense>
  );
}
