"use client";

import { useEffect, useState } from "react";
import { TokenDealsSection } from "./token-deals-section";
import { useTokenCache } from "@/hooks/useTokenCache";
import type {
  OTCConsignment,
  Token,
  TokenMarketData,
} from "@/services/database";

interface DealsGridProps {
  filters: {
    chains: string[];
    minMarketCap: number;
    maxMarketCap: number;
    negotiableTypes: string[];
    isFractionalized: boolean;
  };
  searchQuery?: string;
}

interface TokenGroup {
  tokenId: string;
  token: Token | null;
  marketData: TokenMarketData | null;
  consignments: OTCConsignment[];
}

function TokenGroupLoader({ tokenGroup }: { tokenGroup: TokenGroup }) {
  const { token, marketData: cachedMarketData } = useTokenCache(
    tokenGroup.tokenId,
  );

  if (!token) return null;

  return (
    <TokenDealsSection
      token={token}
      marketData={cachedMarketData}
      consignments={tokenGroup.consignments}
    />
  );
}

export function DealsGrid({ filters, searchQuery = "" }: DealsGridProps) {
  const [tokenGroups, setTokenGroups] = useState<Map<string, TokenGroup>>(
    new Map(),
  );
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadConsignments() {
      setIsLoading(true);
      const params = new URLSearchParams();

      // Add chains
      filters.chains.forEach((chain) => params.append("chains", chain));

      // Add negotiable types
      filters.negotiableTypes.forEach((type) =>
        params.append("negotiableTypes", type),
      );

      // Add fractionalized filter
      if (filters.isFractionalized) {
        params.append("isFractionalized", "true");
      }

      const response = await fetch(`/api/consignments?${params.toString()}`);
      const data = await response.json();

      if (data.success) {
        const consignmentsList = (data.consignments || []) as OTCConsignment[];

        // Deduplicate consignments by ID
        const uniqueConsignments: OTCConsignment[] = Array.from(
          new Map(
            consignmentsList.map((c) => [c.id, c]),
          ).values(),
        );

        // Group consignments by tokenId
        const grouped = new Map<string, TokenGroup>();
        for (const consignment of uniqueConsignments) {
          if (!grouped.has(consignment.tokenId)) {
            grouped.set(consignment.tokenId, {
              tokenId: consignment.tokenId,
              token: null,
              marketData: null,
              consignments: [],
            });
          }
          grouped.get(consignment.tokenId)!.consignments.push(consignment);
        }

        console.log("[DealsGrid] Loaded consignments:", {
          total: consignmentsList.length,
          unique: uniqueConsignments.length,
          uniqueTokens: grouped.size,
        });

        setTokenGroups(grouped);
      }
      setIsLoading(false);
    }

    loadConsignments();
  }, [filters]);

  // Filter token groups by search query
  const filteredGroups = Array.from(tokenGroups.values()).filter((group) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return group.tokenId.toLowerCase().includes(query);
  });

  if (isLoading) {
    return (
      <div className="space-y-6 pb-6">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 animate-pulse"
          >
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 bg-zinc-200 dark:bg-zinc-800 rounded-full"></div>
              <div className="flex-1">
                <div className="h-6 bg-zinc-200 dark:bg-zinc-800 rounded w-32 mb-2"></div>
                <div className="h-4 bg-zinc-200 dark:bg-zinc-800 rounded w-48"></div>
              </div>
            </div>
            <div className="space-y-3">
              <div className="h-4 bg-zinc-200 dark:bg-zinc-800 rounded"></div>
              <div className="h-4 bg-zinc-200 dark:bg-zinc-800 rounded w-5/6"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (filteredGroups.length === 0 && searchQuery) {
    return (
      <div className="text-center py-12">
        <svg
          className="mx-auto h-12 w-12 text-zinc-400 mb-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-2">
          No results found
        </h3>
        <p className="text-zinc-600 dark:text-zinc-400">
          No tokens match &quot;{searchQuery}&quot;. Try a different search term.
        </p>
      </div>
    );
  }

  if (filteredGroups.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-zinc-600 dark:text-zinc-400">
          No OTC deals match your filters. Try adjusting the filters or be the
          first to list a deal.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-6">
      {filteredGroups.map((group) => (
        <TokenGroupLoader key={group.tokenId} tokenGroup={group} />
      ))}
    </div>
  );
}
