"use client";

import { useMemo, useState } from "react";
import { useAccount } from "wagmi";

import { Button } from "@/components/button";
import { Footer } from "@/components/footer";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/table";
import { useOTC } from "@/hooks/contracts/useOTC";
import { createDealShareImage } from "@/utils/share-card";
import {
  ensureXAuth,
  getXCreds,
  shareOnX,
  setPendingShare,
  resumeFreshAuth,
} from "@/utils/x-share";

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

function computeUsd8(offer: any): bigint {
  try {
    const ta = BigInt(offer?.tokenAmount ?? 0n);
    const priceUsdPerToken = BigInt(offer?.priceUsdPerToken ?? 0n); // 8d
    const dbps = BigInt(offer?.discountBps ?? 0n);
    const usd8 =
      (((ta * priceUsdPerToken) / 10n ** 18n) * (10_000n - dbps)) / 10_000n;
    return usd8;
  } catch {
    return 0n;
  }
}

function formatUsd(amount: number): string {
  // No cents, compact thousands
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(2)}M`;
  if (amount >= 1_000)
    return amount.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return amount.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function getLockupLabel(createdAt: bigint, unlockTime: bigint): string {
  const seconds = Math.max(0, Number(unlockTime) - Number(createdAt));
  const months = Math.max(1, Math.round(seconds / (30 * 24 * 60 * 60)));
  return `${months} month${months === 1 ? "" : "s"}`;
}

export default function Page() {
  const { isConnected } = useAccount();
  const {
    myOffers,
    claim,
    isClaiming,
    isLoading,
    emergencyRefund,
    emergencyRefundsEnabled,
  } = useOTC();
  const [sortAsc, setSortAsc] = useState(true);
  const [refunding, setRefunding] = useState<bigint | null>(null);

  const inProgress = useMemo(
    () =>
      (myOffers ?? []).filter((o) => {
        // In-progress means paid, not fulfilled, not cancelled
        return Boolean(o?.paid) && !o?.fulfilled && !o?.cancelled;
      }),
    [myOffers],
  );

  const sorted = useMemo(() => {
    const list = [...inProgress];
    list.sort((a, b) => Number(a.unlockTime) - Number(b.unlockTime));
    return sortAsc ? list : list.reverse();
  }, [inProgress, sortAsc]);

  const stats = useMemo(() => {
    if (inProgress.length === 0)
      return { totalUsd: 0, totalDeals: 0, avgDiscountPct: 0 };
    let totalUsd8 = 0n;
    let totalDiscountBps = 0;
    for (const o of inProgress) {
      totalUsd8 += computeUsd8(o);
      totalDiscountBps += Number(o.discountBps ?? 0n);
    }
    const totalUsd = Number(totalUsd8) / 1e8;
    const avgDiscountPct = totalDiscountBps / inProgress.length / 100;
    return { totalUsd, totalDeals: inProgress.length, avgDiscountPct };
  }, [inProgress]);

  // Resume pending share if coming back from OAuth 1.0a
  useMemo(() => {
    (async () => {
      const resumed = await resumeFreshAuth();
      return resumed;
    })();
  }, []);

  if (!isConnected) {
    return (
      <>
        <main className="flex-1 min-h-[70vh] flex items-center justify-center">
          <div className="text-center space-y-4">
            <h1 className="text-2xl font-semibold">My Deals</h1>
            <p className="text-zinc-600 dark:text-zinc-400">
              Connect your wallet to view your OTC deals.
            </p>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  return (
    <>
      <main className="flex-1 px-4 sm:px-6 py-6">
        <div className="max-w-5xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold">My Deals</h1>
          </div>

          {isLoading ? (
            <div className="text-zinc-600 dark:text-zinc-400">
              Loading deals…
            </div>
          ) : inProgress.length === 0 ? (
            <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-6 text-zinc-600 dark:text-zinc-400">
              No active deals. Create one from the chat to get started.
            </div>
          ) : (
            <>
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-zinc-200 dark:divide-zinc-800">
                  <div className="p-6">
                    <div className="text-sm text-zinc-500 dark:text-zinc-400">
                      Total Value
                    </div>
                    <div className="mt-2 text-3xl font-semibold flex items-baseline gap-2">
                      <span>{formatUsd(stats.totalUsd)}</span>
                      <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                        USD
                      </span>
                    </div>
                  </div>
                  <div className="p-6">
                    <div className="text-sm text-zinc-500 dark:text-zinc-400">
                      Total Deals
                    </div>
                    <div className="mt-2 text-3xl font-semibold">
                      {stats.totalDeals}
                    </div>
                  </div>
                  <div className="p-6">
                    <div className="text-sm text-zinc-500 dark:text-zinc-400">
                      Average Discount
                    </div>
                    <div className="mt-2 text-3xl font-semibold">
                      {stats.avgDiscountPct.toFixed(1)}%
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                <Table striped>
                  <TableHead>
                    <TableRow>
                      <TableHeader>Amount (ElizaOS)</TableHeader>
                      <TableHeader>
                        <button
                          className="inline-flex items-center gap-1 hover:text-zinc-900 dark:hover:text-white"
                          onClick={() => setSortAsc((v) => !v)}
                        >
                          <span>Maturity Date</span>
                          <span className="text-xs">
                            {sortAsc ? "\u2193" : "\u2191"}
                          </span>
                        </button>
                      </TableHeader>
                      <TableHeader>Discount</TableHeader>
                      <TableHeader>Lockup Duration</TableHeader>
                      <TableHeader className="text-right">Action</TableHeader>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {sorted.map((o) => {
                      const now = Math.floor(Date.now() / 1000);
                      const matured = Number(o.unlockTime) <= now;
                      const discountPct = Number(o.discountBps ?? 0n) / 100;
                      const lockup = getLockupLabel(o.createdAt, o.unlockTime);
                      return (
                        <TableRow key={o.id.toString()}>
                          <TableCell>
                            {formatTokenAmount(o.tokenAmount)}
                          </TableCell>
                          <TableCell>{formatDate(o.unlockTime)}</TableCell>
                          <TableCell>
                            <span className="inline-flex items-center rounded-full bg-emerald-600/15 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 text-xs font-medium">
                              {discountPct.toFixed(0)}%
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className="inline-flex items-center rounded-full bg-zinc-500/10 text-zinc-700 dark:text-zinc-300 px-2 py-0.5 text-xs font-medium">
                              {lockup}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex gap-2 justify-end">
                              <Button
                                color={
                                  (matured ? "emerald" : "zinc") as
                                    | "emerald"
                                    | "zinc"
                                }
                                disabled={!matured || isClaiming}
                                onClick={async () => {
                                  await claim(o.id);
                                }}
                              >
                                {matured
                                  ? isClaiming
                                    ? "Withdrawing…"
                                    : "Withdraw"
                                  : "Locked"}
                              </Button>
                              {/* Emergency refund button - show if enabled and deal is stuck */}
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
                                      try {
                                        setRefunding(o.id);
                                        await emergencyRefund(o.id);
                                        alert("Refund successful!");
                                      } catch (error: any) {
                                        alert(
                                          `Refund failed: ${error.message || "Unknown error"}`,
                                        );
                                      } finally {
                                        setRefunding(null);
                                      }
                                    }
                                  }}
                                  title="Request emergency refund (90+ days)"
                                >
                                  {refunding === o.id
                                    ? "Refunding..."
                                    : "Refund"}
                                </Button>
                              )}
                              <Button
                                color="zinc"
                                onClick={async () => {
                                  try {
                                    const discountPct =
                                      Number(o.discountBps ?? 0n) / 100;
                                    const months = Math.max(
                                      1,
                                      Math.round(
                                        (Number(o.unlockTime) -
                                          Number(o.createdAt)) /
                                          (30 * 24 * 60 * 60),
                                      ),
                                    );
                                    const tokenAmount =
                                      Number(o.tokenAmount) / 1e18;
                                    const shareText = `I just completed an OTC deal for ${tokenAmount.toLocaleString()} ElizaOS at ${discountPct.toFixed(0)}% with ${months}-month lockup. #ElizaOS #OTC`;
                                    const { dataUrl } =
                                      await createDealShareImage({
                                        tokenAmount,
                                        discountBps: Number(
                                          o.discountBps ?? 0n,
                                        ),
                                        lockupMonths: months,
                                        paymentCurrency:
                                          Number(o.currency ?? 0) === 0
                                            ? "ETH"
                                            : "USDC",
                                      });
                                    const creds = getXCreds();
                                    if (
                                      !creds?.oauth1Token ||
                                      !creds?.oauth1TokenSecret
                                    ) {
                                      setPendingShare({
                                        text: shareText,
                                        dataUrl,
                                      });
                                      ensureXAuth({ text: shareText, dataUrl });
                                    } else {
                                      await shareOnX(shareText, dataUrl, creds);
                                    }
                                  } catch {
                                    // ignore
                                  }
                                }}
                              >
                                Share
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
