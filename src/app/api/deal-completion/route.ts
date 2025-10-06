import { agentRuntime } from "@/lib/agent-runtime";
import { walletToEntityId } from "@/lib/entityId";
import QuoteService from "@/lib/plugin-otc-desk/services/quoteService";
import {
  DealCompletionService,
  type PaymentCurrency
} from "@/services/database";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  await agentRuntime.getRuntime();

  const body = await request.json();
  const { quoteId, action } = body;

  if (!quoteId) {
    return NextResponse.json(
      { error: "Quote ID is required" },
      { status: 400 },
    );
  }

  if (action === "complete") {
    const tokenAmountStr = String(body.tokenAmount);
    const paymentCurrency: PaymentCurrency =
      body.paymentCurrency === "ETH" ? "ETH" : "USDC";
    const offerId = String(body.offerId || "");
    const transactionHash = String(body.transactionHash || "");
    const blockNumber = Number(body.blockNumber || 0);

    const quoteService = agentRuntime.runtime.getService<QuoteService>("QuoteService");

    const quote = await quoteService.getQuoteByQuoteId(quoteId);

    // Price was determined on-chain by Chainlink oracle
    // Calculate from on-chain data if available, otherwise use quote values
    const discountBps = quote.discountBps;
    const tokenAmountNum = parseFloat(tokenAmountStr);
    const totalUsd = quote.totalUsd || 0; // Should be populated from on-chain data
    const discountUsd = quote.discountUsd || (totalUsd * (discountBps / 10000));
    const discountedUsd = quote.discountedUsd || (totalUsd - discountUsd);

    const updated = await quoteService.updateQuoteExecution(quoteId, {
      tokenAmount: tokenAmountStr,
      totalUsd,
      discountUsd,
      discountedUsd,
      paymentCurrency,
      paymentAmount: String(discountedUsd),
      offerId,
      transactionHash,
      blockNumber,
    });

    console.log("[Deal Completion] Deal completed", {
      entityId: quote.entityId,
      quoteId,
      tokenAmount: tokenAmountStr,
      discountBps,
      finalPrice: discountedUsd,
      transactionHash,
    });

    return NextResponse.json({ success: true, quote: updated });
  }

  if (action === "share") {
    const quoteService = agentRuntime.runtime.getService<QuoteService>("QuoteService");
    const quote = await quoteService.getQuoteByQuoteId(quoteId);
    if (!quote) {
      return NextResponse.json({ error: "Quote not found" }, { status: 404 });
    }
    const shareData = await DealCompletionService.generateShareData(quoteId);

    console.log("[Deal Completion] Deal shared", {
      quoteId,
      platform: body.platform || "general",
    });

    return NextResponse.json({ success: true, shareData });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

export async function GET(request: NextRequest) {
  await agentRuntime.getRuntime();

  const { searchParams } = new URL(request.url);
  const wallet = searchParams.get("wallet");

  if (!wallet) {
    return NextResponse.json({ error: "wallet required" }, { status: 400 });
  }

  const entityId = walletToEntityId(wallet);
  const quoteService = agentRuntime.runtime.getService<QuoteService>("QuoteService");
  const quotes = await quoteService.getUserQuoteHistory(entityId, 100);
  const completedDeals = quotes.filter((quote) => quote.status === "executed");


  return NextResponse.json({
    success: true,
    deals: completedDeals,
  });
}
