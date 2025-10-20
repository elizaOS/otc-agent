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

  // Resume pending share if coming back from OAuth 1.0a
  useMemo(() => {
    (async () => {
      const resumed = await resumeFreshAuth();
      return resumed;
    })();
  }, []);

  const hasWallet = isConnected;

  console.log("myu offers ->", myOffers);

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

  console.log(sorted);
  return (
    <>
      <main className="flex-1 px-3 sm:px-4 md:px-6 py-4 sm:py-6">
        {/* <div className="max-w-5xl mx-auto space-y-4 sm:space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-xl sm:text-2xl font-semibold">My Deals</h1>
          </div>

          <div className="flex gap-3 sm:gap-4 border-b border-zinc-200 dark:border-zinc-800 overflow-x-auto">
            <button
              onClick={() => setActiveTab("purchases")}
              className={`px-3 sm:px-4 py-2 font-medium transition-colors whitespace-nowrap text-sm sm:text-base ${
                activeTab === "purchases"
                  ? "text-orange-600 border-b-2 border-orange-600"
                  : "text-zinc-600 dark:text-zinc-400"
              }`}
            >
              My Purchases
            </button>
            <button
              onClick={() => setActiveTab("listings")}
              className={`px-3 sm:px-4 py-2 font-medium transition-colors whitespace-nowrap text-sm sm:text-base ${
                activeTab === "listings"
                  ? "text-orange-600 border-b-2 border-orange-600"
                  : "text-zinc-600 dark:text-zinc-400"
              }`}
            >
              My Listings
            </button>
          </div>

          {activeTab === "listings" ? (
            <MyListingsTab listings={myListings} onRefresh={refreshListings} />
          ) : isLoading ? (
            <div className="text-zinc-600 dark:text-zinc-400">
              Loading deals…
            </div>
          ) : inProgress.length === 0 ? (
            <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-6 text-zinc-600 dark:text-zinc-400">
              No active deals. Create one from the chat to get started.
            </div>
          ) : (
            <div className="space-y-4">
              {sorted.map((o, index) => {
                const now = Math.floor(Date.now() / 1000);
                const matured = Number(o.unlockTime) <= now;
                const discountPct = Number(o.discountBps ?? 0n) / 100;
                const lockup = getLockupLabel(o.createdAt, o.unlockTime);
                const uniqueKey =
                  (o as any).quoteId || o.id.toString() || `deal-${index}`;

                return (
                  <div
                    key={uniqueKey}
                    className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4 sm:p-6 space-y-4"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div>
                        <div className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">
                          Amount
                        </div>
                        <div className="font-semibold">
                          {formatTokenAmount(o.tokenAmount)} tokens
                        </div>
                      </div>

                      <div>
                        <div className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">
                          Maturity Date
                        </div>
                        <div className="font-semibold">
                          {formatDate(o.unlockTime)}
                        </div>
                      </div>

                      <div>
                        <div className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">
                          Discount
                        </div>
                        <span className="inline-flex items-center rounded-full bg-orange-600/15 text-orange-700 dark:text-orange-400 px-2 py-0.5 text-xs font-medium">
                          {discountPct.toFixed(0)}%
                        </span>
                      </div>

                      <div>
                        <div className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">
                          Lockup Duration
                        </div>
                        <span className="inline-flex items-center rounded-full bg-zinc-500/10 text-zinc-700 dark:text-zinc-300 px-2 py-0.5 text-xs font-medium">
                          {lockup}
                        </span>
                      </div>

                      <div>
                        <div className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">
                          Status
                        </div>
                        {matured ? (
                          <span className="inline-flex items-center rounded-full bg-orange-600/15 text-orange-700 dark:text-orange-400 px-2 py-0.5 text-xs font-medium">
                            Ready to Claim
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-amber-600/15 text-amber-700 dark:text-amber-400 px-2 py-0.5 text-xs font-medium">
                            Locked
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
                      <Button
                        color="zinc"
                        onClick={async () => {
                          if (o.quoteId) {
                            window.location.href = `/deal/${o.quoteId}`;
                            return;
                          }

                          console.log(
                            "[MyDeals] No quoteId, looking up by offerId:",
                            o.id?.toString(),
                          );

                          const response = await fetch(
                            `/api/quote/by-offer/${o.id}`,
                          );
                          if (response.redirected) {
                            window.location.href = response.url;
                          } else if (response.ok) {
                            const data = await response.json();
                            if (data.quoteId) {
                              window.location.href = `/deal/${data.quoteId}`;
                            } else {
                              throw new Error("No quoteId in response");
                            }
                          } else {
                            throw new Error(
                              `Failed to lookup quote: ${response.status}`,
                            );
                          }
                        }}
                        className="!px-4 !py-2"
                      >
                        View Deal
                      </Button>
                      {matured && (
                        <Button
                          color="orange"
                          disabled={isClaiming}
                          onClick={async () => {
                            await claim(o.id);
                          }}
                          className="!px-4 !py-2"
                        >
                          {isClaiming ? "Withdrawing…" : "Withdraw"}
                        </Button>
                      )}
                      {emergencyRefundsEnabled && !matured && (
                        <Button
                          color="red"
                          disabled={refunding === o.id}
                          onClick={async () => {
                            const createdAt = Number(o.createdAt);
                            const now = Math.floor(Date.now() / 1000);
                            const daysSinceCreation =
                              (now - createdAt) / (24 * 60 * 60);

                            if (daysSinceCreation < 90) {
                              alert(
                                `Emergency refund available in ${Math.ceil(90 - daysSinceCreation)} days`,
                              );
                              return;
                            }

                            if (
                              confirm(
                                "Request emergency refund? This will cancel the deal and return your payment.",
                              )
                            ) {
                              setRefunding(o.id);
                              await emergencyRefund(o.id);
                              alert("Refund successful!");
                            }
                          }}
                          title="Request emergency refund (90+ days)"
                          className="!px-4 !py-2"
                        >
                          {refunding === o.id ? "Refunding..." : "Refund"}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div> */}
        <div className="bg-[#101010] rounded-xl border-[1px] border-[#353535] min-h-[330px] h-fit max-w-6xl mx-auto space-y-4 sm:space-y-6">
          {/* card header */}
          <div className="px-4 md:px-8 xl:px-12 gap-x-4 mt-5 flex flex-row w-full">
            <div className="w-full flex flex-row place-items-center lg:w-2/5">
              <div className="flex flex-col">
                <h1 className="text-white font-normal text-[16px]">
                  Total Bonded Value
                </h1>
                <p className="text-white text-[20px] md:text-[24px] lg:text-[32px] font-bold">
                  32,202{" "}
                  <span className="text-white text-[16px] font-bold">USD</span>
                </p>
              </div>
              <div className="hidden lg:block ml-auto border-l-[1px] border-white/10 h-full" />
            </div>

            <div className="w-full flex flex-row place-items-start lg:w-2/5">
              <div className="flex flex-col">
                <h1 className="text-white font-normal text-[16px]">
                  Total Deals
                </h1>
                <p className="text-white text-[20px] md:text-[24px] lg:text-[32px] font-bold">
                  3
                </p>
              </div>
              <div className="hidden lg:block ml-auto border-l-[1px] border-white/10 h-full" />
            </div>

            <div className="w-full place-items-start lg:w-2/5">
              <h1 className="text-white font-normal text-[16px]">
                Average Discount
              </h1>
              <p className="text-white text-[20px] md:text-[24px] lg:text-[32px] font-bold">
                18.3%
              </p>
            </div>
          </div>
          <div className="w-full border-t-2 border-dashed border-white/20" />
          {/* card content(table) */}
          {/* card content(table) */}
          <div className="px-0 pb-6">
            <Table className="w-full place-self-center text-left">
              <TableHeader>
                <TableRow className="border-white/10 hover:bg-transparent">
                  {/* Added consistent padding to headers */}
                  <TableHead className="text-red-500 font-medium w-1/4 px-3">
                    Amount $Eliza
                  </TableHead>
                  <TableHead className="text-white/70 font-medium w-1/4 px-4">
                    Maturity Date
                  </TableHead>
                  <TableHead className="text-white/70 font-medium w-1/4 px-4">
                    Negotiated Discount
                  </TableHead>
                  <TableHead className="text-white/70 font-medium w-1/4 ">
                    Negotiated Maturity
                  </TableHead>
                </TableRow>
              </TableHeader>
              <div className="w-full border-t-[1px] border-[#121A08]" />
              <TableBody>
                <TableRow className="border-white/10 hover:bg-white/5 ">
                  <TableCell className="text-white font-normal text-[12px] w-1/4 p-0">
                    <div className="py-1 px-3">10,952</div>
                  </TableCell>

                  <TableCell className="text-white font-normal text-[12px] w-1/4 p-0">
                    <div className="py-1 px-3">6 months</div>
                  </TableCell>

                  <TableCell className="text-white w-1/4 p-0">
                    <div className="bg-[#0A95421F] py-1 px-3 text-[#78FF75] font-bold h-fit w-fit rounded-xl">
                      21%
                    </div>
                  </TableCell>

                  <TableCell className="text-white w-1/4 p-0">
                    <div className="bg-[#9393931F] py-1 px-3 text-white font-bold h-fit w-fit rounded-xl">
                      240 days
                    </div>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>
      </main>
    </>
  );
}
