"use client";

import { useEffect, useMemo, useState } from "react";
import {
  useAccount,
  useReadContract,
  useReadContracts,
  useWriteContract,
  useChainId,
  useBalance,
} from "wagmi";
import { hardhat } from "wagmi/chains";
import { createPublicClient, http } from "viem";
import type { Abi, Address } from "viem";
import otcArtifact from "@/contracts/artifacts/contracts/OTC.sol/OTC.json";
const erc20Abi = [
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as unknown as Abi;

type Offer = {
  beneficiary: Address;
  tokenAmount: bigint;
  discountBps: bigint;
  createdAt: bigint;
  unlockTime: bigint;
  priceUsdPerToken: bigint; // 8d
  ethUsdPrice: bigint; // 8d
  currency: number; // 0 eth, 1 usdc
  approved: boolean;
  paid: boolean;
  fulfilled: boolean;
  cancelled: boolean;
  payer: Address;
  amountPaid: bigint;
};

export function useOTC(): {
  otcAddress: Address | undefined;
  availableTokens: bigint;
  myOfferIds: bigint[];
  myOffers: (Offer & { id: bigint })[];
  openOfferIds: bigint[];
  openOffers: Offer[];
  agent: Address | undefined;
  isAgent: boolean;
  isApprover: boolean;
  usdcAddress: Address | undefined;
  ethBalanceWei?: bigint;
  usdcBalance?: bigint;
  minUsdAmount?: bigint;
  maxTokenPerOrder?: bigint;
  quoteExpirySeconds?: bigint;
  defaultUnlockDelaySeconds?: bigint;
  emergencyRefundsEnabled?: boolean;
  isLoading: boolean;
  error: unknown;
  claim: (offerId: bigint) => Promise<unknown>;
  isClaiming: boolean;
  createOffer: (params: {
    tokenAmountWei: bigint;
    discountBps: number;
    paymentCurrency: 0 | 1;
    lockupSeconds?: bigint;
  }) => Promise<unknown>;
  approveOffer: (offerId: bigint) => Promise<unknown>;
  cancelOffer: (offerId: bigint) => Promise<unknown>;
  fulfillOffer: (offerId: bigint, valueWei?: bigint) => Promise<unknown>;
  approveUsdc: (amount: bigint) => Promise<unknown>;
  emergencyRefund: (offerId: bigint) => Promise<unknown>;
  getRequiredPayment: (
    offerId: bigint,
    currency: "ETH" | "USDC",
  ) => Promise<bigint | undefined>;
} {
  const { address: account } = useAccount();
  const chainId = useChainId();
  const [otcAddress, setOTCAddress] = useState<Address | undefined>(
    () => process.env.NEXT_PUBLIC_OTC_ADDRESS as Address | undefined,
  );
  const abi = otcArtifact.abi as Abi;

  // Create public client for reading contract
  const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || "http://127.0.0.1:8545";
  const publicClient = useMemo(
    () =>
      createPublicClient({
        chain: hardhat,
        transport: http(rpcUrl),
      }),
    [rpcUrl],
  );

  useEffect(() => {
    if (!otcAddress && typeof window !== "undefined") {
      // ensure devnet deploy
      fetch("/api/devnet/ensure", { method: "POST" }).catch(() => {});
      fetch("/api/devnet/address")
        .then(async (r) => {
          if (!r.ok) return;
          const data = await r.json();
          if (data?.address) setOTCAddress(data.address as Address);
        })
        .catch(() => {});
    }
  }, [otcAddress]);

  const enabled =
    Boolean(otcAddress) &&
    (chainId === hardhat.id || process.env.NODE_ENV !== "production");

  const availableTokensRes = useReadContract({
    address: otcAddress,
    abi,
    functionName: "availableTokenInventory",
    chainId: hardhat.id,
    query: { enabled },
  });
  const minUsdRes = useReadContract({
    address: otcAddress,
    abi,
    functionName: "minUsdAmount",
    chainId: hardhat.id,
    query: { enabled },
  });
  const maxTokenRes = useReadContract({
    address: otcAddress,
    abi,
    functionName: "maxTokenPerOrder",
    chainId: hardhat.id,
    query: { enabled },
  });
  const expiryRes = useReadContract({
    address: otcAddress,
    abi,
    functionName: "quoteExpirySeconds",
    chainId: hardhat.id,
    query: { enabled },
  });
  const unlockDelayRes = useReadContract({
    address: otcAddress,
    abi,
    functionName: "defaultUnlockDelaySeconds",
    chainId: hardhat.id,
    query: { enabled },
  });

  const agentRes = useReadContract({
    address: otcAddress,
    abi,
    functionName: "agent",
    chainId: hardhat.id,
    query: { enabled },
  });
  const approverMappingRes = useReadContract({
    address: otcAddress,
    abi,
    functionName: "isApprover",
    args: [account as Address],
    chainId: hardhat.id,
    query: { enabled: enabled && Boolean(account) },
  });

  const myOfferIdsRes = useReadContract({
    address: otcAddress,
    abi,
    functionName: "getOffersForBeneficiary",
    args: [account as Address],
    chainId: hardhat.id,
    query: { enabled: enabled && Boolean(account) },
  });
  const myOfferIds = useMemo(
    () => (myOfferIdsRes.data as bigint[] | undefined) ?? [],
    [myOfferIdsRes.data],
  );

  // Using type assertion to avoid deep type instantiation issue
  const myOffersContracts = myOfferIds.map((id) => ({
    address: otcAddress!,
    abi,
    functionName: "offers" as const,
    args: [id] as const,
    chainId: hardhat.id,
  }));

  const myOffersRes = useReadContracts({
    contracts: myOffersContracts,
    query: { enabled: enabled && myOfferIds.length > 0 },
  } as any);

  const openOfferIdsRes = useReadContract({
    address: otcAddress,
    abi,
    functionName: "getOpenOfferIds",
    chainId: hardhat.id,
    query: { enabled },
  });
  // Using type assertion to avoid deep type instantiation issue
  const openOfferIds = (openOfferIdsRes.data as bigint[] | undefined) ?? [];
  const openOffersContracts = openOfferIds.map((id) => ({
    address: otcAddress!,
    abi,
    functionName: "offers" as const,
    args: [id] as const,
    chainId: hardhat.id,
  }));

  const openOffersRes = useReadContracts({
    contracts: openOffersContracts,
    query: {
      enabled:
        enabled &&
        Array.isArray(openOfferIdsRes.data) &&
        openOfferIds.length > 0,
    },
  } as any);

  const { writeContractAsync, isPending } = useWriteContract();

  async function claim(offerId: bigint) {
    if (!otcAddress) throw new Error("No OTC address");
    if (!account) throw new Error("No wallet connected");
    return writeContractAsync({
      address: otcAddress,
      abi,
      functionName: "claim",
      args: [offerId],
    } as any);
  }

  async function createOffer(params: {
    tokenAmountWei: bigint;
    discountBps: number;
    paymentCurrency: 0 | 1;
    lockupSeconds?: bigint;
  }) {
    if (!otcAddress) throw new Error("No OTC address");
    if (!account) throw new Error("No wallet connected");
    return writeContractAsync({
      address: otcAddress,
      abi,
      functionName: "createOffer",
      args: [
        params.tokenAmountWei,
        BigInt(params.discountBps),
        params.paymentCurrency,
        params.lockupSeconds ?? 0n,
      ],
    } as any);
  }

  async function approveOffer(offerId: bigint) {
    if (!otcAddress) throw new Error("No OTC address");
    if (!account) throw new Error("No wallet connected");
    return writeContractAsync({
      address: otcAddress,
      abi,
      functionName: "approveOffer",
      args: [offerId],
    } as any);
  }

  async function cancelOffer(offerId: bigint) {
    if (!otcAddress) throw new Error("No OTC address");
    if (!account) throw new Error("No wallet connected");
    return writeContractAsync({
      address: otcAddress,
      abi,
      functionName: "cancelOffer",
      args: [offerId],
    } as any);
  }

  async function fulfillOffer(offerId: bigint, valueWei?: bigint) {
    if (!otcAddress) throw new Error("No OTC address");
    if (!account) throw new Error("No wallet connected");
    return writeContractAsync({
      address: otcAddress,
      abi,
      functionName: "fulfillOffer",
      args: [offerId],
      value: valueWei,
    } as any);
  }

  const usdcAddressRes = useReadContract({
    address: otcAddress,
    abi,
    functionName: "usdc",
    chainId: hardhat.id,
    query: { enabled },
  });
  const usdcAddress = (usdcAddressRes.data as Address | undefined) ?? undefined;
  const usdcBalanceRes = useReadContract({
    address: usdcAddress,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [otcAddress as Address],
    chainId: hardhat.id,
    query: { enabled: enabled && Boolean(usdcAddress) && Boolean(otcAddress) },
  });
  const ethBalRes = useBalance({
    address: otcAddress as Address,
    chainId: hardhat.id,
    query: { enabled: enabled && Boolean(otcAddress) },
  });

  async function approveUsdc(amount: bigint) {
    if (!otcAddress || !usdcAddress) throw new Error("Missing addresses");
    if (!account) throw new Error("No wallet connected");
    return writeContractAsync({
      address: usdcAddress,
      abi: erc20Abi,
      functionName: "approve",
      args: [otcAddress, amount],
    } as any);
  }

  async function emergencyRefund(offerId: bigint) {
    if (!otcAddress) throw new Error("No OTC address");
    if (!account) throw new Error("No wallet connected");
    return writeContractAsync({
      address: otcAddress,
      abi,
      functionName: "emergencyRefund",
      args: [offerId],
    } as any);
  }

  // Helper to get exact required payment amount
  async function getRequiredPayment(
    offerId: bigint,
    currency: "ETH" | "USDC",
  ): Promise<bigint | undefined> {
    if (!otcAddress) return undefined;
    try {
      const functionName =
        currency === "ETH" ? "requiredEthWei" : "requiredUsdcAmount";
      const result = await publicClient.readContract({
        address: otcAddress,
        abi,
        functionName,
        args: [offerId],
      });
      return result as bigint;
    } catch (error) {
      console.error("Error getting required payment:", error);
      return undefined;
    }
  }

  const agentAddr = (agentRes.data as Address | undefined) ?? undefined;
  const isAgent =
    !!account &&
    !!agentAddr &&
    (account as string).toLowerCase() === (agentAddr as string).toLowerCase();
  const isWhitelisted = Boolean(approverMappingRes.data as boolean | undefined);
  const isApprover = isAgent || isWhitelisted;

  // Check if emergency refunds are enabled
  const emergencyRefundsRes = useReadContract({
    address: otcAddress,
    abi,
    functionName: "emergencyRefundsEnabled",
    chainId: hardhat.id,
    query: { enabled },
  });

  const myOffers: (Offer & { id: bigint })[] = useMemo(() => {
    const base = myOffersRes.data ?? [];
    return myOfferIds.map((id, idx) => {
      const result = base[idx]?.result as Offer | undefined;
      return { id, ...(result ?? ({} as Offer)) } as Offer & { id: bigint };
    });
  }, [myOfferIds, myOffersRes.data]);

  return {
    otcAddress,
    availableTokens: (availableTokensRes.data as bigint | undefined) ?? 0n,
    myOfferIds,
    myOffers,
    openOfferIds: ((openOfferIdsRes.data as bigint[] | undefined) ??
      []) as bigint[],
    openOffers: (openOffersRes.data ?? [])
      .map((x) => x?.result as Offer | undefined)
      .filter((x): x is Offer => x !== undefined),
    agent: agentAddr,
    isAgent,
    isApprover,
    usdcAddress,
    ethBalanceWei: (ethBalRes.data?.value as bigint | undefined) ?? undefined,
    usdcBalance: (usdcBalanceRes.data as bigint | undefined) ?? undefined,
    minUsdAmount: (minUsdRes.data as bigint | undefined) ?? undefined,
    maxTokenPerOrder: (maxTokenRes.data as bigint | undefined) ?? undefined,
    quoteExpirySeconds: (expiryRes.data as bigint | undefined) ?? undefined,
    defaultUnlockDelaySeconds:
      (unlockDelayRes.data as bigint | undefined) ?? undefined,
    emergencyRefundsEnabled:
      (emergencyRefundsRes.data as boolean | undefined) ?? false,
    isLoading:
      availableTokensRes.isLoading ||
      myOfferIdsRes.isLoading ||
      myOffersRes.isLoading ||
      usdcBalanceRes.isLoading ||
      ethBalRes.isLoading,
    error:
      availableTokensRes.error ||
      myOfferIdsRes.error ||
      myOffersRes.error ||
      usdcBalanceRes.error ||
      ethBalRes.error,
    claim,
    isClaiming: isPending,
    createOffer,
    approveOffer,
    cancelOffer,
    fulfillOffer,
    approveUsdc,
    emergencyRefund,
    getRequiredPayment,
  } as const;
}
