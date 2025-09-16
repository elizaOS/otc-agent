import { NextRequest, NextResponse } from "next/server";
import {
  DealCompletionService,
  QuoteService,
  UserSessionService,
} from "@/services/database";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { quoteId, action } = body;

    if (!quoteId) {
      return NextResponse.json(
        { error: "Quote ID is required" },
        { status: 400 },
      );
    }

    if (action === "complete") {
      // Accept a chosen amount and compute totals from terms
      const tokenAmountStr = String(body.tokenAmount || "0");
      const paymentCurrency: "ETH" | "USDC" =
        body.paymentCurrency === "ETH" ? "ETH" : "USDC";
      const offerId = body.offerId as string | undefined;
      const transactionHash = body.transactionHash as string | undefined;
      const blockNumber = body.blockNumber as number | undefined;

      // Load quote by public id
      const existing = await QuoteService.getQuoteByQuoteId(quoteId);
      if (!existing) {
        return NextResponse.json({ error: "Quote not found" }, { status: 404 });
      }

      const pricePerToken = existing.priceUsdPerToken || 0;
      const discountBps = existing.discountBps || 0;
      const tokenAmountNum = parseFloat(tokenAmountStr || "0");
      const totalUsd = tokenAmountNum * pricePerToken;
      const discountUsd = totalUsd * (discountBps / 10000);
      const discountedUsd = totalUsd - discountUsd;

      // Persist executed figures back to quote
      const updated = await QuoteService.updateQuoteExecution(quoteId, {
        tokenAmount: tokenAmountStr,
        totalUsd,
        discountUsd,
        discountedUsd,
        paymentCurrency,
        paymentAmount:
          paymentCurrency === "ETH" ? undefined : String(discountedUsd),
        offerId,
        transactionHash,
        blockNumber,
      });

      // Update user session stats
      await UserSessionService.updateDealStats(
        existing.userId,
        discountedUsd,
        discountUsd,
      );

      // Log for audit
      console.log("[Deal Completion] Deal completed", {
        userId: existing.userId,
        quoteId,
        tokenAmount: tokenAmountStr,
        discountBps,
        finalPrice: discountedUsd,
        transactionHash,
        ipAddress:
          request.headers.get("x-forwarded-for") ||
          request.headers.get("x-real-ip"),
      });

      return NextResponse.json({ success: true, quote: updated });
    } else if (action === "share") {
      // Generate share data for the quote
      const shareData = await DealCompletionService.generateShareData(quoteId);

      // Log share action
      console.log("[Deal Completion] Deal shared", {
        quoteId,
        platform: body.platform || "general",
      });

      return NextResponse.json({
        success: true,
        shareData,
      });
    } else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (error) {
    console.error("[Deal Completion] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to process deal completion",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 },
      );
    }

    // Get user's quote history and filter for completed deals
    const quotes = await QuoteService.getUserQuoteHistory(userId, 100);
    const completedDeals = quotes.filter(
      (quote) => quote.status === "executed",
    );

    // Get user session for additional stats
    const userSession = await UserSessionService.getOrCreateSession(userId);

    return NextResponse.json({
      success: true,
      deals: completedDeals,
      totalDeals: userSession.totalDeals,
      totalVolumeUsd: userSession.totalVolumeUsd,
      totalSavedUsd: userSession.totalSavedUsd,
    });
  } catch (error) {
    console.error("[Deal Completion] Failed to get user deals:", error);
    return NextResponse.json(
      {
        error: "Failed to retrieve deals",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
