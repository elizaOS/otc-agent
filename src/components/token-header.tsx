"use client";

import Image from "next/image";
import type { Token, TokenMarketData } from "@/services/database";

interface TokenHeaderProps {
  token: Token;
  marketData: TokenMarketData | null;
}

export function TokenHeader({ token, marketData }: TokenHeaderProps) {
  const priceChange = marketData?.priceChange24h || 0;
  const priceChangeColor =
    priceChange >= 0 ? "text-orange-600" : "text-red-600";

  const formatMarketCap = (mc: number) => {
    if (mc >= 1e9) return `$${(mc / 1e9).toFixed(2)}B`;
    if (mc >= 1e6) return `$${(mc / 1e6).toFixed(2)}M`;
    if (mc >= 1e3) return `$${(mc / 1e3).toFixed(2)}K`;
    return `$${mc.toFixed(2)}`;
  };

  const formatAddress = (address: string) => {
    if (!address) return "";
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
      <div className="flex items-center justify-between gap-3">
        {/* Left: Token info */}
        <div className="flex gap-2 items-center min-w-0">
          {token.logoUrl && (
            <Image
              src={token.logoUrl}
              alt={token.symbol}
              width={32}
              height={32}
              className="w-8 h-8 rounded-full flex-shrink-0"
            />
          )}
          <div className="min-w-0">
            <h1 className="text-base font-bold truncate">{token.name}</h1>
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              <span>${token.symbol}</span>
              {token.contractAddress && (
                <>
                  <span>•</span>
                  <span className="font-mono">
                    {formatAddress(token.contractAddress)}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right: Price and stats */}
        <div className="flex items-center gap-4 flex-shrink-0">
          {marketData && (
            <>
              <div className="hidden sm:flex items-center gap-3 text-xs">
                <div>
                  <div className="text-zinc-600 dark:text-zinc-400">MCap</div>
                  <div className="font-semibold">
                    {formatMarketCap(marketData.marketCap)}
                  </div>
                </div>
                <div>
                  <div className="text-zinc-600 dark:text-zinc-400">
                    Vol 24h
                  </div>
                  <div className="font-semibold">
                    {formatMarketCap(marketData.volume24h)}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold">
                  ${marketData?.priceUsd.toFixed(4) || "—"}
                </div>
                <div className={`text-xs ${priceChangeColor}`}>
                  {priceChange >= 0 ? "+" : ""}
                  {priceChange.toFixed(2)}% (24h)
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
