import { NextRequest, NextResponse } from "next/server";
import { MarketDataDB, type Chain } from "@/services/database";
import { TokenRegistryService } from "@/services/tokenRegistry";
import { MarketDataService } from "@/services/marketDataService";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const chain = searchParams.get("chain") as Chain | null;
  const minMarketCap = searchParams.get("minMarketCap");
  const maxMarketCap = searchParams.get("maxMarketCap");
  const isActive = searchParams.get("isActive");

  const service = new TokenRegistryService();

  const filters: Parameters<typeof service.getAllTokens>[0] = {};
  if (chain) filters.chain = chain;
  if (isActive !== null) filters.isActive = isActive === "true";
  if (minMarketCap) filters.minMarketCap = Number(minMarketCap);
  if (maxMarketCap) filters.maxMarketCap = Number(maxMarketCap);

  const tokens = await service.getAllTokens(filters);

  const tokensWithMarketData = await Promise.all(
    tokens.map(async (token) => {
      const marketData = await MarketDataDB.getMarketData(token.id);
      return {
        ...token,
        marketData,
      };
    }),
  );

  return NextResponse.json({
    success: true,
    tokens: tokensWithMarketData,
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const {
    symbol,
    name,
    contractAddress,
    chain,
    decimals,
    logoUrl,
    description,
    website,
    twitter,
  } = body;

  if (
    !symbol ||
    !name ||
    !contractAddress ||
    !chain ||
    decimals === undefined
  ) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 },
    );
  }

  const service = new TokenRegistryService();
  const token = await service.registerToken({
    symbol,
    name,
    contractAddress,
    chain,
    decimals,
    logoUrl,
    description,
    website,
    twitter,
  });

  const isLocalTestnet =
    contractAddress.startsWith("0x5FbDB") ||
    contractAddress.startsWith("0x5fbdb") ||
    (chain === "ethereum" && contractAddress.length === 42);

  const isSolanaWithoutKey = chain === "solana" && !process.env.BIRDEYE_API_KEY;

  if (!isLocalTestnet && !isSolanaWithoutKey) {
    const marketDataService = new MarketDataService();
    await marketDataService.refreshTokenData(token.id, contractAddress, chain);
  } else {
    await MarketDataDB.setMarketData({
      tokenId: token.id,
      priceUsd: 0.05,
      marketCap: 5000000,
      volume24h: 500000,
      priceChange24h: 0,
      liquidity: 1000000,
      lastUpdated: Date.now(),
    });
  }

  return NextResponse.json({
    success: true,
    token,
  });
}
