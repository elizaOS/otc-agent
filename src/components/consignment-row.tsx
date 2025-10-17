"use client";

import { useEffect, useState, useRef } from "react";
import Image from "next/image";
import type { OTCConsignment, Token } from "@/services/database";
import { Button } from "./button";
import { useOTC } from "@/hooks/contracts/useOTC";
import { useAccount } from "wagmi";

interface ConsignmentRowProps {
  consignment: OTCConsignment;
  onUpdate?: () => void;
}

export function ConsignmentRow({ consignment, onUpdate }: ConsignmentRowProps) {
  const [token, setToken] = useState<Token | null>(null);
  const [dealCount, setDealCount] = useState<number>(0);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [withdrawTxHash, setWithdrawTxHash] = useState<string | null>(null);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const fetchedTokenId = useRef<string | null>(null);
  const { withdrawConsignment } = useOTC();
  const { address } = useAccount();

  useEffect(() => {
    // Only fetch if tokenId changed
    if (fetchedTokenId.current === consignment.tokenId) return;

    async function loadData() {
      fetchedTokenId.current = consignment.tokenId;
      const tokenRes = await fetch(`/api/tokens/${consignment.tokenId}`);
      const tokenData = await tokenRes.json();
      if (tokenData.success) setToken(tokenData.token);

      const totalAmount = BigInt(consignment.totalAmount);
      const remainingAmount = BigInt(consignment.remainingAmount);
      const soldAmount = totalAmount - remainingAmount;
      if (soldAmount > 0n && consignment.isFractionalized) {
        const avgDealSize =
          BigInt(consignment.minDealAmount) + BigInt(consignment.maxDealAmount);
        const estimatedDeals = Number(soldAmount / (avgDealSize / 2n));
        setDealCount(Math.max(1, estimatedDeals));
      }
    }
    loadData();
  }, [
    consignment.tokenId,
    consignment.totalAmount,
    consignment.remainingAmount,
    consignment.isFractionalized,
    consignment.minDealAmount,
    consignment.maxDealAmount,
  ]);

  if (!token) return null;

  const formatAmount = (amount: string) => {
    const num = Number(amount) / 1e18;
    if (num >= 1000000) return `${(num / 1000000).toFixed(2)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(2)}K`;
    return num.toFixed(2);
  };

  const percentRemaining =
    (Number(consignment.remainingAmount) / Number(consignment.totalAmount)) *
    100;

  const handlePause = async () => {
    await fetch(`/api/consignments/${consignment.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: consignment.status === "active" ? "paused" : "active",
      }),
    });

    // Refresh parent component state instead of full page reload
    if (onUpdate) {
      onUpdate();
    }
  };

  const handleWithdraw = async () => {
    setWithdrawError(null);
    setWithdrawTxHash(null);

    if (!address) {
      setWithdrawError("Please connect your wallet first");
      return;
    }

    if (!consignment.contractConsignmentId) {
      setWithdrawError("Consignment was not deployed on-chain. Nothing to withdraw.");
      return;
    }

    if (
      !confirm(
        `Withdraw ${formatAmount(consignment.remainingAmount)} ${token?.symbol} from the smart contract?\n\nYou will pay the gas fee for this transaction. This cannot be undone.`,
      )
    )
      return;

    setIsWithdrawing(true);

    try {
      const contractConsignmentId = BigInt(consignment.contractConsignmentId);

      // Execute on-chain withdrawal (user pays gas)
      console.log("[ConsignmentRow] Withdrawing consignment:", contractConsignmentId.toString());
      const txHash = await withdrawConsignment(contractConsignmentId);
      setWithdrawTxHash(txHash as string);
      console.log("[ConsignmentRow] Withdrawal tx submitted:", txHash);

      // Update database status after successful on-chain withdrawal
      const response = await fetch(`/api/consignments/${consignment.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        console.warn("[ConsignmentRow] Failed to update database, but withdrawal succeeded on-chain");
        setWithdrawError("Withdrawal successful on-chain, but database update failed. Your tokens are in your wallet.");
      }

      // Refresh parent component state
      if (onUpdate) {
        onUpdate();
      }

      // Show success message for 3 seconds before clearing
      setTimeout(() => {
        setWithdrawTxHash(null);
      }, 5000);
    } catch (error: unknown) {
      console.error("[ConsignmentRow] Withdrawal failed:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      
      if (errorMessage.includes("rejected") || errorMessage.includes("denied")) {
        setWithdrawError("Transaction was rejected. No changes were made.");
      } else {
        setWithdrawError(`Withdrawal failed: ${errorMessage}`);
      }
    } finally {
      setIsWithdrawing(false);
    }
  };

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-6">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          {token.logoUrl && (
            <Image
              src={token.logoUrl}
              alt={token.symbol}
              width={40}
              height={40}
              className="w-10 h-10 rounded-full"
            />
          )}
          <div>
            <h3 className="font-semibold">{token.symbol}</h3>
            <p className="text-sm text-zinc-500">{token.name}</p>
          </div>
        </div>
        <div className="flex gap-2 items-center">
          {consignment.isNegotiable ? (
            <span className="inline-flex items-center rounded-full bg-blue-600/15 text-blue-700 dark:text-blue-400 px-3 py-1 text-xs font-medium">
              Negotiable
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full bg-zinc-500/10 text-zinc-700 dark:text-zinc-300 px-3 py-1 text-xs font-medium">
              Fixed
            </span>
          )}
          <span
            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
              consignment.status === "active"
                ? "bg-orange-600/15 text-orange-700 dark:text-orange-400"
                : "bg-zinc-500/10 text-zinc-700 dark:text-zinc-300"
            }`}
          >
            {consignment.status}
          </span>
          <Button
            color="red"
            onClick={handleWithdraw}
            disabled={
              consignment.status === "withdrawn" ||
              isWithdrawing ||
              !address ||
              !consignment.contractConsignmentId
            }
            className="!py-2 !px-4 !text-xs bg-zinc-900 text-white"
            title={
              !consignment.contractConsignmentId
                ? "Consignment not deployed on-chain"
                : isWithdrawing
                  ? "Withdrawing..."
                  : "Withdraw remaining tokens"
            }
          >
            {isWithdrawing ? "Withdrawing..." : "Withdraw"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <div>
          <div className="text-sm text-zinc-600 dark:text-zinc-400">Total</div>
          <div className="font-medium">
            {formatAmount(consignment.totalAmount)}
          </div>
        </div>
        <div>
          <div className="text-sm text-zinc-600 dark:text-zinc-400">
            Remaining
          </div>
          <div className="font-medium">
            {formatAmount(consignment.remainingAmount)}
          </div>
        </div>
        <div>
          <div className="text-sm text-zinc-600 dark:text-zinc-400">Deals</div>
          <div className="font-medium">{dealCount}</div>
        </div>
        <div>
          <div className="text-sm text-zinc-600 dark:text-zinc-400">% Sold</div>
          <div className="font-medium">
            {(100 - percentRemaining).toFixed(1)}%
          </div>
        </div>
      </div>

      {/* Withdrawal Status */}
      {(withdrawTxHash || withdrawError) && (
        <div className="mb-3">
          {withdrawTxHash && !withdrawError && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3">
              <div className="flex items-center gap-2 text-green-800 dark:text-green-200">
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                <span className="text-sm font-medium">Withdrawal Successful</span>
              </div>
              <p className="text-xs text-green-700 dark:text-green-300 mt-1 break-all">
                Tx: {withdrawTxHash}
              </p>
            </div>
          )}
          {withdrawError && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <svg
                  className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <p className="text-sm text-red-800 dark:text-red-200">{withdrawError}</p>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="bg-zinc-100 dark:bg-zinc-900 rounded-full h-2">
        <div
          className="bg-orange-600 rounded-full h-2"
          style={{ width: `${100 - percentRemaining}%` }}
        />
      </div>
    </div>
  );
}
