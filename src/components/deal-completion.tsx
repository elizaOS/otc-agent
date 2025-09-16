"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/button";
import { useRouter } from "next/navigation";
import { DealCompletionService } from "@/services/database";
import { createDealShareImage } from "@/utils/share-card";

interface DealCompletionProps {
  quote: {
    quoteId: string;
    userId: string;
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
  };
}

export function DealCompletion({ quote }: DealCompletionProps) {
  const router = useRouter();
  const [shareImageUrl, setShareImageUrl] = useState<string>("");
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [shareCount, setShareCount] = useState(0);

  // Calculate discount-derived metrics
  const discountPercent = quote.discountBps / 100;
  const projectedYield = 0; // No yield; discount-only instrument
  const breakEvenDays = Math.ceil(0);
  const roi = (quote.discountUsd / quote.discountedUsd) * 100;

  const maturityDate = new Date();
  maturityDate.setMonth(maturityDate.getMonth() + quote.lockupMonths);

  useEffect(() => {
    // Record deal completion in database
    recordDealCompletion();
    // Generate shareable image
    generateShareImage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const recordDealCompletion = async () => {
    try {
      await DealCompletionService.recordDealCompletion({
        userId: quote.userId,
        quoteId: quote.quoteId,
        transactionHash: quote.transactionHash || "pending",
        volumeUsd: quote.totalUsd,
        savedUsd: quote.discountUsd,
      });
    } catch (error) {
      console.error("Failed to record deal completion:", error);
    }
  };

  const generateShareImage = async () => {
    setIsGeneratingImage(true);
    try {
      const { dataUrl } = await createDealShareImage({
        tokenAmount: parseFloat(quote.tokenAmount),
        discountBps: quote.discountBps,
        lockupMonths: quote.lockupMonths,
        paymentCurrency: quote.paymentCurrency as "ETH" | "USDC",
      });
      setShareImageUrl(dataUrl);
    } catch (error) {
      console.error("Failed to generate share image:", error);
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const shareToTwitter = async () => {
    try {
      // Generate fresh share image
      const { file, dataUrl } = await createDealShareImage({
        tokenAmount: parseFloat(quote.tokenAmount),
        discountBps: quote.discountBps,
        lockupMonths: quote.lockupMonths,
        paymentCurrency: quote.paymentCurrency as "ETH" | "USDC",
      });

      const text = `Just secured ${parseFloat(quote.tokenAmount).toLocaleString()} ElizaOS at ${(quote.discountBps / 100).toFixed(0)}% discount on ElizaOS OTC Desk!

💰 Saved: $${quote.discountUsd.toFixed(2)}
⏱️ Lockup: ${quote.lockupMonths} months
💎 ROI: ${roi.toFixed(1)}%`;

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
      await DealCompletionService.incrementShareCount(quote.quoteId, "twitter");
      setShareCount(shareCount + 1);
    } catch (error) {
      console.error("Failed to share:", error);
    }
  };

  const downloadImage = () => {
    createDealShareImage({
      tokenAmount: parseFloat(quote.tokenAmount),
      discountBps: quote.discountBps,
      lockupMonths: quote.lockupMonths,
      paymentCurrency: quote.paymentCurrency as "ETH" | "USDC",
    })
      .then(({ dataUrl }) => {
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = `eliza-deal-${quote.quoteId}.jpg`;
        a.click();
      })
      .catch(console.error);
  };

  const negotiateNewDeal = () => {
    router.push("/");
  };

  return (
    <div
      data-testid="deal-completion"
      className="min-h-screen bg-gradient-to-b from-zinc-900 to-black flex items-center justify-center p-4"
    >
      <div className="max-w-4xl w-full">
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
          <p className="text-zinc-400">Your quote has been created on-chain</p>
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
                  ${quote.discountUsd.toFixed(2)}
                </p>
                <p className="text-sm text-zinc-400 mt-1">
                  {(quote.discountBps / 100).toFixed(2)}% below market price
                </p>
              </div>

              <div className="bg-zinc-800 rounded-lg p-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-zinc-400">You Paid</span>
                  <span className="text-white font-semibold">
                    ${quote.discountedUsd.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-zinc-400">Market Value</span>
                  <span className="text-white font-semibold">
                    ${quote.totalUsd.toFixed(2)}
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
                  {roi.toFixed(1)}%
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
                  {parseFloat(quote.tokenAmount).toLocaleString()} ElizaOS
                </p>
              </div>
              <div className="text-right">
                <p className="text-zinc-400 text-sm">Payment Method</p>
                <p className="text-xl font-semibold text-white">
                  {quote.paymentAmount} {quote.paymentCurrency}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Share Actions */}
        <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-6">
          <h3 className="text-lg font-semibold text-white mb-4">
            Share Your Success
          </h3>

          <div className="flex flex-wrap gap-3">
            <Button
              onClick={shareToTwitter}
              className="flex items-center gap-2"
              color="blue"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z" />
              </svg>
              Share on X
            </Button>

            <Button
              onClick={downloadImage}
              className="flex items-center gap-2 border border-zinc-300 dark:border-zinc-700 bg-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800"
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
              Download Deal Card
            </Button>

            {shareCount > 0 && (
              <span className="text-zinc-400 text-sm self-center ml-2">
                Shared {shareCount} time{shareCount > 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>

        {/* Next Actions */}
        <div className="mt-8 text-center">
          <Button onClick={negotiateNewDeal} className="px-8 py-3 text-lg">
            Negotiate Another Deal
          </Button>
          <p className="text-zinc-500 text-sm mt-4">
            Ready for your next opportunity? Let&apos;s negotiate!
          </p>
        </div>
      </div>
    </div>
  );
}
