"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useMultiWallet } from "../multiwallet";
import type { Token, TokenMarketData } from "@/services/database";
import { Button } from "../button";
import { useAccount } from "wagmi";
import { localhost } from "wagmi/chains";
import type { Abi, Address } from "viem";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";

interface StepProps {
  formData: any;
  updateFormData: (updates: any) => void;
  onNext: () => void;
  onBack?: () => void;
  requiredChain?: "evm" | "solana" | null;
  isConnectedToRequiredChain?: boolean;
  onConnectEvm?: () => void;
  onConnectSolana?: () => void;
}

interface TokenWithBalance extends Token {
  balance: string;
  balanceUsd: number;
  priceUsd: number;
}

const erc20Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
] as unknown as Abi;

export function TokenSelectionStep({
  formData,
  updateFormData,
  onNext,
  requiredChain,
  isConnectedToRequiredChain,
  onConnectEvm,
  onConnectSolana,
}: StepProps) {
  const { activeFamily, evmAddress, solanaPublicKey, isConnected } =
    useMultiWallet();
  const { address } = useAccount();
  const { connection } = useConnection();
  const [tokens, setTokens] = useState<TokenWithBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  useEffect(() => {
    setLoading(true);
    setHasLoadedOnce(false);
    
    async function loadUserTokens() {
      if (!isConnected) {
        setLoading(false);
        setHasLoadedOnce(true);
        return;
      }

      const chain = activeFamily === "solana" ? "solana" : "ethereum";
      const userAddress =
        activeFamily === "solana" ? solanaPublicKey : evmAddress;

      if (!userAddress) {
        setLoading(false);
        setHasLoadedOnce(true);
        return;
      }

      const response = await fetch(`/api/tokens?chain=${chain}&isActive=true`);
      const data = await response.json();

      if (!data.success || !data.tokens) {
        setLoading(false);
        setHasLoadedOnce(true);
        return;
      }

      const allTokens = data.tokens as Token[];
      const tokensWithBalances: TokenWithBalance[] = [];

      for (const token of allTokens) {
        let balance = "0";
        let balanceNum = 0;

        if (activeFamily === "solana" && solanaPublicKey) {
          balance = await fetchSolanaBalance(
            token.contractAddress,
            solanaPublicKey,
          );
          balanceNum = Number(balance) / Math.pow(10, token.decimals);
        } else if (evmAddress) {
          balance = await fetchEvmBalance(token.contractAddress, evmAddress);
          balanceNum = Number(balance) / Math.pow(10, token.decimals);
        }

        if (balanceNum > 0) {
          const marketDataRes = await fetch(`/api/market-data/${token.id}`);
          const marketDataJson = await marketDataRes.json();
          const marketData =
            marketDataJson.marketData as TokenMarketData | null;
          const priceUsd = marketData?.priceUsd || 0;
          const balanceUsd = balanceNum * priceUsd;

          tokensWithBalances.push({
            ...token,
            balance,
            balanceUsd,
            priceUsd,
          });
        }
      }

      tokensWithBalances.sort((a, b) => b.balanceUsd - a.balanceUsd);
      setTokens(tokensWithBalances);
      setLoading(false);
      setHasLoadedOnce(true);
    }

    loadUserTokens();
  }, [
    activeFamily,
    evmAddress,
    solanaPublicKey,
    isConnected,
    address,
    connection,
  ]);

  async function fetchEvmBalance(
    tokenAddress: string,
    userAddress: string,
  ): Promise<string> {
    const publicClient = await import("viem").then((m) =>
      m.createPublicClient({
        chain: {
          ...localhost,
          features: undefined,
        },
        transport: m.http(
          process.env.NEXT_PUBLIC_RPC_URL || "http://127.0.0.1:8545",
        ),
      }),
    );

    const balance = await publicClient.readContract({
      address: tokenAddress as Address,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [userAddress as Address],
    } as any);

    return (balance as bigint).toString();
  }

  async function fetchSolanaBalance(
    mintAddress: string,
    userPublicKey: string,
  ): Promise<string> {
    const { getAssociatedTokenAddress, getAccount } = await import(
      "@solana/spl-token"
    );

    const mintPubkey = new PublicKey(mintAddress);
    const ownerPubkey = new PublicKey(userPublicKey);
    const ata = await getAssociatedTokenAddress(mintPubkey, ownerPubkey);

    const accountInfo = await getAccount(connection, ata).catch(() => null);
    return accountInfo ? accountInfo.amount.toString() : "0";
  }

  const formatBalance = (balance: string, decimals: number) => {
    const num = Number(balance) / Math.pow(10, decimals);
    if (num >= 1000000) return `${(num / 1000000).toFixed(2)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(2)}K`;
    return num.toFixed(2);
  };

  const formatUsd = (usd: number) => {
    if (usd >= 1000000) return `$${(usd / 1000000).toFixed(2)}M`;
    if (usd >= 1000) return `$${(usd / 1000).toFixed(2)}K`;
    return `$${usd.toFixed(2)}`;
  };

  if (!isConnected) {
    return (
      <div className="text-center py-8">
        <p className="text-zinc-600 dark:text-zinc-400 mb-4">
          Please connect your wallet to list tokens
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600 mx-auto mb-4"></div>
        <p className="text-zinc-600 dark:text-zinc-400">
          Loading your tokens...
        </p>
      </div>
    );
  }

  if (tokens.length === 0 && hasLoadedOnce) {
    return (
      <div className="text-center py-8">
        <p className="text-zinc-600 dark:text-zinc-400">
          You don&apos;t have any {activeFamily === "solana" ? "Solana" : "EVM"}{" "}
          tokens to list.
        </p>
        <p className="text-sm text-zinc-500 dark:text-zinc-500 mt-2">
          Switch networks or add tokens to your wallet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {tokens.map((token) => (
        <div
          key={token.id}
          onClick={() => updateFormData({ tokenId: token.id })}
          className={`p-4 rounded-lg border cursor-pointer transition-colors ${
            formData.tokenId === token.id
              ? "border-orange-600 bg-orange-600/5"
              : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-400"
          }`}
        >
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
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <div className="font-semibold">{token.symbol}</div>
                <div className="text-sm font-medium">
                  {formatUsd(token.balanceUsd)}
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="text-sm text-zinc-600 dark:text-zinc-400">
                  {token.name}
                </div>
                <div className="text-xs text-zinc-500 dark:text-zinc-500">
                  {formatBalance(token.balance, token.decimals)} {token.symbol}
                </div>
              </div>
              <div className="text-xs text-zinc-500 dark:text-zinc-500 font-mono mt-1">
                {token.contractAddress.slice(0, 6)}...
                {token.contractAddress.slice(-4)}
              </div>
            </div>
          </div>
        </div>
      ))}

      {/* Show Connect button if token is selected but wrong chain is connected */}
      {formData.tokenId && requiredChain && !isConnectedToRequiredChain ? (
        <Button
          onClick={requiredChain === "solana" ? onConnectSolana : onConnectEvm}
          className={`w-full mt-6 text-white rounded-lg ${
            requiredChain === "solana"
              ? "bg-gradient-to-br from-[#9945FF] to-[#14F195] hover:opacity-90"
              : "bg-gradient-to-br from-blue-600 to-blue-800 hover:opacity-90"
          }`}
        >
          Connect to {requiredChain === "solana" ? "Solana" : "EVM"}
        </Button>
      ) : (
        <Button
          onClick={onNext}
          disabled={!formData.tokenId}
          className="w-full mt-6 bg-orange-500 hover:bg-orange-600 text-white rounded-lg"
        >
          Next
        </Button>
      )}
    </div>
  );
}
