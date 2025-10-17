// Price feed service for fetching real-time token prices

interface PriceCache {
  price: number;
  timestamp: number;
}

const DEFAULT_TOKEN_CONFIG = {
  symbol: "elizaOS",
  name: "elizaOS",
  decimals: 5,
  coingeckoId: "eliza",
} as const;

const CACHE_TTL = 60 * 1000; // 60 seconds
const FALLBACK_TOKEN_PRICE = 0.00005;
const FALLBACK_ETH_PRICE = 3500;

/**
 * Get cached price from runtime storage
 */
async function getCachedPrice(key: string): Promise<PriceCache | null> {
  const { agentRuntime } = await import("../../agent-runtime");
  const runtime = await agentRuntime.getRuntime();
  return (await runtime.getCache<PriceCache>(`price:${key}`)) ?? null;
}

/**
 * Set cached price in runtime storage
 */
async function setCachedPrice(key: string, value: PriceCache): Promise<void> {
  const { agentRuntime } = await import("../../agent-runtime");
  const runtime = await agentRuntime.getRuntime();
  await runtime.setCache(`price:${key}`, value);
}

/**
 * Fetch token price from CoinGecko API by coingecko ID
 * For dynamic multi-token pricing, use MarketDataService instead
 */
async function fetchTokenPriceFromCoinGecko(coingeckoId: string): Promise<number | null> {
  const response = await fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=${coingeckoId}&vs_currencies=usd`,
    {
      headers: {
        Accept: "application/json",
      },
    },
  );

  if (!response.ok) {
    console.warn(`CoinGecko API returned ${response.status} for ${coingeckoId}`);
    return null;
  }

  const data = await response.json();
  const price = data[coingeckoId]?.usd;

  if (typeof price !== "number") {
    console.warn(`Invalid price data for ${coingeckoId}:`, data);
    return null;
  }

  return price;
}

/**
 * Get token price with caching and fallback
 * For multi-token support, use MarketDataService instead
 */
export async function getElizaPriceUsd(): Promise<number> {
  const cacheKey = DEFAULT_TOKEN_CONFIG.symbol;

  // Check runtime cache first
  const cached = await getCachedPrice(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.price;
  }

  // Try to fetch from CoinGecko
  const price = await fetchTokenPriceFromCoinGecko(DEFAULT_TOKEN_CONFIG.coingeckoId);

  if (price !== null) {
    // Update runtime cache
    await setCachedPrice(cacheKey, {
      price,
      timestamp: Date.now(),
    });
    return price;
  }

  // Use fallback price
  console.warn(`Using fallback price: $${FALLBACK_TOKEN_PRICE}`);
  return FALLBACK_TOKEN_PRICE;
}

/**
 * Get ETH price in USD
 */
export async function getEthPriceUsd(): Promise<number> {
  const cacheKey = "ETH";

  // Check runtime cache
  const cached = await getCachedPrice(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.price;
  }

  // Fetch from CoinGecko
  const response = await fetch(
    "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd",
    {
      headers: {
        Accept: "application/json",
      },
    },
  );

  if (response.ok) {
    const data = await response.json();
    const price = data.ethereum?.usd;

    if (typeof price === "number") {
      await setCachedPrice(cacheKey, {
        price,
        timestamp: Date.now(),
      });
      return price;
    }
  }

  // Fallback ETH price
  console.warn(`Using fallback ETH price: $${FALLBACK_ETH_PRICE}`);
  return FALLBACK_ETH_PRICE;
}

/**
 * Format token amount with proper display (K, M, B suffixes)
 */
export function formatTokenAmount(amount: string | number): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;

  if (isNaN(num)) return "0";

  // Format with appropriate decimal places based on token value
  if (num >= 1000000000) {
    return `${(num / 1000000000).toFixed(2)}B`;
  } else if (num >= 1000000) {
    return `${(num / 1000000).toFixed(2)}M`;
  } else if (num >= 1000) {
    return `${(num / 1000).toFixed(2)}K`;
  } else {
    return num.toLocaleString();
  }
}

/**
 * Convert token amount to USD value
 * For multi-token support, use MarketDataService for dynamic token pricing
 */
export async function getTokenValueUsd(
  amount: string | number,
): Promise<number> {
  const price = await getElizaPriceUsd();
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return num * price;
}

/**
 * Clear price cache (useful for testing or forcing refresh)
 */
export async function clearPriceCache(): Promise<void> {
  const { agentRuntime } = await import("../../agent-runtime");
  const runtime = await agentRuntime.getRuntime();
  await runtime.setCache(`price:${DEFAULT_TOKEN_CONFIG.symbol}`, null);
  await runtime.setCache("price:ETH", null);
  console.log("[PriceFeed] Price cache cleared");
}
