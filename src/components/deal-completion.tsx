"use client";

import { Button } from "@/components/button";
import { createDealShareImage } from "@/utils/share-card";
import { useEffect, useState } from "react";

interface DealCompletionProps {
  quote: {
    quoteId: string;
    entityId: string;
    beneficiary: string;
    tokenAmount: string;
    lockupMonths: number;
    discountBps: number;
    totalUsd: number;
    discountUsd: number;
    discountedUsd: number;
    paymentAmount: string;
    paymentCurrency: string;
    transactionHash?: string;
    offerId?: string;
    status?: string;
    chain?: "evm" | "solana";
  };
}

export function DealCompletion({ quote }: DealCompletionProps) {
  const [shareImageUrl, setShareImageUrl] = useState<string | null>(null);
  const [posted, setPosted] = useState(false);

  // Calculate discount-derived metrics
  const discountPercent = quote.discountBps / 100;
  const projectedYield = 0; // No yield; discount-only instrument
  const roi =
    quote.discountedUsd > 0
      ? (quote.discountUsd / quote.discountedUsd) * 100
      : 0;

  const maturityDate = new Date();
  maturityDate.setMonth(maturityDate.getMonth() + quote.lockupMonths);

  useEffect(() => {
    // Record deal completion in database, only once per mount
    if (!posted) {
      setPosted(true);
      recordDealCompletion();
    }
    // Generate shareable image
    generateShareImage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posted]);

  const recordDealCompletion = async () => {
    // Skip POST if quote is already executed or has no data
    // This prevents errors when viewing old deals with zero values
    if (
      quote.status === "executed" ||
      !quote.tokenAmount ||
      quote.tokenAmount === "0"
    ) {
      console.log(
        "[DealCompletion] Skipping POST - quote already executed or has no data"
      );
      return;
    }

    const response = await fetch("/api/deal-completion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "complete",
        quoteId: quote.quoteId,
        tokenAmount: quote.tokenAmount,
        paymentCurrency: quote.paymentCurrency,
        transactionHash: quote.transactionHash || "pending",
        blockNumber: undefined,
        offerId: quote.offerId || undefined,
        chain: quote.chain || undefined,
      }),
    });

    if (!response.ok) {
      console.error(
        "[DealCompletion] Failed to record:",
        await response.text()
      );
      // Don't throw - this is not critical, just logging
    }
  };

  const generateShareImage = async () => {
    const { dataUrl } = await createDealShareImage({
      tokenAmount: parseFloat(quote.tokenAmount),
      discountBps: quote.discountBps,
      lockupMonths: quote.lockupMonths,
      paymentCurrency: quote.paymentCurrency as "ETH" | "USDC",
    });
    setShareImageUrl(dataUrl);
  };

  const shareToTwitter = async () => {
    // Generate fresh share image
    const { file } = await createDealShareImage({
      tokenAmount: parseFloat(quote.tokenAmount),
      discountBps: quote.discountBps,
      lockupMonths: quote.lockupMonths,
      paymentCurrency: quote.paymentCurrency as "ETH" | "USDC",
    });

    const savingsText =
      quote.discountUsd > 0 ? `$${quote.discountUsd.toFixed(2)}` : "TBD";
    const roiText = roi > 0 ? `${roi.toFixed(1)}%` : "TBD";

    const text = `Just secured ${parseFloat(quote.tokenAmount).toLocaleString()} elizaOS at ${(quote.discountBps / 100).toFixed(0)}% discount on elizaOS OTC Desk!

💰 Saved: ${savingsText}
⏱️ Lockup: ${quote.lockupMonths} months
💎 ROI: ${roiText}`;

    // Try native share first
    if (
      typeof navigator !== "undefined" &&
      (navigator as any).canShare &&
      (navigator as any).canShare({ files: [file] })
    ) {
      await (navigator as any).share({ text, files: [file] });
    } else {
      // Fallback to Twitter intent
      const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(window.location.href)}`;
      window.open(tweetUrl, "_blank");
    }

    // Track share
    const response = await fetch("/api/deal-completion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "share",
        quoteId: quote.quoteId,
        platform: "twitter",
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to track share");
    }
  };

  const downloadImage = async () => {
    const { dataUrl } = await createDealShareImage({
      tokenAmount: parseFloat(quote.tokenAmount),
      discountBps: quote.discountBps,
      lockupMonths: quote.lockupMonths,
      paymentCurrency: quote.paymentCurrency as "ETH" | "USDC",
    });

    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `eliza-deal-${quote.quoteId}.jpg`;
    a.click();
  };

  return (
    <div
      data-testid="deal-completion"
      className="bg-gradient-to-b from-zinc-900 to-black py-8 px-4"
    >
      <div className="max-w-4xl w-full mx-auto">
        {/* Success Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-green-500/20 rounded-full mb-4">
            <svg
              className="w-10 h-10 text-green-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h1 className="text-4xl font-bold text-white mb-2">
            Deal Executed Successfully!
          </h1>
          <p className="text-zinc-400">
            You will receive your tokens after the lockup period
          </p>
          {quote.transactionHash && (
            <a
              href={`https://basescan.org/tx/${quote.transactionHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 text-sm mt-2 inline-block"
            >
              View Transaction →
            </a>
          )}
        </div>

        {/* Share Card Preview */}
        {shareImageUrl && (
          <div className="p-6 mb-6">
            <div className="mb-4 rounded-lg overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={shareImageUrl}
                alt="Share card preview"
                className="w-full h-auto"
              />
            </div>
            <div className="flex flex-wrap gap-3">
              <Button
                onClick={shareToTwitter}
                className="ml-auto flex items-center gap-2 !px-4 !py-2"
                color="blue"
              >
                <svg
                  className="w-5 h-5"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z" />
                </svg>
                Share
              </Button>

              <Button
                onClick={downloadImage}
                className="flex items-center gap-2 border border-zinc-300 dark:border-zinc-700 bg-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800 !px-4 !py-2"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                </svg>
                Download
              </Button>
            </div>
          </div>
        )}

        {/* P&L Card Preview */}
        <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-6 mb-6">
          <h2 className="text-xl font-bold text-white mb-4">
            Your P&L Summary
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left Column - Financial Summary */}
            <div className="space-y-4">
              <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
                <h3 className="text-green-400 font-semibold mb-2">
                  Instant Savings
                </h3>
                <p className="text-3xl font-bold text-white">
                  $
                  {quote.discountUsd > 0 ? quote.discountUsd.toFixed(2) : "N/A"}
                </p>
                <p className="text-sm text-zinc-400 mt-1">
                  {(quote.discountBps / 100).toFixed(2)}% below market price
                </p>
              </div>

              <div className="bg-zinc-800 rounded-lg p-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-zinc-400">You Paid</span>
                  <span className="text-white font-semibold">
                    $
                    {quote.discountedUsd > 0
                      ? quote.discountedUsd.toFixed(2)
                      : "N/A"}
                  </span>
                </div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-zinc-400">Market Value</span>
                  <span className="text-white font-semibold">
                    ${quote.totalUsd > 0 ? quote.totalUsd.toFixed(2) : "N/A"}
                  </span>
                </div>
                <div className="border-t border-zinc-700 pt-2 mt-2">
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-400">Projected Yield</span>
                    <span className="text-green-400 font-semibold">
                      +${projectedYield.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column - Deal Terms */}
            <div className="space-y-4">
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                <h3 className="text-blue-400 font-semibold mb-2">
                  Discount ROI
                </h3>
                <p className="text-3xl font-bold text-white">
                  {roi > 0 ? `${roi.toFixed(1)}%` : "N/A"}
                </p>
                <p className="text-sm text-zinc-400 mt-1">
                  Based solely on discount vs. paid
                </p>
              </div>

              <div className="bg-zinc-800 rounded-lg p-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-zinc-400">Discount</span>
                  <span className="text-white font-semibold">
                    {discountPercent.toFixed(2)}%
                  </span>
                </div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-zinc-400">Lockup Period</span>
                  <span className="text-white font-semibold">
                    {quote.lockupMonths} months
                  </span>
                </div>

                <div className="border-t border-zinc-700 pt-2 mt-2">
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-400">Maturity Date</span>
                    <span className="text-white font-semibold">
                      {maturityDate.toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Token Details */}
          <div className="mt-6 bg-zinc-800 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-zinc-400 text-sm">Token Amount</p>
                <p className="text-2xl font-bold text-white">
                  {parseFloat(quote.tokenAmount).toLocaleString()} elizaOS
                </p>
              </div>
              <div className="text-right">
                <p className="text-zinc-400 text-sm">Payment Method</p>
                <p className="text-xl font-semibold text-white">
                  {quote.paymentAmount}{" "}
                  {quote.chain === "solana" ? "SOL" : quote.paymentCurrency}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
