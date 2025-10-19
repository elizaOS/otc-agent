"use client";

import { Button } from "../button";

interface StepProps {
  formData: any;
  updateFormData: (updates: any) => void;
  onNext: () => void;
  onBack: () => void;
  requiredChain?: "evm" | "solana" | null;
  isConnectedToRequiredChain?: boolean;
  onConnectEvm?: () => void;
  onConnectSolana?: () => void;
}

export function AmountStep({
  formData,
  updateFormData,
  onNext,
  onBack,
  requiredChain,
  isConnectedToRequiredChain,
  onConnectEvm,
  onConnectSolana,
}: StepProps) {
  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium mb-2">
          Total Amount to Consign
        </label>
        <input
          type="text"
          value={formData.amount}
          onChange={(e) => updateFormData({ amount: e.target.value })}
          placeholder="Enter amount (e.g., 1000000)"
          className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900"
        />
        <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
          Enter the total number of tokens you want to make available for OTC
          deals
        </p>
      </div>

      <div className="flex gap-4">
        <Button onClick={onBack} color="zinc" className="flex-1 !py-2 bg-zinc-800 text-white border-zinc-700">
          Back
        </Button>
        {formData.tokenId && requiredChain && !isConnectedToRequiredChain ? (
          <Button
            onClick={requiredChain === "solana" ? onConnectSolana : onConnectEvm}
            disabled={!formData.amount}
            className={`flex-1 !py-2 text-white rounded-lg ${
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
            disabled={!formData.amount}
            className="flex-1 !py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg "
          >
            Next
          </Button>
        )}
      </div>
    </div>
  );
}
