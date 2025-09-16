// Price feed service for fetching real-time ElizaOS token price

interface PriceCache {
  price: number;
  timestamp: number;
}

// ElizaOS token configuration
export const ELIZAOS_TOKEN = {
  symbol: "ElizaOS",
  name: "ElizaOS",
  decimals: 5,
  coingeckoId: "eliza",
} as const;

// Price cache with 60-second TTL
const priceCache = new Map<string, PriceCache>();
const CACHE_TTL = 60 * 1000; // 60 seconds

// Fallback price for development/testing
const FALLBACK_ELIZAOS_PRICE = 0.00005; // $0.00005 per ElizaOS
const FALLBACK_ETH_PRICE = 3500; // $3500 per ETH

/**
 * Fetch ElizaOS price from CoinGecko API
 */
async function fetchElizaPriceFromCoinGecko(): Promise<number | null> {
  try {
    const response = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ELIZAOS_TOKEN.coingeckoId}&vs_currencies=usd`,
      {
        headers: {
          Accept: "application/json",
        },
      },
    );

    if (!response.ok) {
      console.warn(`CoinGecko API returned ${response.status} for ElizaOS`);
      return null;
    }

    const data = await response.json();
    const price = data[ELIZAOS_TOKEN.coingeckoId]?.usd;

    if (typeof price !== "number") {
      console.warn(`Invalid price data for ElizaOS:`, data);
      return null;
    }

    return price;
  } catch (error) {
    console.error(`Failed to fetch ElizaOS price:`, error);
    return null;
  }
}

/**
 * Get ElizaOS token price with caching and fallback
 */
export async function getElizaPriceUsd(): Promise<number> {
  const cacheKey = "ElizaOS";

  // Check cache first
  const cached = priceCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.price;
  }

  // Try to fetch from CoinGecko
  const price = await fetchElizaPriceFromCoinGecko();

  if (price !== null) {
    // Update cache
    priceCache.set(cacheKey, {
      price,
      timestamp: Date.now(),
    });
    return price;
  }

  // Use fallback price
  console.warn(`Using fallback price for ElizaOS: $${FALLBACK_ELIZAOS_PRICE}`);
  return FALLBACK_ELIZAOS_PRICE;
}

/**
 * Get ETH price in USD
 */
export async function getEthPriceUsd(): Promise<number> {
  const cacheKey = "ETH";

  // Check cache
  const cached = priceCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.price;
  }

  try {
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
        priceCache.set(cacheKey, {
          price,
          timestamp: Date.now(),
        });
        return price;
      }
    }
  } catch (error) {
    console.error("Failed to fetch ETH price:", error);
  }

  // Fallback ETH price
  console.warn(`Using fallback ETH price: $${FALLBACK_ETH_PRICE}`);
  return FALLBACK_ETH_PRICE;
}

/**
 * Format ElizaOS token amount with proper display
 */
export function formatElizaAmount(amount: string | number): string {
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
 * Convert ElizaOS amount to USD value
 */
export async function getElizaValueUsd(
  amount: string | number,
): Promise<number> {
  const price = await getElizaPriceUsd();
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return num * price;
}

/**
 * Clear price cache (useful for testing or forcing refresh)
 */
export function clearPriceCache(): void {
  priceCache.clear();
}
