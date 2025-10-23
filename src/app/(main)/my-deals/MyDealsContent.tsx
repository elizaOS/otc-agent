"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/button";
import { useMultiWallet } from "@/components/multiwallet";
import { MyListingsTab } from "@/components/my-listings-tab";
import { useOTC } from "@/hooks/contracts/useOTC";
import { resumeFreshAuth } from "@/utils/x-share";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/table";
import { Tab } from "@headlessui/react";
import Image from "next/image";
import { OffchainLookupResponseMalformedError } from "node_modules/viem/_types/errors/ccip";
import { ArrowUp, SortAsc } from "lucide-react";
import { cn } from "@/lib/utils";

function formatDate(tsSeconds: bigint): string {
  const d = new Date(Number(tsSeconds) * 1000);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTokenAmount(amountWei: bigint): string {
  const num = Number(amountWei) / 1e18;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(2)}K`;
  return num.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

function getLockupLabel(createdAt: bigint, unlockTime: bigint): string {
  const seconds = Math.max(0, Number(unlockTime) - Number(createdAt));
  const months = Math.max(1, Math.round(seconds / (30 * 24 * 60 * 60)));
  return `${months} month${months === 1 ? "" : "s"}`;
}

export function MyDealsContent() {
  const { activeFamily, evmAddress, solanaPublicKey, isConnected } =
    useMultiWallet();
  const {
    myOffers,
    claim,
    isClaiming,
    isLoading,
    emergencyRefund,
    emergencyRefundsEnabled,
  } = useOTC();
  const [activeTab, setActiveTab] = useState<"purchases" | "listings">(
    "purchases"
  );
  const [sortAsc, setSortAsc] = useState(true);
  const [refunding, setRefunding] = useState<bigint | null>(null);
  const [solanaDeals, setSolanaDeals] = useState<any[]>([]);
  const [evmDeals, setEvmDeals] = useState<any[]>([]);
  const [myListings, setMyListings] = useState<any[]>([]);

  console.log("sorting ->", sortAsc);
  const refreshListings = useCallback(async () => {
    const walletAddr =
      activeFamily === "solana"
        ? solanaPublicKey?.toLowerCase()
        : evmAddress?.toLowerCase();

    if (!walletAddr) {
      setSolanaDeals([]);
      setEvmDeals([]);
      setMyListings([]);
      return;
    }

    const [dealsRes, consignmentsRes] = await Promise.all([
      fetch(`/api/deal-completion?wallet=${walletAddr}`).then((res) =>
        res.json()
      ),
      fetch(`/api/consignments?consigner=${walletAddr}`).then((res) =>
        res.json()
      ),
    ]);

    if (dealsRes.success && dealsRes.deals) {
      if (activeFamily === "solana") {
        setSolanaDeals(dealsRes.deals);
      } else {
        setEvmDeals(dealsRes.deals);
      }
    }

    if (consignmentsRes.success) {
      setMyListings(consignmentsRes.consignments || []);
    }
  }, [activeFamily, solanaPublicKey, evmAddress]);

  useEffect(() => {
    refreshListings();
  }, [refreshListings]);

  const inProgress = useMemo(() => {
    if (activeFamily === "solana") {
      console.log(
        "[MyDeals] Using Solana deals from database:",
        solanaDeals.length
      );

      if (solanaDeals.length === 0) {
        console.log("[MyDeals] No Solana deals found");
        return [];
      }

      const solanaWalletAddress = solanaPublicKey?.toString() || "";

      return solanaDeals.map((deal: any) => {
        const createdTs = deal.createdAt
          ? new Date(deal.createdAt).getTime() / 1000
          : Date.now() / 1000;
        const lockupDays = 180;

        console.log("[MyDeals] Transforming deal:", {
          offerId: deal.offerId,
          tokenAmount: deal.tokenAmount,
          type: typeof deal.tokenAmount,
        });

        const tokenAmountRaw = deal.tokenAmount || "0";
        const tokenAmountBigInt = BigInt(tokenAmountRaw) * BigInt(1e18);
        console.log(
          "[MyDeals] Token amount:",
          tokenAmountRaw,
          "→",
          tokenAmountBigInt.toString()
        );

        return {
          id: BigInt(deal.offerId || "0"),
          beneficiary: deal.beneficiary || solanaWalletAddress,
          // Use 18 decimals to match formatTokenAmount function (which divides by 1e18)
          tokenAmount: tokenAmountBigInt,
          discountBps: Number(deal.discountBps) || 1000,
          createdAt: BigInt(Math.floor(createdTs)),
          unlockTime: BigInt(Math.floor(createdTs + lockupDays * 86400)),
          priceUsdPerToken: BigInt(100_000_000), // $1.00
          ethUsdPrice: BigInt(10_000_000_000), // $100
          currency:
            deal.paymentCurrency === "SOL" || deal.paymentCurrency === "ETH"
              ? 0
              : 1,
          approved: true,
          paid: true,
          fulfilled: false,
          cancelled: false,
          payer: deal.payer || solanaWalletAddress,
          amountPaid: BigInt(deal.paymentAmount || "0"),
          quoteId: deal.quoteId, // Add quoteId for proper linking
        };
      });
    }

    const offers = myOffers ?? [];
    console.log("[MyDeals] Total offers from contract:", offers.length);
    console.log("[MyDeals] Raw offers data:", offers);
    console.log("[MyDeals] Database deals:", evmDeals.length, evmDeals);

    // Strategy: Prioritize database deals (they have quoteId!), supplement with contract data
    const result: any[] = [];
    const processedOfferIds = new Set<string>();

    // 1. Process database deals first (they have quoteId which is what we need!)
    for (const deal of evmDeals) {
      // Only show executed or approved deals (in-progress)
      if (deal.status !== "executed" && deal.status !== "approved") {
        console.log(
          `[MyDeals] Skipping deal ${deal.quoteId} with status: ${deal.status}`
        );
        continue;
      }

      // Find matching contract offer for full data
      const contractOffer = deal.offerId
        ? offers.find((o) => o.id.toString() === deal.offerId)
        : undefined;

      if (contractOffer) {
        // We have both database and contract data - use contract structure with quoteId
        console.log(
          `[MyDeals] Matched DB deal ${deal.quoteId} to contract offer ${deal.offerId}`
        );

        result.push({
          ...contractOffer,
          quoteId: deal.quoteId, // ✅ Add quoteId from database
        });

        if (deal.offerId) {
          processedOfferIds.add(deal.offerId);
        }
      } else {
        // Database deal without matching contract offer (possibly old data or Solana)
        // Transform to match offer structure
        console.log(
          `[MyDeals] Using DB-only deal ${deal.quoteId} (no contract match)`
        );

        const createdTs = deal.createdAt
          ? new Date(deal.createdAt).getTime() / 1000
          : Date.now() / 1000;
        const lockupDays = deal.lockupMonths ? deal.lockupMonths * 30 : 150;
        const tokenAmountRaw = deal.tokenAmount || "0";
        // Database stores plain number (e.g. "1000"), need to convert to wei for display
        // formatTokenAmount() divides by 1e18, so we multiply here
        const tokenAmountBigInt = BigInt(tokenAmountRaw) * BigInt(1e18);

        result.push({
          id: BigInt(deal.offerId || "0"),
          beneficiary: deal.beneficiary || evmAddress || "",
          tokenAmount: tokenAmountBigInt,
          discountBps: BigInt(deal.discountBps || 1000),
          createdAt: BigInt(Math.floor(createdTs)),
          unlockTime: BigInt(Math.floor(createdTs + lockupDays * 86400)),
          priceUsdPerToken: BigInt(100_000_000), // $1.00
          ethUsdPrice: BigInt(10_000_000_000), // $100
          currency: deal.paymentCurrency === "ETH" ? 0 : 1,
          approved: true,
          paid: true,
          fulfilled: false,
          cancelled: false,
          payer: evmAddress || "",
          amountPaid: BigInt(0),
          quoteId: deal.quoteId, // ✅ quoteId from database
        });
      }
    }

    // 2. Add contract offers that aren't in the database yet
    const filteredContractOnly = offers.filter((o) => {
      const offerId = o.id.toString();
      if (processedOfferIds.has(offerId)) {
        return false; // Already processed from database
      }

      // In-progress means paid, not fulfilled, not cancelled
      const isPaid = Boolean(o?.paid);
      const isFulfilled = Boolean(o?.fulfilled);
      const isCancelled = Boolean(o?.cancelled);
      const hasValidId = o?.id !== undefined && o?.id !== null;
      const hasTokenAmount = o?.tokenAmount && o.tokenAmount > 0n;

      console.log(`[MyDeals] Contract-only offer ${offerId}:`, {
        isPaid,
        isFulfilled,
        isCancelled,
        hasValidId,
        hasTokenAmount,
      });

      return (
        hasValidId && hasTokenAmount && isPaid && !isFulfilled && !isCancelled
      );
    });

    // Add contract-only offers (these won't have quoteId, will use fallback)
    result.push(
      ...filteredContractOnly.map((o) => ({
        ...o,
        quoteId: undefined, // No quoteId - will use API fallback
      }))
    );

    console.log("[MyDeals] Final combined deals:", {
      fromDatabase: result.filter((r) => r.quoteId).length,
      fromContractOnly: result.filter((r) => !r.quoteId).length,
      total: result.length,
    });

    return result;
  }, [
    myOffers,
    activeFamily,
    solanaDeals,
    evmDeals,
    solanaPublicKey,
    evmAddress,
  ]);

  const sorted = useMemo(() => {
    const list = [...inProgress];
    list.sort((a, b) => Number(a.unlockTime) - Number(b.unlockTime));
    return sortAsc ? list : list.reverse();
  }, [inProgress, sortAsc]);

  const totalBondedValue = useMemo(() => {
    if (!inProgress.length) return 0;

    const total = inProgress.reduce(
      (acc, deal) => acc + BigInt(deal.tokenAmount || 0n),
      0n
    );

    const totalFormatted = Number(total) / 1e18;

    return totalFormatted;
  }, [inProgress]);

  const averageDiscount = useMemo(() => {
    if (!inProgress.length) return 0;

    const totalDiscount = inProgress.reduce(
      (acc, deal) => acc + Number(deal.discountBps || 0),
      0
    );

    const avgBps = totalDiscount / inProgress.length;
    const avgPercent = avgBps / 100;

    return avgPercent;
  }, [inProgress]);

  // Resume pending share if coming back from OAuth 1.0a
  useMemo(() => {
    (async () => {
      const resumed = await resumeFreshAuth();
      return resumed;
    })();
  }, []);

  const hasWallet = isConnected;

  if (!hasWallet) {
    return (
      <main className="flex-1 min-h-[70vh] flex items-center justify-center">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-semibold">My Deals</h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            Connect your wallet to view your OTC deals.
          </p>
        </div>
      </main>
    );
  }

  return (
    <>
      <main className="flex-1 px-3 sm:px-4 md:px-6 py-4 sm:py-24">
        <div className="bg-[#101010] rounded-xl border-[1px] border-[#353535] min-h-[330px] h-fit max-w-6xl mx-auto space-y-4 sm:space-y-6">
          {/* card header */}
          <div className="w-full flex flex-col gap-y-2 lg:flex-row lg:gap-x-4 px-4 md:px-8 xl:px-12 mt-5">
            <div className="w-full flex flex-row place-items-center lg:w-2/5 border-b border-white/10 pb-4 lg:border-none lg:pb-0">
              <div className="flex flex-col">
                <h1 className="text-white font-normal text-[16px]">
                  Total Bonded Value
                </h1>
                <p className="text-white text-[20px] md:text-[24px] lg:text-[32px] font-bold">
                  {inProgress.length === 0 || isLoading
                    ? "-"
                    : `${totalBondedValue} USD`}
                </p>
              </div>
              <div className="hidden lg:block ml-auto border-l-[1px] border-white/10 h-full" />
            </div>

            <div className="w-full flex flex-row place-items-start lg:w-2/5 border-b border-white/10 pb-4 lg:border-none lg:pb-0">
              <div className="flex flex-col">
                <h1 className="text-white font-normal text-[16px]">
                  Total Deals
                </h1>
                <p className="text-white text-[20px] md:text-[24px] lg:text-[32px] font-bold">
                  {isLoading
                    ? "-"
                    : inProgress.length === 0
                      ? "0"
                      : inProgress.length}
                </p>
              </div>
              <div className="hidden lg:block ml-auto border-l-[1px] border-white/10 h-full" />
            </div>

            <div className="w-full place-items-start lg:w-2/5 pb-4">
              <h1 className="text-white font-normal text-[16px]">
                Average Discount
              </h1>
              <p className="text-white text-[20px] md:text-[24px] lg:text-[32px] font-bold">
                {inProgress.length === 0 || isLoading
                  ? "-"
                  : `${averageDiscount}%`}
              </p>
            </div>
          </div>
          <div className="w-full border-t-2 border-dashed border-white/20" />
          <div className="px-0 pb-6">
            <Table className="w-full place-self-center text-left">
              <TableHeader>
                {sorted.length === 0 ? (
                  <h1 className="place-self-center">no current deals</h1>
                ) : (
                  <TableRow className="border-white/10 hover:bg-transparent">
                    <TableHead className="font-medium w-1/4 px-3">
                      Amount $Eliza
                    </TableHead>
                    <TableHead
                      onClick={() => setSortAsc(!sortAsc)}
                      className="flex flex-row  items-center text-white/70 hover:text-white cursor-pointer font-medium w-1/4 px-4"
                    >
                      Maturity Date
                      <ArrowUp
                        className={cn("ml-2", sortAsc && "rotate-180")}
                        size={15}
                      />
                    </TableHead>
                    <TableHead className="text-white/70 font-medium w-1/4 px-4">
                      Negotiated Discount
                    </TableHead>
                    <TableHead className="text-white/70 font-medium w-1/4 ">
                      Negotiated Maturity
                    </TableHead>
                  </TableRow>
                )}
              </TableHeader>
              {sorted.length === 0 ? null : (
                <div className="w-full border-t-[1px] border-[#121A08]" />
              )}
              <TableBody>
                {sorted.length === 0
                  ? null
                  : sorted.map((o, index) => {
                      const now = Math.floor(Date.now() / 1000);
                      const matured = Number(o.unlockTime) <= now;
                      const discountPct = Number(o.discountBps ?? 0n) / 100;
                      const lockup = getLockupLabel(o.createdAt, o.unlockTime);
                      const uniqueKey =
                        (o as any).quoteId ||
                        o.id.toString() ||
                        `deal-${index}`;

                      return (
                        <TableRow className="border-white/10 hover:bg-white/5">
                          <TableCell className="text-white font-normal text-[12px] w-1/4 p-0">
                            <div className="py-1 px-3">
                              {formatTokenAmount(o.tokenAmount)}
                            </div>
                          </TableCell>

                          <TableCell className="text-white font-normal text-[12px] w-1/4 p-0">
                            <div className="py-1 px-3 whitespace-nowrap">
                              {formatDate(o.unlockTime)}
                            </div>
                          </TableCell>

                          <TableCell className="text-white w-1/4 p-0">
                            <div className="bg-[#0A95421F] text-[12px] py-1 px-3 text-[#78FF75] font-bold h-fit w-fit rounded-xl">
                              {discountPct.toFixed(0)}%
                            </div>
                          </TableCell>

                          <TableCell className="text-white w-1/4 p-0 whitespace-nowrap">
                            <div className="flex items-center whitespace-nowrap text-[12px] bg-[#9393931F] py-1 -ml-5 px-3 text-white font-bold h-fit w-fit rounded-xl">
                              {lockup}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
              </TableBody>
            </Table>
          </div>
        </div>
      </main>
    </>
  );
}
