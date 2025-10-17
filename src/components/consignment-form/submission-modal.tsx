"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Check, X, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "../button";

interface SubmissionStep {
  id: string;
  label: string;
  status: "pending" | "processing" | "complete" | "error";
  errorMessage?: string;
  txHash?: string;
  canRetry?: boolean;
}

interface SubmissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  formData: any;
  consignerAddress: string;
  chain: string;
  activeFamily: string;
  onApproveToken: () => Promise<string>;
  onCreateConsignment: () => Promise<{ txHash: string; consignmentId: string }>;
  getBlockExplorerUrl: (txHash: string) => string;
}

export function SubmissionModal({
  isOpen,
  onClose,
  formData,
  consignerAddress,
  chain,
  activeFamily,
  onApproveToken,
  onCreateConsignment,
  getBlockExplorerUrl,
}: SubmissionModalProps) {
  const router = useRouter();
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [contractConsignmentId, setContractConsignmentId] = useState<string | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [hasStartedProcessing, setHasStartedProcessing] = useState(false);
  const [steps, setSteps] = useState<SubmissionStep[]>([
    ...(activeFamily !== "solana" ? [
      {
        id: "approve",
        label: "Approve Token Transfer",
        status: "pending" as const,
        canRetry: true,
      },
      {
        id: "create-onchain",
        label: "Create Consignment On-Chain",
        status: "pending" as const,
        canRetry: true,
      },
    ] : []),
    {
      id: "save-db",
      label: "Save to Database",
      status: "pending" as const,
      canRetry: true,
    },
  ]);

  useEffect(() => {
    if (isOpen && !isComplete && !hasStartedProcessing) {
      // Start the submission process
      setHasStartedProcessing(true);
      processNextStep();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const updateStep = (id: string, updates: Partial<SubmissionStep>) => {
    setSteps((prev) =>
      prev.map((step) => (step.id === id ? { ...step, ...updates } : step))
    );
  };

  const processNextStep = async () => {
    const currentStep = steps[currentStepIndex];
    if (!currentStep) return;

    updateStep(currentStep.id, { status: "processing" });

    try {
      switch (currentStep.id) {
        case "approve":
          await handleApprove();
          break;
        case "create-onchain":
          await handleCreateOnchain();
          break;
        case "save-db":
          await handleSaveToDb();
          break;
      }

      updateStep(currentStep.id, { status: "complete" });

      // Move to next step
      if (currentStepIndex < steps.length - 1) {
        setCurrentStepIndex(currentStepIndex + 1);
        setTimeout(() => processNextStep(), 500);
      } else {
        // All steps complete
        await handleComplete();
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      updateStep(currentStep.id, {
        status: "error",
        errorMessage,
      });
    }
  };

  const handleApprove = async () => {
    try {
      const txHash = await onApproveToken();
      updateStep("approve", { txHash });
    } catch (error) {
      if (error instanceof Error && error.message.includes("rejected")) {
        throw new Error("Token approval was rejected. Click retry to try again.");
      }
      throw error;
    }
  };

  const handleCreateOnchain = async () => {
    try {
      const result = await onCreateConsignment();
      setContractConsignmentId(result.consignmentId);
      updateStep("create-onchain", { txHash: result.txHash });
    } catch (error) {
      if (error instanceof Error && error.message.includes("rejected")) {
        throw new Error("Consignment creation was rejected. Your token approval is still active. Click retry to try again.");
      }
      throw error;
    }
  };

  const handleSaveToDb = async () => {
    try {
      const response = await fetch("/api/consignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          consignerAddress,
          chain,
          contractConsignmentId,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(data.error || "Failed to save to database");
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to save to database");
      }
    } catch (error) {
      if (contractConsignmentId) {
        throw new Error(
          `Your consignment is on-chain (ID: ${contractConsignmentId}) but failed to save to our database. Click retry to try saving again.`
        );
      }
      throw error;
    }
  };

  const handleComplete = async () => {
    setIsComplete(true);
    // Wait 2 seconds to show success, then navigate
    setTimeout(() => {
      router.push(`/my-deals?tab=listings`);
      onClose();
    }, 2000);
  };

  const retryStep = async (stepId: string) => {
    const stepIndex = steps.findIndex((s) => s.id === stepId);
    if (stepIndex === -1) return;

    setCurrentStepIndex(stepIndex);
    updateStep(stepId, { status: "pending", errorMessage: undefined });
    setTimeout(() => processNextStep(), 300);
  };

  const handleCancel = () => {
    const hasStartedOnchainWork = steps.some(
      (step) => (step.id === "approve" || step.id === "create-onchain") && step.status === "complete"
    );

    if (hasStartedOnchainWork && !isComplete) {
      if (!confirm("You've already submitted transactions on-chain. Are you sure you want to close? You can retry later if needed.")) {
        return;
      }
    }

    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 p-6 flex items-center justify-between">
          <h2 className="text-xl font-semibold">
            {isComplete ? "Consignment Created" : "Creating Consignment"}
          </h2>
          {!isComplete && (
            <button
              onClick={handleCancel}
              className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Steps */}
        <div className="p-6 space-y-4">
          {steps.map((step, index) => (
            <div
              key={step.id}
              className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-4"
            >
              <div className="flex items-start gap-3">
                {/* Status Icon */}
                <div className="flex-shrink-0 mt-0.5">
                  {step.status === "complete" ? (
                    <div className="w-6 h-6 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                      <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
                    </div>
                  ) : step.status === "processing" ? (
                    <div className="w-6 h-6 flex items-center justify-center">
                      <Loader2 className="w-5 h-5 text-orange-500 animate-spin" />
                    </div>
                  ) : step.status === "error" ? (
                    <div className="w-6 h-6 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                      <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
                    </div>
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                      <span className="text-xs text-zinc-500">{index + 1}</span>
                    </div>
                  )}
                </div>

                {/* Step Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-medium text-sm">{step.label}</h3>
                    {step.status === "error" && step.canRetry && (
                      <Button
                        onClick={() => retryStep(step.id)}
                        color="blue"
                        className="!py-1 !px-3 !text-xs bg-orange-500 hover:bg-orange-600"
                      >
                        Retry
                      </Button>
                    )}
                  </div>

                  {/* Transaction Hash */}
                  {step.txHash && (
                    <a
                      href={getBlockExplorerUrl(step.txHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 dark:text-blue-400 hover:underline break-all mt-1 block"
                    >
                      View transaction
                    </a>
                  )}

                  {/* Error Message */}
                  {step.errorMessage && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-2">
                      {step.errorMessage}
                    </p>
                  )}

                  {/* Status Text */}
                  {step.status === "processing" && (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                      Please confirm in your wallet...
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}

          {/* Success Message */}
          {isComplete && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
              <div className="flex items-center gap-2">
                <Check className="w-5 h-5 text-green-600 dark:text-green-400" />
                <div>
                  <p className="font-medium text-green-900 dark:text-green-100">
                    Success
                  </p>
                  <p className="text-sm text-green-700 dark:text-green-300">
                    Your consignment has been created. Redirecting to your deals...
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {isComplete && (
          <div className="border-t border-zinc-200 dark:border-zinc-800 p-6">
            <Button
              onClick={() => {
                router.push(`/my-deals?tab=listings`);
                onClose();
              }}
              color="blue"
              className="w-full bg-orange-500 hover:bg-orange-600"
            >
              Go to My Deals
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

