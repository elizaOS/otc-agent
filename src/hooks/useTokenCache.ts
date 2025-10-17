import { useState, useEffect, useRef } from "react";
import type { Token, TokenMarketData } from "@/services/database";

interface TokenCacheEntry {
  token: Token;
  marketData: TokenMarketData | null;
  fetchedAt: number;
}

const globalTokenCache = new Map<string, TokenCacheEntry>();
const pendingFetches = new Map<string, Promise<TokenCacheEntry | null>>();

const CACHE_DURATION = 30000; // 30 seconds

export function useTokenCache(tokenId: string | null) {
  const [token, setToken] = useState<Token | null>(null);
  const [marketData, setMarketData] = useState<TokenMarketData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const fetchedTokenId = useRef<string | null>(null);

  useEffect(() => {
    if (!tokenId) {
      setIsLoading(false);
      return;
    }

    // Only fetch once for this tokenId per component instance
    if (fetchedTokenId.current === tokenId) return;

    fetchedTokenId.current = tokenId;

    async function loadToken() {
      // Check cache first (synchronously)
      const cached = globalTokenCache.get(tokenId);
      const now = Date.now();

      if (cached && now - cached.fetchedAt < CACHE_DURATION) {
        setToken(cached.token);
        setMarketData(cached.marketData);
        setIsLoading(false);
        return;
      }

      // Check if fetch is already in progress (critical section)
      let fetchPromise = pendingFetches.get(tokenId);

      if (!fetchPromise) {
        // Start new fetch - only ONE component will enter this block
        fetchPromise = (async () => {
          const response = await fetch(`/api/tokens/${tokenId}`);
          const data = await response.json();

          if (data.success) {
            const entry: TokenCacheEntry = {
              token: data.token,
              marketData: data.marketData || null,
              fetchedAt: Date.now(),
            };
            globalTokenCache.set(tokenId, entry);
            return entry;
          }
          return null;
        })();

        // Set pending IMMEDIATELY to block other components
        pendingFetches.set(tokenId, fetchPromise);

        // Clean up pending fetch after it completes
        fetchPromise.finally(() => {
          pendingFetches.delete(tokenId);
        });
      }

      // All components (first and subsequent) wait for the same promise
      const entry = await fetchPromise;

      if (entry) {
        setToken(entry.token);
        setMarketData(entry.marketData);
      }
      setIsLoading(false);
    }

    loadToken();
  }, [tokenId]);

  return { token, marketData, isLoading };
}

const marketDataRefreshIntervals = new Map<string, NodeJS.Timeout>();
const marketDataSubscribers = new Map<
  string,
  Set<(data: TokenMarketData) => void>
>();

function subscribeToMarketData(
  tokenId: string,
  callback: (data: TokenMarketData) => void,
) {
  if (!marketDataSubscribers.has(tokenId)) {
    marketDataSubscribers.set(tokenId, new Set());
  }
  marketDataSubscribers.get(tokenId)!.add(callback);

  // Set up refresh interval only once per tokenId
  if (!marketDataRefreshIntervals.has(tokenId)) {
    async function refreshMarketData() {
      const response = await fetch(`/api/market-data/${tokenId}`);
      
      if (!response.ok) {
        console.warn(`Failed to fetch market data for ${tokenId}:`, response.status);
        return;
      }

      const data = await response.json();

      if (data.success && data.marketData) {
        // Update cache
        const cached = globalTokenCache.get(tokenId);
        if (cached) {
          cached.marketData = data.marketData;
        }

        // Notify all subscribers
        marketDataSubscribers
          .get(tokenId)
          ?.forEach((cb) => cb(data.marketData));
      }
    }

    const interval = setInterval(refreshMarketData, 30000); // 30 seconds
    marketDataRefreshIntervals.set(tokenId, interval);
  }

  return () => {
    marketDataSubscribers.get(tokenId)?.delete(callback);
  };
}

export function useMarketDataRefresh(
  tokenId: string | null,
  token: Token | null,
) {
  const [marketData, setMarketData] = useState<TokenMarketData | null>(null);

  useEffect(() => {
    if (!token || !tokenId) return;

    return subscribeToMarketData(tokenId, setMarketData);
  }, [token, tokenId]);

  return marketData;
}
