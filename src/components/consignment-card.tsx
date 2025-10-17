"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import type { OTCConsignment } from "@/services/database";
import { useTokenCache, useMarketDataRefresh } from "@/hooks/useTokenCache";

interface ConsignmentCardProps {
  consignment: OTCConsignment;
}

export function ConsignmentCard({ consignment }: ConsignmentCardProps) {
  const router = useRouter();
  const { token, marketData: initialMarketData } = useTokenCache(
    consignment.tokenId,
  );
  const refreshedMarketData = useMarketDataRefresh(consignment.tokenId, token);
  const marketData = refreshedMarketData || initialMarketData;

  if (!token) return null;

  const formatAmount = (amount: string) => {
    const num = Number(amount) / 1e18;
    if (num >= 1000000) return `${(num / 1000000).toFixed(2)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(2)}K`;
    return num.toFixed(2);
  };

  const priceChange = marketData?.priceChange24h || 0;
  const priceChangeColor =
    priceChange >= 0 ? "text-orange-600" : "text-red-600";

  return (
    <div
      className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 sm:p-6 hover:shadow-lg transition-shadow cursor-pointer"
      onClick={() => router.push(`/token/${consignment.tokenId}`)}
    >
      <div className="flex items-start justify-between mb-4 gap-3">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          {token.logoUrl && (
            <Image
              src={token.logoUrl}
              alt={token.symbol}
              width={40}
              height={40}
              className="w-10 h-10 sm:w-12 sm:h-12 rounded-full flex-shrink-0"
            />
          )}
          <div className="min-w-0">
            <h3 className="text-base sm:text-lg font-semibold truncate">
              {token.symbol}
            </h3>
            <p className="text-xs sm:text-sm text-zinc-500 truncate">
              {token.name}
            </p>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-xs sm:text-sm font-medium whitespace-nowrap">
            ${marketData?.priceUsd.toFixed(4)}
          </div>
          <div className={`text-xs ${priceChangeColor} whitespace-nowrap`}>
            {priceChange >= 0 ? "+" : ""}
            {priceChange.toFixed(2)}%
          </div>
        </div>
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex justify-between gap-2">
          <span className="text-zinc-600 dark:text-zinc-400 text-xs sm:text-sm">
            Available:
          </span>
          <span className="font-medium text-xs sm:text-sm text-right">
            {formatAmount(consignment.remainingAmount)} {token.symbol}
          </span>
        </div>

        <div className="flex justify-between gap-2">
          <span className="text-zinc-600 dark:text-zinc-400 text-xs sm:text-sm">
            Discount:
          </span>
          <span className="font-medium text-xs sm:text-sm text-right">
            {consignment.isNegotiable
              ? `${consignment.minDiscountBps / 100}% - ${consignment.maxDiscountBps / 100}%`
              : `${consignment.fixedDiscountBps / 100}%`}
          </span>
        </div>

        <div className="flex justify-between gap-2">
          <span className="text-zinc-600 dark:text-zinc-400 text-xs sm:text-sm">
            Lockup:
          </span>
          <span className="font-medium text-xs sm:text-sm text-right">
            {consignment.isNegotiable
              ? `${consignment.minLockupDays}d - ${consignment.maxLockupDays}d`
              : `${consignment.fixedLockupDays}d`}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 sm:gap-2 mt-3 sm:mt-4">
        <span className="inline-flex items-center rounded-full bg-zinc-500/10 text-zinc-700 dark:text-zinc-300 px-2 py-0.5 sm:py-1 text-xs font-medium">
          {consignment.chain.toUpperCase()}
        </span>
        {consignment.isNegotiable && (
          <span className="inline-flex items-center rounded-full bg-blue-600/15 text-blue-700 dark:text-blue-400 px-2 py-0.5 sm:py-1 text-xs font-medium">
            Negotiable
          </span>
        )}
        {consignment.isFractionalized && (
          <span className="inline-flex items-center rounded-full bg-orange-600/15 text-orange-700 dark:text-orange-400 px-2 py-0.5 sm:py-1 text-xs font-medium">
            Fractionalized
          </span>
        )}
      </div>
    </div>
  );
}
