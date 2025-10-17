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
import { createPublicClient, http, pad, keccak256, stringToBytes, decodeEventLog } from "viem";
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
  withdrawConsignment: (consignmentId: bigint) => Promise<unknown>;
  createConsignmentOnChain: (params: {
    tokenId: string;
    amount: bigint;
    isNegotiable: boolean;
    fixedDiscountBps: number;
    fixedLockupDays: number;
    minDiscountBps: number;
    maxDiscountBps: number;
    minLockupDays: number;
    maxLockupDays: number;
    minDealAmount: bigint;
    maxDealAmount: bigint;
    isFractionalized: boolean;
    isPrivate: boolean;
    maxPriceVolatilityBps: number;
    maxTimeToExecute: number;
    gasDeposit: bigint;
  }) => Promise<{ txHash: `0x${string}`; consignmentId: bigint }>;
  approveToken: (tokenAddress: Address, amount: bigint) => Promise<unknown>;
  getTokenAddress: (tokenId: string) => Promise<Address>;
  getRequiredGasDeposit: () => Promise<bigint>;
  getRequiredPayment: (
    offerId: bigint,
    currency: "ETH" | "USDC",
  ) => Promise<bigint>;
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
    query: {
      enabled: enabled && Boolean(account),
      refetchInterval: 2000,
      staleTime: 0, // Always refetch - don't use cache
      gcTime: 0, // Don't keep old data
    },
  });
  const myOfferIds = useMemo(() => {
    const ids = (myOfferIdsRes.data as bigint[] | undefined) ?? [];
    console.log(
      "[useOTC] My offer IDs from contract:",
      ids.map((id) => id.toString()),
    );
    return ids;
  }, [myOfferIdsRes.data]);

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
    query: {
      enabled: enabled && myOfferIds.length > 0,
      refetchInterval: 2000,
      staleTime: 0, // Always refetch - critical for showing latest paid/fulfilled state
      gcTime: 0, // Don't keep stale data
    },
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

  async function withdrawConsignment(consignmentId: bigint) {
    if (!otcAddress) throw new Error("No OTC address");
    if (!account) throw new Error("No wallet connected");
    return writeContractAsync({
      address: otcAddress,
      abi,
      functionName: "withdrawConsignment",
      args: [consignmentId],
    } as any);
  }

  async function createConsignmentOnChain(params: {
    tokenId: string;
    amount: bigint;
    isNegotiable: boolean;
    fixedDiscountBps: number;
    fixedLockupDays: number;
    minDiscountBps: number;
    maxDiscountBps: number;
    minLockupDays: number;
    maxLockupDays: number;
    minDealAmount: bigint;
    maxDealAmount: bigint;
    isFractionalized: boolean;
    isPrivate: boolean;
    maxPriceVolatilityBps: number;
    maxTimeToExecute: number;
    gasDeposit: bigint;
  }): Promise<{ txHash: `0x${string}`; consignmentId: bigint }> {
    if (!otcAddress) throw new Error("No OTC address");
    if (!account) throw new Error("No wallet connected");
    
    // Fetch token data to get the contract's tokenId (keccak256 hash)
    const tokenResponse = await fetch(`/api/tokens/${params.tokenId}`);
    if (!tokenResponse.ok) {
      throw new Error(`Failed to fetch token data for ${params.tokenId}`);
    }
    const tokenData = await tokenResponse.json();
    if (!tokenData.success || !tokenData.token) {
      throw new Error(`Token ${params.tokenId} not found`);
    }
    
    // Get the symbol and compute the contract tokenId (keccak256 of the symbol)
    const tokenIdBytes32 = keccak256(stringToBytes(tokenData.token.symbol));
    
    const txHash = await writeContractAsync({
      address: otcAddress,
      abi,
      functionName: "createConsignment",
      args: [
        tokenIdBytes32,
        params.amount,
        params.isNegotiable,
        params.fixedDiscountBps,
        params.fixedLockupDays,
        params.minDiscountBps,
        params.maxDiscountBps,
        params.minLockupDays,
        params.maxLockupDays,
        params.minDealAmount,
        params.maxDealAmount,
        params.isFractionalized,
        params.isPrivate,
        params.maxPriceVolatilityBps,
        params.maxTimeToExecute,
      ],
      value: params.gasDeposit,
    } as any);

    // Wait for transaction receipt and parse the consignmentId from the event
    console.log("[useOTC] Waiting for transaction receipt:", txHash);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash as `0x${string}` });
    console.log("[useOTC] Receipt received, parsing ConsignmentCreated event");
    console.log("[useOTC] Receipt logs count:", receipt.logs.length);
    console.log("[useOTC] OTC contract address:", otcAddress);
    
    // Find ConsignmentCreated event from the OTC contract
    const consignmentCreatedEvent = receipt.logs.find((log: any) => {
      // Check if log is from our OTC contract
      if (log.address.toLowerCase() !== otcAddress.toLowerCase()) {
        return false;
      }
      
      try {
        const decoded = decodeEventLog({
          abi,
          data: log.data,
          topics: log.topics,
        });
        console.log("[useOTC] Decoded event:", decoded.eventName);
        return decoded.eventName === "ConsignmentCreated";
      } catch (e) {
        console.log("[useOTC] Failed to decode log:", e);
        return false;
      }
    });

    if (!consignmentCreatedEvent) {
      console.error("[useOTC] No ConsignmentCreated event found. Receipt logs:", receipt.logs);
      throw new Error("ConsignmentCreated event not found in transaction receipt");
    }

    const decoded = decodeEventLog({
      abi,
      data: (consignmentCreatedEvent as any).data,
      topics: (consignmentCreatedEvent as any).topics,
    });

    const consignmentId = (decoded.args as any).consignmentId as bigint;
    console.log("[useOTC] Consignment created with ID:", consignmentId.toString());
    
    return { txHash: txHash as `0x${string}`, consignmentId };
  }

  async function approveToken(tokenAddress: Address, amount: bigint) {
    if (!account) throw new Error("No wallet connected");
    return writeContractAsync({
      address: tokenAddress,
      abi: erc20Abi,
      functionName: "approve",
      args: [otcAddress, amount],
    } as any);
  }

  // Helper to extract contract address from tokenId format: "token-{chain}-{address}"
  function extractContractAddress(tokenId: string): Address {
    const parts = tokenId.split('-');
    if (parts.length >= 3) {
      // Format is: token-chain-address, so join everything after the second dash
      return parts.slice(2).join('-') as Address;
    }
    // Fallback: assume it's already an address
    return tokenId as Address;
  }

  async function getTokenAddress(tokenId: string): Promise<Address> {
    // Simply extract the contract address from the tokenId
    // The tokenId format is "token-{chain}-{contractAddress}"
    return extractContractAddress(tokenId);
  }

  async function getRequiredGasDeposit(): Promise<bigint> {
    if (!otcAddress) throw new Error("No OTC address");
    const result = await publicClient.readContract({
      address: otcAddress,
      abi,
      functionName: "requiredGasDepositPerConsignment",
    } as any);
    return result as bigint;
  }

  // Helper to get exact required payment amount
  async function getRequiredPayment(
    offerId: bigint,
    currency: "ETH" | "USDC",
  ): Promise<bigint> {
    if (!otcAddress) {
      throw new Error("OTC address not configured");
    }
    const functionName =
      currency === "ETH" ? "requiredEthWei" : "requiredUsdcAmount";
    const result = await publicClient.readContract({
      address: otcAddress,
      abi,
      functionName,
      args: [offerId],
    } as any);
    return result as bigint;
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
    console.log(
      "[useOTC] myOfferIds:",
      myOfferIds.map((id) => id.toString()),
    );
    console.log("[useOTC] Raw response count:", base.length);
    console.log("[useOTC] Using contract address:", otcAddress);
    console.log("[useOTC] Wagmi query status:", {
      isLoading: myOffersRes.isLoading,
      isError: myOffersRes.isError,
      isFetching: myOffersRes.isFetching,
    });

    const offers = myOfferIds.map((id, idx) => {
      const rawResult = base[idx]?.result;

      console.log(`[useOTC] Offer ${id} raw result:`, rawResult);

      // Contract returns array: [beneficiary, tokenAmount, discountBps, createdAt, unlockTime,
      //   priceUsdPerToken, ethUsdPrice, currency, approved, paid, fulfilled, cancelled, payer, amountPaid]
      if (Array.isArray(rawResult)) {
        const [
          beneficiary,
          tokenAmount,
          discountBps,
          createdAt,
          unlockTime,
          priceUsdPerToken,
          ethUsdPrice,
          currency,
          approved,
          paid,
          fulfilled,
          cancelled,
          payer,
          amountPaid,
        ] = rawResult;

        console.log(`[useOTC] Offer ${id} parsed:`, {
          paid,
          fulfilled,
          cancelled,
          beneficiary,
          tokenAmount: tokenAmount?.toString(),
        });

        return {
          id,
          beneficiary,
          tokenAmount,
          discountBps,
          createdAt,
          unlockTime,
          priceUsdPerToken,
          ethUsdPrice,
          currency,
          approved,
          paid,
          fulfilled,
          cancelled,
          payer,
          amountPaid,
        } as Offer & { id: bigint };
      }

      console.warn(`[useOTC] Offer ${id}: Invalid data format`, rawResult);
      return {
        id,
        paid: false,
        fulfilled: false,
        cancelled: false,
      } as Offer & { id: bigint };
    });

    console.log("[useOTC] Total offers parsed:", offers.length);
    const paidOffers = offers.filter((o) => o.paid);
    console.log(
      "[useOTC] Paid offers:",
      paidOffers.length,
      paidOffers.map((o) => o.id.toString()),
    );
    return offers;
  }, [
    myOfferIds,
    myOffersRes.data,
    myOffersRes.isLoading,
    myOffersRes.isError,
    myOffersRes.isFetching,
    otcAddress,
  ]);

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
    withdrawConsignment,
    createConsignmentOnChain,
    approveToken,
    getTokenAddress,
    getRequiredGasDeposit,
    getRequiredPayment,
  } as const;
}
