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

export function NegotiationParamsStep({
  formData,
  updateFormData,
  onNext,
  onBack,
  requiredChain,
  isConnectedToRequiredChain,
  onConnectBase,
  onConnectSolana,
}: StepProps) {
  const minDiscountInvalid = !formData.minDiscountBps || formData.minDiscountBps <= 0;
  const maxDiscountInvalid = !formData.maxDiscountBps || formData.maxDiscountBps <= 0;
  const discountRangeInvalid = formData.minDiscountBps > formData.maxDiscountBps;
  
  const minLockupInvalid = !formData.minLockupDays || formData.minLockupDays <= 0;
  const maxLockupInvalid = !formData.maxLockupDays || formData.maxLockupDays <= 0;
  const lockupRangeInvalid = formData.minLockupDays > formData.maxLockupDays;
  
  const fixedDiscountInvalid = !formData.fixedDiscountBps || formData.fixedDiscountBps <= 0;
  const fixedLockupInvalid = !formData.fixedLockupDays || formData.fixedLockupDays <= 0;

  return (
    <div className="space-y-6">
      <div>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={formData.isNegotiable}
            onChange={(e) => updateFormData({ isNegotiable: e.target.checked })}
            className="rounded"
          />
          <span className="font-medium">Allow Negotiation</span>
        </label>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 ml-6 mt-1">
          If checked, buyers can negotiate within your specified ranges
        </p>
      </div>

      {formData.isNegotiable ? (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Min Discount (%)
              </label>
              <input
                type="number"
                value={formData.minDiscountBps / 100}
                onChange={(e) =>
                  updateFormData({
                    minDiscountBps: Number(e.target.value) * 100,
                  })
                }
                className={`w-full px-4 py-2 rounded-lg border ${
                  minDiscountInvalid || discountRangeInvalid
                    ? "border-red-500 dark:border-red-500"
                    : "border-zinc-200 dark:border-zinc-800"
                }`}
              />
              {(minDiscountInvalid || discountRangeInvalid) && (
                <p className="text-xs text-red-500 mt-1">
                  {minDiscountInvalid ? "Must be greater than 0" : "Must be ≤ max discount"}
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">
                Max Discount (%)
              </label>
              <input
                type="number"
                value={formData.maxDiscountBps / 100}
                onChange={(e) =>
                  updateFormData({
                    maxDiscountBps: Number(e.target.value) * 100,
                  })
                }
                className={`w-full px-4 py-2 rounded-lg border ${
                  maxDiscountInvalid || discountRangeInvalid
                    ? "border-red-500 dark:border-red-500"
                    : "border-zinc-200 dark:border-zinc-800"
                }`}
              />
              {(maxDiscountInvalid || discountRangeInvalid) && (
                <p className="text-xs text-red-500 mt-1">
                  {maxDiscountInvalid ? "Must be greater than 0" : "Must be ≥ min discount"}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Min Lockup (days)
              </label>
              <input
                type="number"
                value={formData.minLockupDays}
                onChange={(e) =>
                  updateFormData({ minLockupDays: Number(e.target.value) })
                }
                className={`w-full px-4 py-2 rounded-lg border ${
                  minLockupInvalid || lockupRangeInvalid
                    ? "border-red-500 dark:border-red-500"
                    : "border-zinc-200 dark:border-zinc-800"
                }`}
              />
              {(minLockupInvalid || lockupRangeInvalid) && (
                <p className="text-xs text-red-500 mt-1">
                  {minLockupInvalid ? "Must be greater than 0" : "Must be ≤ max lockup"}
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">
                Max Lockup (days)
              </label>
              <input
                type="number"
                value={formData.maxLockupDays}
                onChange={(e) =>
                  updateFormData({ maxLockupDays: Number(e.target.value) })
                }
                className={`w-full px-4 py-2 rounded-lg border ${
                  maxLockupInvalid || lockupRangeInvalid
                    ? "border-red-500 dark:border-red-500"
                    : "border-zinc-200 dark:border-zinc-800"
                }`}
              />
              {(maxLockupInvalid || lockupRangeInvalid) && (
                <p className="text-xs text-red-500 mt-1">
                  {maxLockupInvalid ? "Must be greater than 0" : "Must be ≥ min lockup"}
                </p>
              )}
            </div>
          </div>
        </>
      ) : (
        <>
          <div>
            <label className="block text-sm font-medium mb-2">
              Fixed Discount (%)
            </label>
            <input
              type="number"
              value={formData.fixedDiscountBps / 100}
              onChange={(e) =>
                updateFormData({
                  fixedDiscountBps: Number(e.target.value) * 100,
                })
              }
              className={`w-full px-4 py-2 rounded-lg border ${
                fixedDiscountInvalid
                  ? "border-red-500 dark:border-red-500"
                  : "border-zinc-200 dark:border-zinc-800"
              }`}
            />
            {fixedDiscountInvalid && (
              <p className="text-xs text-red-500 mt-1">Must be greater than 0</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Fixed Lockup (days)
            </label>
            <input
              type="number"
              value={formData.fixedLockupDays}
              onChange={(e) =>
                updateFormData({ fixedLockupDays: Number(e.target.value) })
              }
              className={`w-full px-4 py-2 rounded-lg border ${
                fixedLockupInvalid
                  ? "border-red-500 dark:border-red-500"
                  : "border-zinc-200 dark:border-zinc-800"
              }`}
            />
            {fixedLockupInvalid && (
              <p className="text-xs text-red-500 mt-1">Must be greater than 0</p>
            )}
          </div>
        </>
      )}

      <div className="flex gap-4">
        <Button
          onClick={onBack}
          color="zinc"
          className="flex-1 bg-zinc-800 text-white border-zinc-700 !py-2"
        >
          Back
        </Button>
        {formData.tokenId && requiredChain && !isConnectedToRequiredChain ? (
          <Button
            onClick={requiredChain === "solana" ? onConnectSolana : onConnectBase}
            disabled={
              !formData.minDiscountBps ||
              !formData.maxDiscountBps ||
              !formData.minLockupDays ||
              !formData.maxLockupDays ||
              !formData.fixedDiscountBps ||
              !formData.fixedLockupDays
            }
            className={`flex-1 !py-2 text-white rounded-lg ${
              requiredChain === "solana"
                ? "bg-gradient-to-br from-[#9945FF] to-[#14F195] hover:opacity-90"
                : "bg-[#0052ff] hover:bg-[#0047e5]"
            }`}
          >
            Connect to {requiredChain === "solana" ? "Solana" : "Base"}
          </Button>
        ) : (
          <Button
            disabled={
              !formData.minDiscountBps ||
              !formData.maxDiscountBps ||
              !formData.minLockupDays ||
              !formData.maxLockupDays ||
              !formData.fixedDiscountBps ||
              !formData.fixedLockupDays
            }
            onClick={onNext}
            className="flex-1 bg-orange-500 hover:bg-orange-600 text-white rounded-lg !py-2"
          >
            Next
          </Button>
        )}
      </div>
    </div>
  );
}
