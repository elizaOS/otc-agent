import { NextRequest, NextResponse } from "next/server";
import { QuoteService } from "@/services/database";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const quoteId = params.id;

    if (!quoteId) {
      return NextResponse.json(
        { error: "Quote ID is required" },
        { status: 400 },
      );
    }

    // Get quote details
    const quote = await QuoteService.getQuoteByQuoteId(quoteId);

    if (!quote) {
      return NextResponse.json({ error: "Quote not found" }, { status: 404 });
    }

    // Only return executed quotes
    if (quote.status !== "executed") {
      return NextResponse.json(
        { error: "Quote not executed" },
        { status: 400 },
      );
    }

    // Format the quote for DealCompletion component
    const formattedQuote = {
      quoteId: quote.quoteId,
      userId: quote.userId,
      beneficiary: quote.beneficiary || "",
      tokenAmount: quote.tokenAmount,
      lockupMonths: quote.lockupMonths,
      discountBps: quote.discountBps,
      totalUsd: quote.totalUsd,
      discountUsd: quote.discountUsd,
      discountedUsd: quote.discountedUsd,
      paymentAmount: quote.paymentAmount,
      paymentCurrency: quote.paymentCurrency,
      transactionHash: quote.transactionHash,
    };

    return NextResponse.json({
      success: true,
      quote: formattedQuote,
    });
  } catch (error) {
    console.error("[Quote Executed] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch quote",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
