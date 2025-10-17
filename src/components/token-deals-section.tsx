"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import type {
  OTCConsignment,
  Token,
  TokenMarketData,
} from "@/services/database";

interface TokenDealsSectionProps {
  token: Token;
  marketData: TokenMarketData | null;
  consignments: OTCConsignment[];
}

export function TokenDealsSection({
  token,
  marketData,
  consignments,
}: TokenDealsSectionProps) {
  const router = useRouter();
  const [isExpanded, setIsExpanded] = useState(true);

  const formatAmount = (amount: string) => {
    const num = Number(amount) / 1e18;
    if (num >= 1000000) return `${(num / 1000000).toFixed(2)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(2)}K`;
    return num.toFixed(2);
  };

  const priceChange = marketData?.priceChange24h || 0;
  const priceChangeColor =
    priceChange >= 0 ? "text-orange-600" : "text-red-600";

  const totalAvailable = consignments.reduce(
    (sum, c) => sum + BigInt(c.remainingAmount),
    0n
  );

  return (
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
      {/* Token Header - Always Visible */}
      <div
        className="bg-zinc-50 dark:bg-zinc-900/50 p-4 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 flex-1 min-w-0">
            {token.logoUrl && (
              <Image
                src={token.logoUrl}
                alt={token.symbol}
                width={48}
                height={48}
                className="w-12 h-12 rounded-full flex-shrink-0"
              />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2">
                <h3 className="text-lg font-semibold truncate">
                  {token.symbol}
                </h3>
                <span className="text-sm text-zinc-500 dark:text-zinc-400 truncate">
                  {token.name}
                </span>
              </div>
              <div className="flex items-center gap-4 mt-1 text-sm">
                <div>
                  <span className="text-zinc-600 dark:text-zinc-400">
                    Price:{" "}
                  </span>
                  <span className="font-medium">
                    ${marketData?.priceUsd.toFixed(4)}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-600 dark:text-zinc-400">
                    Quantity:{" "}
                  </span>
                  <span className="font-medium">
                    {formatAmount(totalAvailable.toString())} {token.symbol}
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <svg
              className={`w-5 h-5 transition-transform ${isExpanded ? "rotate-180" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </div>
        </div>
      </div>

      {/* Deals List - Collapsible */}
      {isExpanded && (
        <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {consignments.map((consignment) => (
            <div
              key={consignment.id}
              className="p-4 hover:bg-zinc-50 dark:hover:bg-zinc-900/30 transition-colors cursor-pointer group"
              onClick={() => router.push(`/token/${token.id}`)}
            >
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
                <div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">
                    Available Amount
                  </div>
                  <div className="font-medium group-hover:text-orange-600 transition-colors">
                    {formatAmount(consignment.remainingAmount)} {token.symbol}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">
                    Discount
                  </div>
                  <div className="font-medium">
                    {consignment.isNegotiable
                      ? `${consignment.minDiscountBps / 100}% - ${consignment.maxDiscountBps / 100}%`
                      : `${consignment.fixedDiscountBps / 100}%`}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">
                    Lockup Period
                  </div>
                  <div className="font-medium">
                    {consignment.isNegotiable
                      ? `${consignment.minLockupDays}d - ${consignment.maxLockupDays}d`
                      : `${consignment.fixedLockupDays}d`}
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                        consignment.chain === "base"
                          ? "bg-blue-600/15 text-blue-700 dark:text-blue-400"
                          : "bg-purple-600/15 text-purple-700 dark:text-purple-400"
                      }`}
                    >
                      {consignment.chain.toUpperCase()}
                    </span>
                    {consignment.isNegotiable && (
                      <span className="inline-flex items-center rounded-full bg-orange-600/15 text-orange-700 dark:text-orange-400 px-2 py-1 text-xs font-medium">
                        Negotiable
                      </span>
                    )}
                    {consignment.isFractionalized && (
                      <span className="inline-flex items-center rounded-full bg-zinc-500/10 text-zinc-700 dark:text-zinc-300 px-2 py-1 text-xs font-medium">
                        Fractionalized
                      </span>
                    )}
                    <svg
                      className="w-5 h-5 text-zinc-400 group-hover:text-orange-600 transition-colors"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
