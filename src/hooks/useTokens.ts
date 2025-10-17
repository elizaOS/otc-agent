import { useEffect, useState } from "react";
import type { Token, Chain } from "@/services/database";

export function useTokens(filters?: { chain?: Chain; isActive?: boolean }) {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadTokens() {
      const params = new URLSearchParams();
      if (filters?.chain) params.append("chain", filters.chain);
      if (filters?.isActive !== undefined)
        params.append("isActive", String(filters.isActive));

      const response = await fetch(`/api/tokens?${params.toString()}`);
      const data = await response.json();

      if (data.success) {
        setTokens(data.tokens || []);
      }
      setIsLoading(false);
    }

    loadTokens();
  }, [filters?.chain, filters?.isActive]);

  return { tokens, isLoading };
}

export function useToken(tokenId: string | null) {
  const [token, setToken] = useState<Token | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!tokenId) {
      setIsLoading(false);
      return;
    }

    async function loadToken() {
      const response = await fetch(`/api/tokens/${tokenId}`);
      const data = await response.json();

      if (data.success) {
        setToken(data.token);
      }
      setIsLoading(false);
    }

    loadToken();
  }, [tokenId]);

  return { token, isLoading };
}

export function useMarketData(tokenId: string | null) {
  const [marketData, setMarketData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!tokenId) {
      setIsLoading(false);
      return;
    }

    async function loadMarketData() {
      const response = await fetch(`/api/market-data/${tokenId}`);
      const data = await response.json();

      if (data.success) {
        setMarketData(data.marketData);
      }
      setIsLoading(false);
    }

    loadMarketData();
    const interval = setInterval(loadMarketData, 60000);
    return () => clearInterval(interval);
  }, [tokenId]);

  return { marketData, isLoading };
}
