"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { useMultiWallet } from "@/components/multiwallet";

const TokenSelectionStep = dynamic(
  () =>
    import("@/components/consignment-form/token-selection-step").then(
      (m) => m.TokenSelectionStep,
    ),
  { ssr: false },
);
const AmountStep = dynamic(
  () =>
    import("@/components/consignment-form/amount-step").then(
      (m) => m.AmountStep,
    ),
  { ssr: false },
);
const NegotiationParamsStep = dynamic(
  () =>
    import("@/components/consignment-form/negotiation-params-step").then(
      (m) => m.NegotiationParamsStep,
    ),
  { ssr: false },
);
const DealStructureStep = dynamic(
  () =>
    import("@/components/consignment-form/deal-structure-step").then(
      (m) => m.DealStructureStep,
    ),
  { ssr: false },
);
const ReviewStep = dynamic(
  () =>
    import("@/components/consignment-form/review-step").then(
      (m) => m.ReviewStep,
    ),
  { ssr: false },
);

export default function ConsignPageClient() {
  const {
    isConnected,
    activeFamily,
    setActiveFamily,
    login,
    connectSolanaWallet,
    isPhantomInstalled,
  } = useMultiWallet();
  
  const [step, setStep] = useState(1);
  
  const [formData, setFormData] = useState({
    tokenId: "",
    amount: "",
    isNegotiable: true,
    fixedDiscountBps: 1000,
    fixedLockupDays: 180,
    minDiscountBps: 500,
    maxDiscountBps: 2000,
    minLockupDays: 7,
    maxLockupDays: 730,
    minDealAmount: "1000",
    maxDealAmount: "100000",
    isFractionalized: true,
    isPrivate: false,
    maxPriceVolatilityBps: 1000,
    maxTimeToExecuteSeconds: 1800,
  });

  const updateFormData = (updates: Partial<typeof formData>) => {
    setFormData((prev) => ({ ...prev, ...updates }));
  };

  const handleNext = () => {
    if (step < 5) {
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const getRequiredChain = (tokenId: string): "evm" | "solana" | null => {
    if (!tokenId) return null;
    if (tokenId.includes("solana")) return "solana";
    if (tokenId.includes("base") || tokenId.includes("evm")) return "evm";
    return null;
  };

  const handleConnectBase = () => {
    setActiveFamily("evm");
    if (!isConnected) {
      login();
    }
  };

  const handleConnectSolana = () => {
    if (!isPhantomInstalled) {
      window.open("https://phantom.app/", "_blank");
      return null;
    }
    setActiveFamily("solana");
    if (!isConnected) {
      connectSolanaWallet();
    }
    return null;
  };

  // Check if wallet is connected for the required chain
  const requiredChain = getRequiredChain(formData.tokenId);
  const isConnectedToRequiredChain = requiredChain
    ? requiredChain === "solana"
      ? activeFamily === "solana" && isConnected
      : activeFamily === "evm" && isConnected
    : isConnected;

  return (
    <main className="flex-1 px-3 sm:px-4 md:px-6 py-4 sm:py-6 md:py-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl sm:text-3xl font-bold mb-2">
          List Your Tokens for OTC
        </h1>
        <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400 mb-4">
          Create a consignment to sell your tokens at a discount with a lockup
          period
        </p>

        {/* Progress indicator */}
        <div className="mb-6 sm:mb-8">
          <div className="flex justify-between items-center mb-2">
            {[1, 2, 3, 4, 5].map((s) => (
              <div
                key={s}
                className={`w-full h-1.5 sm:h-2 ${
                  s <= step
                    ? "bg-orange-500"
                    : "bg-zinc-200 dark:bg-zinc-800"
                } ${s < 5 ? "mr-1 sm:mr-2" : ""} rounded-full`}
              />
            ))}
          </div>
          <div className="flex justify-between text-xs text-zinc-600 dark:text-zinc-400">
            <span>Token</span>
            <span>Amount</span>
            <span>Pricing</span>
            <span>Structure</span>
            <span>Review</span>
          </div>
        </div>

        {/* Form steps */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 sm:p-6">
          {step === 1 && (
            <TokenSelectionStep
              formData={formData}
              updateFormData={updateFormData}
              onNext={handleNext}
              onBack={handleBack}
            />
          )}
          {step === 2 && (
            <AmountStep
              formData={formData}
              updateFormData={updateFormData}
              onNext={handleNext}
              onBack={handleBack}
            />
          )}
          {step === 3 && (
            <NegotiationParamsStep
              formData={formData}
              updateFormData={updateFormData}
              onNext={handleNext}
              onBack={handleBack}
            />
          )}
          {step === 4 && (
            <DealStructureStep
              formData={formData}
              updateFormData={updateFormData}
              onNext={handleNext}
              onBack={handleBack}
            />
          )}
          {step === 5 && (
            <ReviewStep
              formData={formData}
              updateFormData={updateFormData}
              onNext={handleNext}
              onBack={handleBack}
              requiredChain={requiredChain}
              isConnectedToRequiredChain={isConnectedToRequiredChain}
              onConnectBase={handleConnectBase}
              onConnectSolana={handleConnectSolana}
            />
          )}
        </div>
      </div>
    </main>
  );
}

