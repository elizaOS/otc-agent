import { NextRequest, NextResponse } from "next/server";
import { agentRuntime } from "@/lib/agent-runtime";
import QuoteService from "@/lib/plugin-otc-desk/services/quoteService";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ offerId: string }> },
) {
  await agentRuntime.getRuntime();

  const { offerId } = await params;

  if (!offerId) {
    return NextResponse.json({ error: "Offer ID required" }, { status: 400 });
  }

  const runtime = await agentRuntime.getRuntime();
  const quoteService = runtime.getService<QuoteService>("QuoteService");

  // Search for quote with matching offerId
  const matchingQuote = await quoteService.getQuoteByOfferId(offerId);

  if (!matchingQuote) {
    return NextResponse.json(
      { error: "Quote not found for this offer" },
      { status: 404 },
    );
  }

  // Redirect to the deal page
  return NextResponse.redirect(
    new URL(`/deal/${matchingQuote.quoteId}`, request.url),
  );
}
