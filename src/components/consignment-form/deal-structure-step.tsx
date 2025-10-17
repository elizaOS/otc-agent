"use client";

import { Button } from "../button";

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

export function DealStructureStep({
  formData,
  updateFormData,
  onNext,
  onBack,
  requiredChain,
  isConnectedToRequiredChain,
  onConnectBase,
  onConnectSolana,
}: StepProps) {
  const walletBalance = formData.amount ? parseFloat(formData.amount) : 0;

  const setPercentageAmount = (percentage: number) => {
    const amount = Math.floor(walletBalance * percentage).toString();
    if (formData.isFractionalized) {
      updateFormData({ maxDealAmount: amount });
    } else {
      updateFormData({ 
        dealAmount: amount,
        minDealAmount: amount,
        maxDealAmount: amount
      });
    }
  };

  const isValid = formData.isFractionalized
    ? formData.minDealAmount && formData.maxDealAmount && 
      parseFloat(formData.minDealAmount) > 0 && 
      parseFloat(formData.maxDealAmount) > 0 &&
      parseFloat(formData.minDealAmount) <= parseFloat(formData.maxDealAmount)
    : formData.dealAmount && parseFloat(formData.dealAmount) > 0;

  const renderPercentageButtons = () => {
    if (walletBalance <= 0) return null;
    
    return (
      <div className="flex gap-2 mt-3">
        <button
          type="button"
          onClick={() => setPercentageAmount(0.25)}
          className="flex-1 px-4 py-2 rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-sm font-medium transition-colors"
        >
          25%
        </button>
        <button
          type="button"
          onClick={() => setPercentageAmount(0.5)}
          className="flex-1 px-4 py-2 rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-sm font-medium transition-colors"
        >
          50%
        </button>
        <button
          type="button"
          onClick={() => setPercentageAmount(1)}
          className="flex-1 px-4 py-2 rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-sm font-medium transition-colors"
        >
          Max
        </button>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={formData.isFractionalized}
            onChange={(e) =>
              updateFormData({ isFractionalized: e.target.checked })
            }
            className="rounded"
          />
          <span className="font-medium">Allow Fractionalized Deals</span>
        </label>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 ml-6 mt-1">
          Allow multiple buyers to purchase portions of your consignment
        </p>
      </div>

      {formData.isFractionalized ? (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Minimum Deal Amount
              </label>
              <input
                type="text"
                value={formData.minDealAmount}
                onChange={(e) => updateFormData({ minDealAmount: e.target.value })}
                placeholder="e.g., 1000"
                className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">
                Maximum Deal Amount
              </label>
              <input
                type="text"
                value={formData.maxDealAmount}
                onChange={(e) => updateFormData({ maxDealAmount: e.target.value })}
                placeholder="e.g., 100000"
                className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800"
              />
            </div>
          </div>
          {renderPercentageButtons()}
        </>
      ) : (
        <div>
          <label className="block text-sm font-medium mb-2">
            Token Amount
          </label>
          <input
            type="text"
            value={formData.dealAmount || ""}
            onChange={(e) => {
              const amount = e.target.value;
              updateFormData({ 
                dealAmount: amount,
                minDealAmount: amount,
                maxDealAmount: amount
              });
            }}
            placeholder="Enter amount"
            className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800"
          />
          {renderPercentageButtons()}
        </div>
      )}

      <div>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={formData.isPrivate}
            onChange={(e) => updateFormData({ isPrivate: e.target.checked })}
            className="rounded"
          />
          <span className="font-medium">Private Listing</span>
        </label>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 ml-6 mt-1">
          Hide from public marketplace
        </p>
      </div>

      {formData.isPrivate && (
        <div>
          <label className="block text-sm font-medium mb-2">
            Allowed Buyers (comma-separated addresses)
          </label>
          <textarea
            value={formData.allowedBuyers.join(", ")}
            onChange={(e) =>
              updateFormData({
                allowedBuyers: e.target.value
                  .split(",")
                  .map((a) => a.trim())
                  .filter((a) => a),
              })
            }
            placeholder="0x123..., 0x456..."
            className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 h-24"
          />
        </div>
      )}

      <div className="flex gap-4">
        <Button 
          onClick={onBack} 
          color="zinc" 
          className="flex-1 px-6 py-3 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700"
        >
          Back
        </Button>
        {formData.tokenId && requiredChain && !isConnectedToRequiredChain ? (
          <Button
            onClick={requiredChain === "solana" ? onConnectSolana : onConnectBase}
            disabled={!isValid}
            className={`flex-1 px-6 py-3 disabled:bg-zinc-300 dark:disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-medium transition-colors ${
              requiredChain === "solana"
                ? "bg-gradient-to-br from-[#9945FF] to-[#14F195] hover:opacity-90"
                : "bg-[#0052ff] hover:bg-[#0047e5]"
            }`}
          >
            Connect to {requiredChain === "solana" ? "Solana" : "Base"}
          </Button>
        ) : (
          <Button
            onClick={onNext}
            disabled={!isValid}
            className="flex-1 px-6 py-3 bg-orange-500 hover:bg-orange-600 disabled:bg-zinc-300 dark:disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-medium transition-colors"
          >
            Next
          </Button>
        )}
      </div>
    </div>
  );
}
