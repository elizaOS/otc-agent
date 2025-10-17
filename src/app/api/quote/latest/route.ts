import { NextRequest, NextResponse } from "next/server";
import { agentRuntime } from "@/lib/agent-runtime";
import { walletToEntityId } from "@/lib/entityId";
import QuoteService from "@/lib/plugin-otc-desk/services/quoteService";

export async function GET(request: NextRequest) {
  const runtime = await agentRuntime.getRuntime();
  const quoteService = runtime.getService<QuoteService>("QuoteService");

  if (!quoteService) {
    return NextResponse.json(
      { error: "QuoteService not available" },
      { status: 500 },
    );
  }

  const { searchParams } = new URL(request.url);
  const wallet = searchParams.get("entityId");
  const tokenId = searchParams.get("tokenId");

  if (!wallet) {
    return NextResponse.json(
      { error: "entityId parameter required" },
      { status: 400 },
    );
  }

  if (!tokenId) {
    return NextResponse.json(
      { error: "tokenId parameter required" },
      { status: 400 },
    );
  }

  console.log("[Quote API] GET - wallet:", wallet, "tokenId:", tokenId);

  const entityId = walletToEntityId(wallet);
  const quoteKey = `quote:${tokenId}:${entityId}`;
  let quote = await runtime.getCache<any>(quoteKey);
  console.log("[Quote API] Found:", quote ? quote.quoteId : "null");

  if (!quote) {
    console.log("[Quote API] Creating default quote for token:", tokenId);

    await quoteService.createQuote({
      entityId,
      beneficiary: wallet.toLowerCase(),
      tokenAmount: "0",
      discountBps: 1000,
      apr: 0,
      lockupMonths: 5,
      paymentCurrency: "USDC",
      totalUsd: 0,
      discountUsd: 0,
      discountedUsd: 0,
      paymentAmount: "0",
    });

    quote = await runtime.getCache<any>(quoteKey);
    if (quote) {
      quote.tokenId = tokenId;
      await runtime.setCache(quoteKey, quote);
    }
  }

  // Fetch token data to get chain and symbol information
  let tokenChain = undefined;
  let tokenSymbol = undefined;
  if (tokenId) {
    try {
      const { TokenDB } = await import("@/services/database");
      const token = await TokenDB.getToken(tokenId);
      tokenChain = token.chain;
      tokenSymbol = token.symbol;
    } catch (error) {
      console.warn("[Quote API] Failed to fetch token data:", tokenId);
    }
  }

  const formattedQuote = quote
    ? {
        quoteId: quote.quoteId,
        entityId: quote.entityId,
        beneficiary: quote.beneficiary,
        tokenId: quote.tokenId || tokenId,
        tokenAmount: quote.tokenAmount,
        discountBps: quote.discountBps,
        apr: quote.apr,
        lockupMonths: quote.lockupMonths,
        lockupDays: quote.lockupDays,
        paymentCurrency: quote.paymentCurrency,
        totalUsd: quote.totalUsd,
        discountUsd: quote.discountUsd,
        discountedUsd: quote.discountedUsd,
        paymentAmount: quote.paymentAmount,
        status: quote.status,
        createdAt: quote.createdAt,
        tokenChain,
        tokenSymbol,
      }
    : null;

  console.log("[Quote API] Returning:", formattedQuote?.quoteId ?? "null", "chain:", tokenChain);
  return NextResponse.json({ success: true, quote: formattedQuote });
}

export async function POST(request: NextRequest) {
  const runtime = await agentRuntime.getRuntime();
  const quoteService = runtime.getService<QuoteService>("QuoteService");

  if (!quoteService) {
    return NextResponse.json(
      { error: "QuoteService not available" },
      { status: 500 },
    );
  }

  const body = await request.json();
  const {
    quoteId,
    beneficiary,
    tokenAmount,
    paymentCurrency,
    totalUsd,
    discountUsd,
    discountedUsd,
    paymentAmount,
  } = body;

  if (!quoteId) {
    return NextResponse.json({ error: "quoteId required" }, { status: 400 });
  }

  console.log("[Quote API] POST - updating quote:", {
    quoteId,
    beneficiary: beneficiary?.slice(0, 10),
    tokenAmount,
    paymentCurrency,
    totalUsd,
    discountedUsd,
  });

  // Get existing quote
  const quote = await quoteService.getQuoteByQuoteId(quoteId);

  if (!quote) {
    console.error("[Quote API] Quote not found:", quoteId);
    return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  }

  // Update all provided fields
  const updatedQuote = {
    ...quote,
    ...(beneficiary && { beneficiary: beneficiary.toLowerCase() }),
    ...(tokenAmount && { tokenAmount: String(tokenAmount) }),
    ...(paymentCurrency && { paymentCurrency }),
    ...(typeof totalUsd === "number" && { totalUsd }),
    ...(typeof discountUsd === "number" && { discountUsd }),
    ...(typeof discountedUsd === "number" && { discountedUsd }),
    ...(paymentAmount && { paymentAmount: String(paymentAmount) }),
  };

  // Save updated quote
  await runtime.setCache(`quote:${quoteId}`, updatedQuote);

  console.log("[Quote API] ✅ Quote updated:", quoteId);

  return NextResponse.json({ success: true, quote: updatedQuote });
}
