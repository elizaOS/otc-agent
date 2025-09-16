"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/button";
import { Dialog } from "@/components/dialog";
import { useOTC } from "@/hooks/contracts/useOTC";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { NetworkConnectButton } from "@/components/network-connect";
import { useAccount, useChainId, useBalance } from "wagmi";
import { useSignMessage } from "wagmi";
import { useMultiWallet } from "@/components/multiwallet";
import { useRouter } from "next/navigation";
import otcArtifact from "@/contracts/artifacts/contracts/OTC.sol/OTC.json";
import { createPublicClient, http } from "viem";
import { base, hardhat } from "viem/chains";
import type { Abi } from "viem";
import type { OTCQuote } from "@/utils/xml-parser";

interface AcceptQuoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialQuote?: Partial<OTCQuote> | null;
  onComplete?: (data: { offerId: bigint; txHash?: `0x${string}` }) => void;
}

type StepState =
  | "amount"
  | "sign"
  | "creating"
  | "await_approval"
  | "paying"
  | "complete";

const ONE_MILLION = 1_000_000; // Token cap
const MIN_TOKENS = 100; // UX minimum

export function AcceptQuoteModal({
  isOpen,
  onClose,
  initialQuote,
  onComplete,
}: AcceptQuoteModalProps) {
  const { isConnected, address } = useAccount();
  const {
    activeFamily,
    paymentPairLabel,
    isConnected: unifiedConnected,
  } = useMultiWallet();
  const chainId = useChainId();
  const router = useRouter();
  const {
    otcAddress,
    createOffer,
    fulfillOffer,
    approveUsdc,
    defaultUnlockDelaySeconds,
    usdcAddress,
    minUsdAmount,
    maxTokenPerOrder,
  } = useOTC();

  const { signMessageAsync } = useSignMessage();

  const abi = useMemo(() => otcArtifact.abi as Abi, []);
  const rpcUrl =
    (process.env.NEXT_PUBLIC_RPC_URL as string | undefined) ||
    "http://127.0.0.1:8545";
  const chain = chainId === hardhat.id ? hardhat : base;
  const publicClient = useMemo(
    () => createPublicClient({ chain, transport: http(rpcUrl) }),
    [chain, rpcUrl],
  );

  // Local UI state
  const [tokenAmount, setTokenAmount] = useState<number>(
    Math.min(
      ONE_MILLION,
      Math.max(
        MIN_TOKENS,
        initialQuote?.tokenAmount ? Number(initialQuote.tokenAmount) : 1000,
      ),
    ),
  );
  const [currency, setCurrency] = useState<"ETH" | "USDC" | "SOL">(
    (initialQuote?.paymentCurrency as any) === "USDC"
      ? "USDC"
      : activeFamily === "solana"
        ? "SOL"
        : "ETH",
  );
  const [step, setStep] = useState<StepState>("amount");
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isSolanaActive = activeFamily === "solana";

  // Wallet balances for display and MAX calculation
  const ethBalance = useBalance({ address });
  const usdcBalance = useBalance({ address, token: usdcAddress as any });

  useEffect(() => {
    if (!isOpen) {
      setStep("amount");
      setIsProcessing(false);
      setError(null);
      setCurrency(
        (initialQuote?.paymentCurrency as any) === "USDC"
          ? "USDC"
          : activeFamily === "solana"
            ? "SOL"
            : "ETH",
      );
      setTokenAmount(
        Math.min(
          ONE_MILLION,
          Math.max(
            MIN_TOKENS,
            initialQuote?.tokenAmount ? Number(initialQuote.tokenAmount) : 1000,
          ),
        ),
      );
    }
  }, [isOpen, initialQuote]);

  // Prefer EVM when both are connected and modal opens
  useEffect(() => {
    try {
      const isOpenNow = isOpen;
      if (!isOpenNow) return;
      // If both connected, prefer EVM
      if (activeFamily === "solana") {
        // Keep currency coherent with active family
        setCurrency("SOL");
      }
    } catch {}
  }, [isOpen, activeFamily]);

  const discountBps = useMemo(() => {
    const fromQuote = initialQuote?.discountBps;
    if (typeof fromQuote === "number" && !Number.isNaN(fromQuote)) {
      return fromQuote;
    }
    // Fallback 10% discount
    return 1000;
  }, [initialQuote?.discountBps]);

  const lockupDays = useMemo(() => {
    if (typeof initialQuote?.lockupDays === "number")
      return initialQuote.lockupDays;
    if (typeof initialQuote?.lockupMonths === "number")
      return Math.max(1, initialQuote.lockupMonths * 30);
    return Number(
      defaultUnlockDelaySeconds ? defaultUnlockDelaySeconds / 86400n : 180n,
    );
  }, [
    initialQuote?.lockupDays,
    initialQuote?.lockupMonths,
    defaultUnlockDelaySeconds,
  ]);

  const formatUsd = (n: number) =>
    `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

  const contractMaxTokens = useMemo(() => {
    try {
      const v = maxTokenPerOrder
        ? Number(maxTokenPerOrder / 10n ** 18n)
        : ONE_MILLION;
      return Math.max(MIN_TOKENS, Math.min(ONE_MILLION, v));
    } catch {
      return ONE_MILLION;
    }
  }, [maxTokenPerOrder]);

  const clampAmount = (value: number) =>
    Math.min(contractMaxTokens, Math.max(MIN_TOKENS, Math.floor(value)));

  const handleProceed = () => {
    if (!unifiedConnected) return;
    setStep("sign");
  };

  async function readNextOfferId(): Promise<bigint> {
    if (!otcAddress) throw new Error("Missing OTC address");
    const id = (await publicClient.readContract({
      address: otcAddress as `0x${string}`,
      abi,
      functionName: "nextOfferId",
      args: [],
    })) as bigint;
    return id;
  }

  async function readOffer(offerId: bigint): Promise<any> {
    if (!otcAddress) throw new Error("Missing OTC address");
    return (await publicClient.readContract({
      address: otcAddress as `0x${string}`,
      abi,
      functionName: "offers",
      args: [offerId],
    })) as any;
  }

  async function wait(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }

  async function waitForApproval(offerId: bigint, timeoutMs = 60_000) {
    const start = Date.now();
    // Poll every 2s until approved
    while (Date.now() - start < timeoutMs) {
      const offer = await readOffer(offerId);
      if (offer?.approved) return offer;
      await wait(2000);
    }
    throw new Error("Offer approval timed out");
  }

  async function fulfillWithRetry(
    offerId: bigint,
    computePayment: (offer: any) => { wei?: bigint; usdc?: bigint },
  ) {
    const maxAttempts = 3;
    let attempt = 0;
    // Exponential backoff 1s, 2s, 4s
    while (attempt < maxAttempts) {
      const offer = await readOffer(offerId);
      if (offer?.paid || offer?.fulfilled) return;

      const { wei, usdc } = computePayment(offer);
      try {
        if (wei && wei > 0n) {
          await fulfillOffer(offerId, wei);
        } else if (usdc && usdc > 0n) {
          await approveUsdc(usdc);
          await fulfillOffer(offerId);
        } else {
          throw new Error("Unable to compute payment amount");
        }
        // After sending, wait briefly and confirm state
        await wait(3000);
        const after = await readOffer(offerId);
        if (after?.paid || after?.fulfilled) return;
      } catch (e) {
        // continue to retry
      }
      await wait(1000 * Math.pow(2, attempt));
      attempt += 1;
    }
    // Final check before giving up
    const finalOffer = await readOffer(offerId);
    if (!(finalOffer?.paid || finalOffer?.fulfilled)) {
      throw new Error("Payment did not complete. Please try again.");
    }
  }

  const handleConfirm = async () => {
    if (!isConnected || !otcAddress || !address) return;
    setError(null);
    setIsProcessing(true);
    setStep("creating");

    try {
      // Persist beneficiary for the negotiated quote so the worker can match strictly
      try {
        if (initialQuote?.quoteId) {
          await fetch("/api/quote/latest", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              quoteId: initialQuote.quoteId,
              beneficiary: address,
            }),
          });
        }
      } catch {}

      // Sign the terms for auditability
      const msg = `I agree to purchase ${tokenAmount} ElizaOS at ${(
        discountBps / 100
      ).toFixed(
        2,
      )}% discount with ${lockupDays} days lockup, paying in ${currency}. Wallet: ${address}`;
      try {
        await signMessageAsync({
          account: address as `0x${string}`,
          message: msg,
        });
      } catch {
        // user may reject; continue without signature but record intent
      }

      // Determine new offer id ahead of time
      const nextId = await readNextOfferId();
      const newOfferId = nextId; // offerId will equal current nextOfferId

      // Create offer
      const tokenAmountWei = BigInt(tokenAmount) * 10n ** 18n;
      const lockupSeconds = BigInt(lockupDays * 24 * 60 * 60);
      const paymentCurrency = currency === "ETH" ? 0 : 1;
      await createOffer({
        tokenAmountWei,
        discountBps,
        paymentCurrency,
        lockupSeconds,
      });

      setStep("await_approval");
      const approvedOffer = await waitForApproval(newOfferId, 90_000);

      setStep("paying");
      // Compute payment from on-chain captured pricing
      const computePayment = (offer: any) => {
        try {
          const ta = BigInt(offer?.tokenAmount ?? 0n);
          const priceUsdPerToken = BigInt(offer?.priceUsdPerToken ?? 0n); // 8d
          const dbps = BigInt(offer?.discountBps ?? 0n);
          const usd8 =
            (((ta * priceUsdPerToken) / 10n ** 18n) * (10_000n - dbps)) /
            10_000n;
          if (Number(offer?.currency ?? 0) === 0) {
            const ethUsd = BigInt(offer?.ethUsdPrice ?? 0n); // 8d
            const wei = (usd8 * 10n ** 18n) / (ethUsd === 0n ? 1n : ethUsd);
            return { wei };
          }
          const usdc = (usd8 * 10n ** 6n) / 10n ** 8n;
          return { usdc };
        } catch {
          return {} as any;
        }
      };

      await fulfillWithRetry(newOfferId, computePayment);

      // Notify backend of completion with user-selected amount for persistence
      try {
        if (initialQuote?.quoteId) {
          const response = await fetch("/api/deal-completion", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "complete",
              quoteId: initialQuote.quoteId,
              tokenAmount: String(tokenAmount),
              paymentCurrency: currency,
              offerId: String(newOfferId),
            }),
          });

          if (response.ok) {
            // Redirect to deal completion page for sharing
            setTimeout(() => {
              router.push(`/deal/${initialQuote.quoteId}`);
            }, 1500);
          }
        }
      } catch {}

      setStep("complete");
      setIsProcessing(false);

      onComplete?.({ offerId: newOfferId });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setIsProcessing(false);
      setStep("amount");
    }
  };

  const estimatedUsd = useMemo(() => {
    const pricePerToken = initialQuote?.pricePerToken || 0;
    const discountedPerToken = pricePerToken * (1 - discountBps / 10000);
    if (discountedPerToken > 0) return tokenAmount * discountedPerToken;
    return tokenAmount * 0.05;
  }, [initialQuote?.pricePerToken, discountBps, tokenAmount]);

  const estPerTokenUsd = useMemo(() => {
    const pricePerToken = initialQuote?.pricePerToken || 0;
    const discountedPerToken = pricePerToken * (1 - discountBps / 10000);
    if (discountedPerToken > 0) return discountedPerToken;
    return tokenAmount > 0 ? estimatedUsd / tokenAmount : 0.05;
  }, [initialQuote?.pricePerToken, discountBps, estimatedUsd, tokenAmount]);

  const balanceDisplay = useMemo(() => {
    if (!isConnected) return "—";
    if (currency === "USDC") {
      const v = Number(usdcBalance.data?.formatted || 0);
      return `${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
    }
    const eth = Number(ethBalance.data?.formatted || 0);
    return `${eth.toLocaleString(undefined, { maximumFractionDigits: 4 })}`;
  }, [
    isConnected,
    currency,
    usdcBalance.data?.formatted,
    ethBalance.data?.formatted,
  ]);

  const handleMaxClick = () => {
    try {
      let maxByFunds = ONE_MILLION;
      if (currency === "USDC") {
        const usdc = Number(usdcBalance.data?.formatted || 0);
        if (estPerTokenUsd > 0) maxByFunds = Math.floor(usdc / estPerTokenUsd);
      } else {
        const eth = Number(ethBalance.data?.formatted || 0);
        const ethUsd = initialQuote?.ethPrice || 0;
        if (ethUsd > 0 && estPerTokenUsd > 0) {
          const usd = eth * ethUsd;
          maxByFunds = Math.floor(usd / estPerTokenUsd);
        }
      }
      setTokenAmount(clampAmount(maxByFunds));
    } catch {
      setTokenAmount(ONE_MILLION);
    }
  };

  // Validation: enforce min USD and contract max
  const validationError = useMemo(() => {
    const minUsd = minUsdAmount ? Number(minUsdAmount) / 1e8 : 5;
    if (estimatedUsd < minUsd) {
      return `Order too small. Minimum is ${formatUsd(minUsd)}.`;
    }
    if (tokenAmount > contractMaxTokens) {
      return `Amount exceeds maximum of ${contractMaxTokens.toLocaleString()} tokens.`;
    }
    return null;
  }, [estimatedUsd, minUsdAmount, tokenAmount, contractMaxTokens]);

  // Compute estimated payment in selected currency and flag insufficient funds
  const estimatedPayment = useMemo(() => {
    if (currency === "USDC")
      return { usdc: estimatedUsd, eth: undefined } as const;
    if (currency === "SOL") return { usdc: undefined, eth: undefined } as const;
    const ethUsd = initialQuote?.ethPrice || 0;
    if (ethUsd <= 0) return { usdc: undefined, eth: undefined } as const;
    return { usdc: undefined, eth: estimatedUsd / ethUsd } as const;
  }, [currency, estimatedUsd, initialQuote?.ethPrice]);

  const insufficientFunds = useMemo(() => {
    if (!isConnected) return false;
    if (currency === "USDC") {
      const bal = Number(usdcBalance.data?.formatted || 0);
      return (
        estimatedPayment.usdc !== undefined &&
        estimatedPayment.usdc > bal + 1e-6
      );
    }
    if (currency === "SOL") return false;
    const balEth = Number(ethBalance.data?.formatted || 0);
    return (
      estimatedPayment.eth !== undefined && estimatedPayment.eth > balEth + 1e-9
    );
  }, [
    isConnected,
    currency,
    usdcBalance.data?.formatted,
    ethBalance.data?.formatted,
    estimatedPayment,
  ]);

  return (
    <Dialog open={isOpen} onClose={onClose} data-testid="accept-quote-modal">
      <div className="w-[min(720px,92vw)] mx-auto p-0 overflow-hidden rounded-2xl bg-zinc-950 text-white ring-1 ring-white/10">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5">
          <div className="text-lg font-semibold tracking-wide">Your Quote</div>
          <div className="flex items-center gap-3 text-sm">
            <button
              type="button"
              className={`px-2 py-1 rounded-md ${currency === "USDC" ? "bg-white text-black" : "text-zinc-300"}`}
              onClick={() => setCurrency("USDC")}
            >
              USDC
            </button>
            <span className="text-zinc-600">|</span>
            <button
              type="button"
              className={`px-2 py-1 rounded-md ${currency !== "USDC" ? "bg-white text-black" : "text-zinc-300"}`}
              onClick={() =>
                setCurrency(activeFamily === "solana" ? "SOL" : "ETH")
              }
            >
              {activeFamily === "solana" ? "SOL" : "ETH"}
            </button>
          </div>
          {isSolanaActive && (
            <div className="px-5 pt-2 text-xs text-zinc-400">
              Solana payments are not yet available. <button type="button" className="underline" onClick={() => setCurrency("ETH")}>Switch to EVM</button> to buy now.
            </div>
          )}
        </div>

        {/* Main amount card */}
        <div className="m-5 rounded-xl bg-zinc-900 ring-1 ring-white/10">
          <div className="flex items-center justify-between px-5 pt-4">
            <div className="text-sm text-zinc-400">Amount to Buy</div>
            <div className="flex items-center gap-3 text-sm text-zinc-400">
              <span>Balance: {balanceDisplay}</span>
              <button
                type="button"
                className="text-orange-400 hover:text-orange-300 font-medium"
                onClick={handleMaxClick}
              >
                MAX
              </button>
            </div>
          </div>
          <div className="px-5 pb-2">
            <div className="flex items-center justify-between gap-3">
              <input
                data-testid="token-amount-input"
                type="number"
                value={tokenAmount}
                onChange={(e) =>
                  setTokenAmount(clampAmount(Number(e.target.value)))
                }
                min={MIN_TOKENS}
                max={ONE_MILLION}
                className="w-full bg-transparent border-none outline-none text-5xl sm:text-6xl font-extrabold tracking-tight text-white"
              />
              <div className="flex items-center gap-2 text-right">
                <div className="h-9 w-9 rounded-full bg-orange-500/10 flex items-center justify-center">
                  <span className="text-orange-400 text-lg">₣</span>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold">$ElizaOS</div>
                  <div className="text-xs text-zinc-500">{`Balance: ${balanceDisplay}`}</div>
                </div>
              </div>
            </div>
            <div className="mt-2">
              <input
                data-testid="token-amount-slider"
                type="range"
                min={MIN_TOKENS}
                max={ONE_MILLION}
                value={tokenAmount}
                onChange={(e) =>
                  setTokenAmount(clampAmount(Number(e.target.value)))
                }
                className="w-full accent-orange-500"
              />
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="px-5 pb-1">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 text-sm">
            <div>
              <div className="text-zinc-500">Your Discount</div>
              <div className="text-lg font-semibold">
                {(discountBps / 100).toFixed(0)}%
              </div>
            </div>
            <div>
              <div className="text-zinc-500">Maturity</div>
              <div className="text-lg font-semibold">
                {Math.round(lockupDays / 30)} months
              </div>
            </div>
            <div>
              <div className="text-zinc-500">Maturity date</div>
              <div className="text-lg font-semibold">
                {new Date(
                  Date.now() + lockupDays * 24 * 60 * 60 * 1000,
                ).toLocaleDateString(undefined, {
                  month: "2-digit",
                  day: "2-digit",
                  year: "2-digit",
                })}
              </div>
            </div>
            <div>
              <div className="text-zinc-500">Est. $ElizaOS</div>
              <div className="text-lg font-semibold">
                ${(tokenAmount > 0 ? estimatedUsd / tokenAmount : 0).toFixed(3)}
              </div>
            </div>
          </div>
        </div>

        {(error || validationError || insufficientFunds) && (
          <div className="px-5 pt-2 text-xs text-red-400">
            {error ||
              validationError ||
              (insufficientFunds
                ? `Insufficient ${currency} balance for this purchase.`
                : null)}
          </div>
        )}

        {/* Actions / Connect state */}
        {!unifiedConnected ? (
          <div className="px-5 pb-5">
            <div className="rounded-xl overflow-hidden ring-1 ring-white/10 bg-zinc-900">
              <div className="relative">
                <div className="relative aspect-[16/9] w-full bg-gradient-to-br from-zinc-900 to-zinc-800">
                  <div
                    aria-hidden
                    className="absolute inset-0 opacity-30 bg-no-repeat bg-right-bottom"
                    style={{
                      backgroundImage: "url('/business.png')",
                      backgroundSize: "contain",
                    }}
                  />
                  <div className="relative z-10 h-full w-full flex flex-col items-center justify-center text-center px-6">
                    <h3 className="text-xl font-semibold text-white tracking-tight mb-2">
                      Connect Wallet
                    </h3>
                    <p className="text-zinc-300 text-sm mb-4">
                      Get discounted ElizaOS tokens. Let’s deal, anon.
                    </p>
                    <div className="inline-flex gap-2">
                      <NetworkConnectButton className="!h-9">Connect</NetworkConnectButton>
                    </div>
                  </div>
                </div>
              </div>
              <div className="p-4 text-xs text-zinc-400">
                Connect a wallet to continue and complete your purchase.
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 mt-4">
              <Button
                onClick={onClose}
                color="dark"
                className="bg-zinc-800 text-white border-zinc-700"
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-end gap-3 px-5 py-5">
            <Button
              onClick={onClose}
              color="dark"
              className="bg-zinc-800 text-white border-zinc-700"
            >
              Cancel
            </Button>
            <Button
              data-testid="confirm-amount-button"
              onClick={handleConfirm}
              color="orange"
              className="bg-orange-600 border-orange-700 hover:brightness-110"
              disabled={
                Boolean(validationError) ||
                insufficientFunds ||
                isProcessing ||
                isSolanaActive
              }
            >
              {isSolanaActive ? "Switch to EVM to buy" : "Buy Now on EVM"}
            </Button>
          </div>
        )}

        {/* Progress states */}
        {step === "creating" && (
          <div className="px-5 pb-6">
            <div className="text-center py-6">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto mb-4"></div>
              <h3 className="font-semibold mb-2">
                Processing... Creating Offer On-Chain
              </h3>
              <p className="text-sm text-zinc-400">
                Confirm the transaction in your wallet.
              </p>
            </div>
          </div>
        )}

        {step === "await_approval" && (
          <div className="px-5 pb-6">
            <div className="text-center py-6">
              <h3 className="font-semibold mb-2">Waiting For Approval</h3>
              <p className="text-sm text-zinc-400">
                An approver is reviewing your offer. This usually takes a few
                seconds.
              </p>
            </div>
          </div>
        )}

        {step === "paying" && (
          <div className="px-5 pb-6">
            <div className="text-center py-6">
              <h3 className="font-semibold mb-2">Complete Payment</h3>
              <p className="text-sm text-zinc-400">
                We’re submitting payment securely. Please keep this tab open…
              </p>
            </div>
          </div>
        )}

        {step === "complete" && (
          <div className="px-5 pb-6">
            <div className="text-center py-6">
              <div className="w-12 h-12 rounded-full bg-green-900/30 flex items-center justify-center mx-auto mb-4">
                <svg
                  className="w-6 h-6 text-green-400"
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
              <h3 className="font-semibold mb-2">All Set!</h3>
              <p className="text-sm text-zinc-400">
                Your offer has been paid. You’ll receive the claimable tokens at
                maturity.
              </p>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
