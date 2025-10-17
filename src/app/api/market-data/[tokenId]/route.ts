import { NextRequest, NextResponse } from "next/server";
import { TokenDB, MarketDataDB } from "@/services/database";
import { MarketDataService } from "@/services/marketDataService";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tokenId: string }> },
) {
  const { tokenId } = await params;

  try {
    let marketData = await MarketDataDB.getMarketData(tokenId);

    if (!marketData || Date.now() - marketData.lastUpdated > 300000) {
      const token = await TokenDB.getToken(tokenId);

      const isLocalTestnet =
        token.contractAddress.startsWith("0x5FbDB") ||
        token.contractAddress.startsWith("0x5fbdb") ||
        (token.chain === "ethereum" && token.contractAddress.length === 42);

      if (!isLocalTestnet) {
        const service = new MarketDataService();
        await service.refreshTokenData(
          tokenId,
          token.contractAddress,
          token.chain,
        );
        marketData = await MarketDataDB.getMarketData(tokenId);
      }
    }

    return NextResponse.json({
      success: true,
      marketData,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch market data",
      },
      { status: 404 }
    );
  }
}
