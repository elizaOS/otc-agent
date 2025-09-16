"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/button";
import { AcceptQuoteModal } from "@/components/accept-quote-modal";
import { useOTC } from "@/hooks/contracts/useOTC";
import { type OTCQuote } from "@/utils/xml-parser";
import { useAccount } from "wagmi";

interface InitialQuoteDisplayProps {
  onAccept?: (tokenAmount: number) => Promise<void>;
  quote?: Partial<OTCQuote> | null;
}

export function InitialQuoteDisplay({
  onAccept,
  quote: propQuote,
}: InitialQuoteDisplayProps) {
  const { minUsdAmount, maxTokenPerOrder, createOffer } = useOTC();
  const [showModal, setShowModal] = useState(false);
  // Partial OTCQuote for when properties might be missing
  type ActiveQuote = Partial<OTCQuote> & {
    apr?: number;
    lockupMonths?: number;
  };
  const [quote, setQuote] = useState<ActiveQuote | null>(null);

  // Load the current quote from API or use prop
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (propQuote) {
        setQuote(propQuote);
        return;
      }
      try {
        const userId =
          typeof window !== "undefined"
            ? localStorage.getItem("otc-desk-user-id")
            : null;
        if (!userId) return;
        const res = await fetch(
          `/api/quote/latest?userId=${encodeURIComponent(userId)}`,
        );
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setQuote(data.quote ?? null);
      } catch {
        // ignore
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [propQuote]);

  // Default fallback if quote is not loaded yet
  const defaultQuote =
    quote ||
    ({
      type: "long-term" as const,
      discountBps: 800,
      lockupMonths: 5,
      duration: 20,
    } as Partial<OTCQuote> & { discountBps?: number; lockupMonths?: number });
  // Ensure values are defined for usage
  const discountPercent = (defaultQuote.discountBps ?? 800) / 100;
  const lockupMonths = defaultQuote.lockupMonths ?? 5;

  const formatTokenAmount = (amount: bigint | undefined) => {
    if (!amount) return "...";
    const num = Number(amount / BigInt(10 ** 18));
    return num.toLocaleString();
  };

  const formatUsdAmount = (amount: bigint | undefined) => {
    if (!amount) return "...";
    // Assuming 8 decimals for USD amounts from contract
    const num = Number(amount) / 10 ** 8;
    return `$${num.toFixed(2)}`;
  };

  const { address } = useAccount();

  const handleAcceptQuote = async (tokenAmount: number) => {
    try {
      // Ensure current quote exists and associate wallet address as beneficiary for verification
      if (quote?.quoteId && address) {
        await fetch(`/api/quote/latest`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            quoteId: quote.quoteId,
            beneficiary: address,
          }),
        });
      }

      // Use terms from current quote where possible
      const discountBps = quote?.discountBps ?? defaultQuote.discountBps ?? 800;
      const lockupMonthsForOffer = (quote?.lockupMonths ?? lockupMonths) || 5;
      const lockupSeconds = BigInt(lockupMonthsForOffer * 30 * 24 * 60 * 60);
      const tokenAmountWei = BigInt(tokenAmount) * BigInt(10 ** 18);

      await createOffer({
        tokenAmountWei,
        discountBps,
        paymentCurrency: quote?.paymentCurrency === "ETH" ? 0 : 1,
        lockupSeconds,
      });

      if (onAccept) {
        await onAccept(tokenAmount);
      }
    } catch (error) {
      throw error;
    }
  };

  return (
    <>
      <div
        data-testid="initial-quote"
        className="w-full max-w-md mx-auto p-6 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900"
      >
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">
            Your Quote
          </h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Review terms and choose your investment amount
          </p>
        </div>

        <div className="space-y-4 mb-6">
          <div className="flex justify-between items-center py-3 border-b border-zinc-200 dark:border-zinc-700">
            <span className="text-sm text-zinc-600 dark:text-zinc-400">
              Discount
            </span>
            <span className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
              {discountPercent}%
            </span>
          </div>

          <div className="flex justify-between items-center py-3 border-b border-zinc-200 dark:border-zinc-700">
            <span className="text-sm text-zinc-600 dark:text-zinc-400">
              Lockup Period
            </span>
            <span className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
              {lockupMonths} months
            </span>
          </div>

          <div className="flex justify-between items-center py-3">
            <span className="text-sm text-zinc-600 dark:text-zinc-400">
              Token Range
            </span>
            <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              100 - {formatTokenAmount(maxTokenPerOrder)} ElizaOS
            </span>
          </div>
        </div>

        <Button
          onClick={() => setShowModal(true)}
          className="w-full"
          color="blue"
        >
          Accept Quote
        </Button>

        <div className="text-xs text-zinc-500 dark:text-zinc-400 space-y-1 mt-4">
          <p>• Minimum order: {formatUsdAmount(minUsdAmount)}</p>
          <p>
            • Maximum tokens per order: {formatTokenAmount(maxTokenPerOrder)}
          </p>
        </div>
      </div>

      <AcceptQuoteModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        initialQuote={quote}
      />
    </>
  );
}
