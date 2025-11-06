import otcArtifact from "@/contracts/artifacts/contracts/OTC.sol/OTC.json";
import { agentRuntime } from "@/lib/agent-runtime";
import { walletToEntityId } from "@/lib/entityId";
import QuoteService from "@/lib/plugin-otc-desk/services/quoteService";
import {
  DealCompletionService,
  type PaymentCurrency,
} from "@/services/database";
import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, type Address } from "viem";
import { getChain, getRpcUrl } from "@/lib/getChain";

export async function POST(request: NextRequest) {
  await agentRuntime.getRuntime();

  const body = await request.json();
  const { quoteId, action, tokenId, consignmentId } = body;

  if (!quoteId) {
    return NextResponse.json(
      { error: "Quote ID is required" },
      { status: 400 },
    );
  }

  if (action === "complete") {
    if (consignmentId && tokenId) {
      const { PriceProtectionService } = await import(
        "@/services/priceProtection"
      );
      const { TokenDB } = await import("@/services/database");
      const { ConsignmentService } = await import(
        "@/services/consignmentService"
      );

      const priceProtection = new PriceProtectionService();
      const consignmentService = new ConsignmentService();
      const token = await TokenDB.getToken(tokenId);

      const priceAtQuote = body.priceAtQuote || 1.0;
      const validationResult = await priceProtection.validateQuotePrice(
        tokenId,
        token.contractAddress,
        token.chain,
        priceAtQuote,
        body.maxPriceDeviationBps || 1000,
      );

      if (!validationResult.isValid) {
        return NextResponse.json(
          {
            error: "Price volatility exceeded maximum allowed",
            details: validationResult,
          },
          { status: 400 },
        );
      }

      await consignmentService.reserveAmount(consignmentId, body.tokenAmount);
      await consignmentService.recordDeal({
        consignmentId,
        quoteId,
        tokenId,
        buyerAddress: body.beneficiary || "",
        amount: body.tokenAmount,
        discountBps: body.discountBps || 1000,
        lockupDays: body.lockupDays || 150,
        offerId: body.offerId,
      });
    }

    const tokenAmountStr = String(body.tokenAmount);
    console.log("[DealCompletion] Received request:", {
      tokenAmount: body.tokenAmount,
      tokenAmountStr,
      paymentCurrency: body.paymentCurrency,
      chain: body.chain,
      offerId: body.offerId,
    });

    // Map SOL to ETH internally since database schema uses ETH/USDC
    const paymentCurrency: PaymentCurrency =
      body.paymentCurrency === "ETH" || body.paymentCurrency === "SOL"
        ? "ETH"
        : "USDC";
    const offerId = String(body.offerId || "");
    const transactionHash = String(body.transactionHash || "");
    const blockNumber = Number(body.blockNumber || 0);
    const chainType = body.chain || "evm";
    const offerAddress = body.offerAddress;
    const beneficiaryOverride = body.beneficiary; // Solana wallet address

    const quoteService =
      agentRuntime.runtime.getService<QuoteService>("QuoteService");

    const quote = await quoteService.getQuoteByQuoteId(quoteId);

    // Update beneficiary AND entityId if provided (for Solana wallets)
    if (beneficiaryOverride) {
      const normalizedBeneficiary = beneficiaryOverride.toLowerCase();
      if (quote.beneficiary !== normalizedBeneficiary) {
        console.log("[DealCompletion] Updating beneficiary and entityId:", {
          oldBeneficiary: quote.beneficiary,
          newBeneficiary: normalizedBeneficiary,
          oldEntityId: quote.entityId,
        });

        // Update both beneficiary and entityId to match
        await quoteService.setQuoteBeneficiary(quoteId, normalizedBeneficiary);

        // Re-fetch to get updated quote
        const updatedQuote = await quoteService.getQuoteByQuoteId(quoteId);
        Object.assign(quote, updatedQuote);

        console.log(
          "[DealCompletion] Updated to new entityId:",
          quote.entityId,
        );
      }
    }

    let totalUsd = 0;
    let discountUsd = 0;
    let discountedUsd = 0;
    let actualPaymentAmount = "0";

    // Handle Solana deals (calculate from quote data, not contract)
    if (chainType === "solana") {
      console.log("[DealCompletion] Processing Solana deal:", {
        quoteId,
        offerId,
        offerAddress,
        tokenAmount: tokenAmountStr,
      });

      const tokenAmount = BigInt(tokenAmountStr);
      const discountBps = quote.discountBps || 1000;
      const tokenPrice = 1.0; // $1.00 from setPrices
      const solPrice = 100.0; // $100 from setPrices

      // Calculate values
      totalUsd = Number(tokenAmount) * tokenPrice;
      discountUsd = totalUsd * (discountBps / 10000);
      discountedUsd = totalUsd - discountUsd;

      // Payment amount based on currency
      if (body.paymentCurrency === "SOL") {
        actualPaymentAmount = (discountedUsd / solPrice).toFixed(6);
      } else {
        actualPaymentAmount = discountedUsd.toFixed(2);
      }

      console.log("[DealCompletion] Calculated Solana deal values:", {
        totalUsd,
        discountUsd,
        discountedUsd,
        actualPaymentAmount,
      });
    } else if (offerId && offerId !== "0") {
      // Fetch on-chain data for EVM deals
      const OTC_ADDRESS = process.env.NEXT_PUBLIC_OTC_ADDRESS as Address;
      const RPC_URL =
        process.env.NEXT_PUBLIC_RPC_URL || "http://127.0.0.1:8545";

      console.log("[DealCompletion] Fetching on-chain data:", {
        offerId,
        OTC_ADDRESS,
        RPC_URL,
      });

      if (OTC_ADDRESS) {
        const chain = getChain();
        const publicClient = createPublicClient({
          chain,
          transport: http(RPC_URL),
        });
        const abi = otcArtifact.abi as any;

        const offerData = (await publicClient.readContract({
          address: OTC_ADDRESS,
          abi,
          functionName: "offers",
          args: [BigInt(offerId)],
        } as any)) as any;

        // Contract returns array: [beneficiary, tokenAmount, discountBps, createdAt, unlockTime,
        //   priceUsdPerToken, ethUsdPrice, currency, approved, paid, fulfilled, cancelled, payer, amountPaid]
        const [
          ,
          tokenAmount,
          discountBps,
          ,
          ,
          priceUsdPerToken,
          ,
          currency,
          ,
          paid,
          ,
          ,
          ,
          amountPaid,
        ] = offerData;

        console.log("[DealCompletion] Offer data from contract:", {
          tokenAmount: tokenAmount?.toString(),
          priceUsdPerToken: priceUsdPerToken?.toString(),
          discountBps: discountBps?.toString(),
          amountPaid: amountPaid?.toString(),
          currency,
          paid,
        });

        // Calculate real USD values from on-chain data
        // tokenAmount is 18 decimals, priceUsdPerToken is 8 decimals
        const tokenAmountWei = BigInt(tokenAmount);
        const priceUsd8 = BigInt(priceUsdPerToken);
        const discountBpsNum = Number(discountBps);
        const amountPaidBig = BigInt(amountPaid);

        // totalUsd = (tokenAmount * priceUsdPerToken) / 1e18 (result in 8 decimals)
        const totalUsd8 = (tokenAmountWei * priceUsd8) / BigInt(1e18);
        totalUsd = Number(totalUsd8) / 1e8;

        // discountUsd = totalUsd * discountBps / 10000
        const discountUsd8 = (totalUsd8 * BigInt(discountBpsNum)) / 10000n;
        discountUsd = Number(discountUsd8) / 1e8;

        // discountedUsd = totalUsd - discountUsd
        const discountedUsd8 = totalUsd8 - discountUsd8;
        discountedUsd = Number(discountedUsd8) / 1e8;

        // Format payment amount based on currency
        if (currency === 0) {
          // ETH (18 decimals)
          actualPaymentAmount = (Number(amountPaidBig) / 1e18).toFixed(6);
        } else {
          // USDC (6 decimals)
          actualPaymentAmount = (Number(amountPaidBig) / 1e6).toFixed(2);
        }

        console.log("[DealCompletion] Calculated from on-chain data:", {
          totalUsd,
          discountUsd,
          discountedUsd,
          actualPaymentAmount,
        });
      }
    } else {
      // No offerId, use quote values (fallback)
      const discountBps = quote.discountBps;
      totalUsd = quote.totalUsd || 0;
      discountUsd = quote.discountUsd || totalUsd * (discountBps / 10000);
      discountedUsd = quote.discountedUsd || totalUsd - discountUsd;
      actualPaymentAmount = quote.paymentAmount || "0";
    }

    // VALIDATE before saving
    if (!tokenAmountStr || tokenAmountStr === "0") {
      console.warn(
        `[DealCompletion] tokenAmount is ${tokenAmountStr} - quote: ${quoteId}`,
      );
      // For old quotes, skip validation and just return current state
      if (quote.status === "executed") {
        console.log(
          "[DealCompletion] Quote already executed, returning current state",
        );
        return NextResponse.json({ success: true, quote });
      }
      throw new Error(
        `CRITICAL: tokenAmount is ${tokenAmountStr} - must be > 0`,
      );
    }
    if (totalUsd === 0 && chainType === "solana") {
      console.warn(
        `[DealCompletion] Solana deal has $0 value - quote: ${quoteId}`,
      );
      if (quote.status === "executed") {
        console.log(
          "[DealCompletion] Quote already executed, returning current state",
        );
        return NextResponse.json({ success: true, quote });
      }
      throw new Error("CRITICAL: Solana deal has $0 value");
    }

    console.log("[DealCompletion] Calling updateQuoteExecution with:", {
      quoteId,
      tokenAmount: tokenAmountStr,
      totalUsd,
      discountUsd,
      discountedUsd,
      paymentCurrency,
      paymentAmount: actualPaymentAmount,
      offerId,
    });

    const updated = await quoteService.updateQuoteExecution(quoteId, {
      tokenAmount: tokenAmountStr,
      totalUsd,
      discountUsd,
      discountedUsd,
      paymentCurrency,
      paymentAmount: actualPaymentAmount,
      offerId,
      transactionHash,
      blockNumber,
    });

    // VERIFY status changed
    if (updated.status !== "executed") {
      throw new Error(
        `CRITICAL: Status is ${updated.status}, expected executed`,
      );
    }

    // Store chain type for proper currency display
    (updated as any).chain = chainType === "solana" ? "solana" : "evm";
    await agentRuntime.runtime.setCache(`quote:${quoteId}`, updated);

    // VERIFY quote is in entity's list, and fix index if missing
    const entityQuotes =
      (await agentRuntime.runtime.getCache<string[]>(
        `entity_quotes:${updated.entityId}`,
      )) || [];
    if (!entityQuotes.includes(quoteId)) {
      console.warn(
        `[Deal Completion] Quote ${quoteId} not in entity ${updated.entityId} list - fixing index`,
      );
      entityQuotes.push(quoteId);
      await agentRuntime.runtime.setCache(
        `entity_quotes:${updated.entityId}`,
        entityQuotes,
      );

      // Also ensure it's in the all_quotes index
      const allQuotes =
        (await agentRuntime.runtime.getCache<string[]>("all_quotes")) || [];
      if (!allQuotes.includes(quoteId)) {
        allQuotes.push(quoteId);
        await agentRuntime.runtime.setCache("all_quotes", allQuotes);
      }
      console.log(`[Deal Completion] ✅ Fixed indexes for quote ${quoteId}`);
    }

    console.log("[Deal Completion] ✅ VERIFIED and completed:", {
      entityId: quote.entityId,
      quoteId,
      tokenAmount: updated.tokenAmount,
      status: updated.status,
      inEntityList: true,
      discountBps: quote.discountBps,
      finalPrice: discountedUsd,
    });

    return NextResponse.json({ success: true, quote: updated });
  }

  if (action === "share") {
    const quoteService =
      agentRuntime.runtime.getService<QuoteService>("QuoteService");
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
  const normalizedWallet = wallet.toLowerCase();
  console.log("[Deal Completion GET] Querying deals:", {
    wallet,
    normalizedWallet,
    entityId,
  });

  const quoteService =
    agentRuntime.runtime.getService<QuoteService>("QuoteService");

  if (!quoteService) {
    console.warn("[Deal Completion GET] QuoteService not ready");
    return NextResponse.json({
      success: true,
      deals: [],
    });
  }

  // Get quotes by entityId
  const quotes = await quoteService.getUserQuoteHistory(entityId, 100);
  console.log("[Deal Completion GET] Got quotes by entityId:", quotes.length);

  // ALSO search by beneficiary address (for quotes indexed under wrong entityId)
  const allQuoteIds =
    (await agentRuntime.runtime.getCache<string[]>("all_quotes")) ?? [];
  const quotesSet = new Set(quotes.map((q) => q.quoteId));

  for (const quoteId of allQuoteIds) {
    if (quotesSet.has(quoteId)) continue; // Already have it

    const quote = await agentRuntime.runtime.getCache<any>(`quote:${quoteId}`);
    if (quote && quote.beneficiary === normalizedWallet) {
      console.log("[Deal Completion GET] Found quote by beneficiary:", quoteId);
      quotes.push(quote);
    }
  }

  console.log("[Deal Completion GET] Total quotes found:", quotes.length);

  // Show active, approved, and executed deals
  // active = quote created, approved = offer created/approved on-chain, executed = paid/fulfilled
  const deals = quotes.filter(
    (quote) =>
      quote.status === "executed" ||
      quote.status === "active" ||
      quote.status === "approved",
  );
  console.log(
    "[Deal Completion GET] Filtered deals (active + approved + executed):",
    deals.length,
  );

  return NextResponse.json({
    success: true,
    deals,
  });
}
