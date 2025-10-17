"use client";

import { useState } from "react";
import { useMultiWallet } from "../multiwallet";
import { Button } from "../button";
import { Copy, Check } from "lucide-react";
import { useOTC } from "@/hooks/contracts/useOTC";
import { useAccount } from "wagmi";
import { SubmissionModal } from "./submission-modal";

interface StepProps {
  formData: any;
  updateFormData: (updates: any) => void;
  onNext: () => void;
  onBack: () => void;
  requiredChain?: "evm" | "solana" | null;
  isConnectedToRequiredChain?: boolean;
  onConnectBase?: () => void;
  onConnectSolana?: () => void;
}

export function ReviewStep({ formData, onBack, requiredChain, isConnectedToRequiredChain, onConnectBase, onConnectSolana }: StepProps) {
  const { activeFamily, evmAddress, solanaPublicKey } = useMultiWallet();
  const { address } = useAccount();
  const { createConsignmentOnChain, approveToken, getTokenAddress, getRequiredGasDeposit } = useOTC();
  const [copied, setCopied] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [tokenAddress, setTokenAddress] = useState<string | null>(null);
  const [gasDeposit, setGasDeposit] = useState<bigint | null>(null);

  const getDisplayToken = (tokenId: string) => {
    // Remove prefix like "token-base-" or "token-solana-"
    const cleanToken = tokenId?.replace(/^token-(base|solana|evm)-/i, "") || "";
    
    // If short enough, show full address
    if (cleanToken.length <= 16) return cleanToken;
    
    // Otherwise show first 6 and last 4 characters
    return `${cleanToken.slice(0, 6)}...${cleanToken.slice(-4)}`;
  };

  const getFullTokenAddress = (tokenId: string) => {
    return tokenId?.replace(/^token-(base|solana|evm)-/i, "") || "";
  };

  const handleCopyToken = async () => {
    const fullAddress = getFullTokenAddress(formData.tokenId);
    await navigator.clipboard.writeText(fullAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getBlockExplorerUrl = (txHash: string) => {
    // For local hardhat, we don't have a block explorer
    // In production, use the appropriate explorer for the chain
    return `https://basescan.org/tx/${txHash}`;
  };

  const handleOpenModal = async () => {
    // Validate before opening modal
    const consignerAddress = activeFamily === "solana" ? solanaPublicKey : evmAddress;

    if (!consignerAddress) {
      alert("Please connect your wallet before creating a consignment");
      return;
    }

    if (!formData.tokenId) {
      alert("Please select a token");
      return;
    }

    if (!formData.amount) {
      alert("Please enter an amount");
      return;
    }

    if (activeFamily === "evm" && !address) {
      alert("Please connect your EVM wallet (Base)");
      return;
    }

    if (activeFamily === "solana" && !solanaPublicKey) {
      alert("Please connect your Solana wallet");
      return;
    }

    // Pre-fetch token information for EVM chains
    if (activeFamily !== "solana") {
      try {
        const fetchedTokenAddress = await getTokenAddress(formData.tokenId);
        const fetchedGasDeposit = await getRequiredGasDeposit();
        setTokenAddress(fetchedTokenAddress);
        setGasDeposit(fetchedGasDeposit);
      } catch (err) {
        alert(`Failed to fetch token information: ${err instanceof Error ? err.message : "Unknown error"}`);
        return;
      }
    }

    setIsModalOpen(true);
  };

  const handleApproveToken = async (): Promise<string> => {
    if (!tokenAddress) throw new Error("Token address not found");
    const txHash = await approveToken(tokenAddress as any, BigInt(formData.amount));
    return txHash as string;
  };

  const handleCreateConsignment = async (): Promise<{ txHash: string; consignmentId: string }> => {
    if (!gasDeposit) throw new Error("Gas deposit not calculated");

    const result: { txHash: `0x${string}`; consignmentId: bigint } = await createConsignmentOnChain({
      tokenId: formData.tokenId,
      amount: BigInt(formData.amount),
      isNegotiable: formData.isNegotiable,
      fixedDiscountBps: formData.fixedDiscountBps ?? 0,
      fixedLockupDays: formData.fixedLockupDays ?? 0,
      minDiscountBps: formData.minDiscountBps,
      maxDiscountBps: formData.maxDiscountBps,
      minLockupDays: formData.minLockupDays,
      maxLockupDays: formData.maxLockupDays,
      minDealAmount: BigInt(formData.minDealAmount),
      maxDealAmount: BigInt(formData.maxDealAmount),
      isFractionalized: formData.isFractionalized,
      isPrivate: formData.isPrivate,
      maxPriceVolatilityBps: formData.maxPriceVolatilityBps,
      maxTimeToExecute: formData.maxTimeToExecuteSeconds,
      gasDeposit,
    });

    return {
      txHash: result.txHash,
      consignmentId: result.consignmentId.toString(),
    };
  };

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <span className="text-zinc-600 dark:text-zinc-400">Token:</span>
          <div className="flex items-center gap-2">
            <span className="font-medium font-mono text-sm">
              {getDisplayToken(formData.tokenId)}
            </span>
            <button
              onClick={handleCopyToken}
              className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors"
              title="Copy token address"
            >
              {copied ? (
                <Check className="w-4 h-4 text-green-600" />
              ) : (
                <Copy className="w-4 h-4 text-zinc-600 dark:text-zinc-400" />
              )}
            </button>
          </div>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-600 dark:text-zinc-400">Amount:</span>
          <span className="font-medium">{formData.amount}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-600 dark:text-zinc-400">Type:</span>
          <span className="font-medium">
            {formData.isNegotiable ? "Negotiable" : "Fixed Price"}
          </span>
        </div>
        {formData.isNegotiable ? (
          <>
            <div className="flex justify-between">
              <span className="text-zinc-600 dark:text-zinc-400">
                Discount Range:
              </span>
              <span className="font-medium">
                {formData.minDiscountBps / 100}% -{" "}
                {formData.maxDiscountBps / 100}%
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-600 dark:text-zinc-400">
                Lockup Range:
              </span>
              <span className="font-medium">
                {formData.minLockupDays} - {formData.maxLockupDays} days
              </span>
            </div>
          </>
        ) : (
          <>
            <div className="flex justify-between">
              <span className="text-zinc-600 dark:text-zinc-400">
                Fixed Discount:
              </span>
              <span className="font-medium">
                {formData.fixedDiscountBps / 100}%
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-600 dark:text-zinc-400">
                Fixed Lockup:
              </span>
              <span className="font-medium">
                {formData.fixedLockupDays} days
              </span>
            </div>
          </>
        )}
        <div className="flex justify-between">
          <span className="text-zinc-600 dark:text-zinc-400">
            Deal Size Range:
          </span>
          <span className="font-medium">
            {formData.minDealAmount} - {formData.maxDealAmount}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-600 dark:text-zinc-400">
            Fractionalized:
          </span>
          <span className="font-medium">
            {formData.isFractionalized ? "Yes" : "No"}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-600 dark:text-zinc-400">Visibility:</span>
          <span className="font-medium">
            {formData.isPrivate ? "Private" : "Public"}
          </span>
        </div>
      </div>

      <div className="flex gap-4">
        <Button
          onClick={onBack}
          color="zinc"
          className="flex-1 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 !py-2 !px-4"
        >
          Back
        </Button>
        {formData.tokenId && requiredChain && !isConnectedToRequiredChain ? (
          <Button 
            onClick={requiredChain === "solana" ? onConnectSolana : onConnectBase}
            className={`flex-1 !py-2 !px-4 text-white ${
              requiredChain === "solana"
                ? "bg-gradient-to-br from-[#9945FF] to-[#14F195] hover:opacity-90"
                : "bg-[#0052ff] hover:bg-[#0047e5]"
            }`}
          >
            Connect to {requiredChain === "solana" ? "Solana" : "Base"}
          </Button>
        ) : (
          <Button 
            onClick={handleOpenModal} 
            color="blue" 
            className="flex-1 bg-orange-500 hover:bg-orange-600 !py-2 !px-4"
          >
            Create
          </Button>
        )}
      </div>

      {/* Submission Modal */}
      <SubmissionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        formData={formData}
        consignerAddress={activeFamily === "solana" ? solanaPublicKey || "" : evmAddress || ""}
        chain={activeFamily === "solana" ? "solana" : "base"}
        activeFamily={activeFamily as string}
        onApproveToken={handleApproveToken}
        onCreateConsignment={handleCreateConsignment}
        getBlockExplorerUrl={getBlockExplorerUrl}
      />
    </div>
  );
}
